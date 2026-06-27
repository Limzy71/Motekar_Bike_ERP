import { Request, Response } from 'express';
import pool from '../config/database.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../helpers/asyncHandler.js';

/**
 * Controller untuk Modul Finance (Accounts Payable)
 */

// ============================================================
// [GET] /api/finance/ap/pending-receipts
// Mengambil data Goods Receipt yang belum ditagihkan (belum ada di tagihan_vendor)
// ============================================================
export const getPendingReceipts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const [rows] = await pool.query(`
    SELECT pb.id as id_penerimaan, pb.id_po_header, po.nomor_po, po.status as po_status, 
           v.nama_vendor, pb.tanggal_terima, pb.surat_jalan_vendor,
           (SELECT SUM(dp.qty_diterima) FROM detail_penerimaan dp WHERE dp.id_penerimaan = pb.id) as total_qty_terima
    FROM penerimaan_barang pb
    JOIN pengadaan_po_header po ON pb.id_po_header = po.id
    JOIN master_vendor v ON po.id_vendor = v.id
    WHERE pb.id NOT IN (SELECT id_penerimaan FROM tagihan_vendor)
    ORDER BY pb.tanggal_terima ASC
  `);
  res.json({ success: true, data: rows });
});

// ============================================================
// [GET] /api/finance/ap/invoices
// Mengambil semua daftar tagihan
// ============================================================
export const getAllInvoices = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const [rows] = await pool.query(`
    SELECT tv.id, tv.no_tagihan_vendor, po.nomor_po, v.nama_vendor, 
           tv.tanggal_tagihan, tv.jatuh_tempo, tv.total_tagihan, tv.status,
           (SELECT IFNULL(SUM(nominal_bayar), 0) FROM pembayaran_vendor WHERE id_tagihan = tv.id) as total_dibayar
    FROM tagihan_vendor tv
    JOIN pengadaan_po_header po ON tv.id_po_header = po.id
    JOIN master_vendor v ON po.id_vendor = v.id
    ORDER BY tv.created_at DESC
  `);
  res.json({ success: true, data: rows });
});

// ============================================================
// [POST] /api/finance/ap/invoice
// Membuat tagihan AP dari Goods Receipt (3-Way Matching)
// ============================================================
export const createInvoice = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { no_tagihan_vendor, id_po_header, id_penerimaan, tanggal_tagihan, jatuh_tempo, total_tagihan } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Validasi bahwa PO berstatus COMPLETED
    const [poRows]: any = await connection.query('SELECT status FROM pengadaan_po_header WHERE id = ? FOR UPDATE', [id_po_header]);
    if (poRows.length === 0) throw new AppError('Purchase Order tidak ditemukan.', 404);
    if (poRows[0].status !== 'COMPLETED') throw new AppError('PO belum komplit. Tidak dapat membuat tagihan.', 400);

    // 2. 3-Way Matching (Kalkulasi Sistem vs Tagihan Vendor)
    // Hitung expected total: SUM(qty_diterima * harga_satuan) dari detail penerimaan join PO detail
    const [matchRows]: any = await connection.query(`
      SELECT SUM(dp.qty_diterima * pd.harga_satuan) as expected_total
      FROM detail_penerimaan dp
      JOIN pengadaan_po_detail pd ON pd.id_po_header = ? AND pd.id_inventory_material = dp.id_inventory_material
      WHERE dp.id_penerimaan = ?
    `, [id_po_header, id_penerimaan]);

    const expectedTotal = parseFloat(matchRows[0].expected_total || 0);
    const vendorTotal = parseFloat(total_tagihan);

    // Beda nilai lebih dari toleransi (misal toleransi 1 rupiah untuk pembulatan desimal)
    if (Math.abs(expectedTotal - vendorTotal) > 1.00) {
      throw new AppError('Tolak Tagihan: Three-Way Match Gagal. Nilai tagihan vendor (Rp' + vendorTotal + ') tidak sama dengan kalkulasi penerimaan (Rp' + expectedTotal + ').', 400);
    }

    // 3. Insert Tagihan
    await connection.query(
      'INSERT INTO tagihan_vendor (no_tagihan_vendor, id_po_header, id_penerimaan, tanggal_tagihan, jatuh_tempo, total_tagihan, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [no_tagihan_vendor, id_po_header, id_penerimaan, tanggal_tagihan, jatuh_tempo, vendorTotal, 'UNPAID']
    );

    await connection.commit();
    res.status(201).json({ success: true, message: 'Tagihan AP berhasil dibuat (Three-Way Match OK).' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

// ============================================================
// [POST] /api/finance/ap/pay
// Memproses pembayaran tagihan
// ============================================================
export const payInvoice = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id_tagihan, tanggal_bayar, nominal_bayar, metode_bayar, referensi_transaksi } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Ambil data tagihan
    const [tagihanRows]: any = await connection.query('SELECT total_tagihan, status FROM tagihan_vendor WHERE id = ? FOR UPDATE', [id_tagihan]);
    if (tagihanRows.length === 0) throw new AppError('Tagihan tidak ditemukan.', 404);
    if (tagihanRows[0].status === 'PAID') throw new AppError('Tagihan ini sudah lunas.', 400);

    const totalTagihan = parseFloat(tagihanRows[0].total_tagihan);

    // 2. Hitung total yang sudah dibayar
    const [pembayaranRows]: any = await connection.query('SELECT SUM(nominal_bayar) as total_dibayar FROM pembayaran_vendor WHERE id_tagihan = ?', [id_tagihan]);
    const totalDibayar = parseFloat(pembayaranRows[0].total_dibayar || 0);
    const nominalBayar = parseFloat(nominal_bayar);
    const sisaTagihan = totalTagihan - totalDibayar;

    if (nominalBayar > sisaTagihan + 1.00) { // Toleransi pembulatan
      throw new AppError('Nominal pembayaran (Rp' + nominalBayar + ') melebihi sisa tagihan (Rp' + sisaTagihan + ').', 400);
    }

    // 3. Insert Pembayaran
    await connection.query(
      'INSERT INTO pembayaran_vendor (id_tagihan, tanggal_bayar, nominal_bayar, metode_bayar, referensi_transaksi) VALUES (?, ?, ?, ?, ?)',
      [id_tagihan, tanggal_bayar, nominalBayar, metode_bayar, referensi_transaksi || null]
    );

    // 4. Update Status Tagihan
    let newStatus = 'PARTIAL';
    if (Math.abs(sisaTagihan - nominalBayar) <= 1.00) { // Jika sisa <= 1 rupiah, anggap lunas
      newStatus = 'PAID';
    }

    await connection.query('UPDATE tagihan_vendor SET status = ? WHERE id = ?', [newStatus, id_tagihan]);

    await connection.commit();
    res.status(201).json({ success: true, message: 'Pembayaran tagihan AP berhasil dicatat.' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});
