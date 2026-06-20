import { Request, Response } from 'express';
import pool from '../config/database.js';
import { calculateHPP, insertJurnal } from './keuanganController.js';

/**
 * Controller untuk Modul Penjualan & Penagihan (Order-to-Cash & Soft Allocation).
 */

// ============================================================
// [GET] /api/penjualan — Ambil semua Sales Order
// ============================================================
export const getAllSO = async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query(
      'SELECT id, no_so, nama_customer, kode_sepeda, qty, total_harga, tanggal_order, status FROM penjualan_so ORDER BY created_at DESC'
    );
    res.json({
      success: true,
      data: rows
    });
  } catch (error: any) {
    console.error('[getAllSO] Error:', error);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};

// ============================================================
// [POST] /api/penjualan — Buat Sales Order Baru (Draft)
// ============================================================
export const createSO = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nama_customer, kode_sepeda, qty, total_harga } = req.body;

    if (!nama_customer || !kode_sepeda || !qty || !total_harga) {
      res.status(400).json({ success: false, message: 'Mohon lengkapi seluruh field SO.' });
      return;
    }

    const parsedQty = parseInt(qty, 10);
    const parsedHarga = parseFloat(total_harga);

    if (isNaN(parsedQty) || parsedQty <= 0) {
      res.status(400).json({ success: false, message: 'Jumlah barang (qty) harus lebih dari 0.' });
      return;
    }

    if (isNaN(parsedHarga) || parsedHarga < 0) {
      res.status(400).json({ success: false, message: 'Total harga tidak valid.' });
      return;
    }

    // Generate Nomor SO otomatis
    const noSO = `SO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    await pool.query(
      'INSERT INTO penjualan_so (no_so, nama_customer, kode_sepeda, qty, total_harga, status) VALUES (?, ?, ?, ?, ?, ?)',
      [noSO, nama_customer.trim(), kode_sepeda.trim(), parsedQty, parsedHarga, 'Draft']
    );

    res.status(201).json({
      success: true,
      message: 'Sales Order (Draft) berhasil dibuat.'
    });

  } catch (error: any) {
    console.error('[createSO] Error:', error);
    res.status(500).json({ success: false, message: `Gagal membuat SO: ${error.message}` });
  }
};

// ============================================================
// [PATCH] /api/penjualan/:id/confirm — Konfirmasi & Lock Stok
// ============================================================
export const confirmSO = async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const soId = parseInt(id, 10);

    if (isNaN(soId)) {
      res.status(400).json({ success: false, message: 'ID SO tidak valid.' });
      connection.release();
      return;
    }

    await connection.beginTransaction();

    // 1. Ambil data SO dan pastikan status Draft
    const [soData]: any = await connection.query(
      'SELECT id, kode_sepeda, qty, status FROM penjualan_so WHERE id = ? FOR UPDATE',
      [soId]
    );

    if (soData.length === 0) {
      throw new Error('Sales Order tidak ditemukan.');
    }

    const so = soData[0];
    if (so.status !== 'Draft') {
      throw new Error(`SO berstatus ${so.status}, hanya Draft yang bisa dikonfirmasi.`);
    }

    // 2. Ambil data stok gudang
    const [stokData]: any = await connection.query(
      'SELECT id, jumlah_stok, stok_committed FROM inventory_stok WHERE kode_barang = ? FOR UPDATE',
      [so.kode_sepeda]
    );

    if (stokData.length === 0) {
      throw new Error(`Barang dengan kode ${so.kode_sepeda} tidak ditemukan di gudang.`);
    }

    const stok = stokData[0];
    const stokAvailable = stok.jumlah_stok - stok.stok_committed;

    // 3. Validasi alokasi stok
    if (so.qty > stokAvailable) {
      throw new Error(`Stok tidak mencukupi! Tersedia: ${stokAvailable}, Diminta: ${so.qty}.`);
    }

    // 4. Update stok_committed (Soft Allocation)
    await connection.query(
      'UPDATE inventory_stok SET stok_committed = stok_committed + ? WHERE id = ?',
      [so.qty, stok.id]
    );

    // 5. Update status SO menjadi Confirmed
    await connection.query(
      'UPDATE penjualan_so SET status = ? WHERE id = ?',
      ['Confirmed', soId]
    );

    await connection.commit();
    connection.release();
    
    res.json({ success: true, message: 'Stok berhasil dikunci (Confirmed).' });

  } catch (error: any) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    console.error('[confirmSO] Transaction Error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

// ============================================================
// [PATCH] /api/penjualan/:id/ship — Kirim Unit (Potong Stok Fisik)
// ============================================================
export const shipSO = async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const soId = parseInt(id, 10);

    if (isNaN(soId)) {
      res.status(400).json({ success: false, message: 'ID SO tidak valid.' });
      connection.release();
      return;
    }

    await connection.beginTransaction();

    // 1. Ambil data SO dan pastikan status Confirmed
    const [soData]: any = await connection.query(
      'SELECT id, no_so, nama_customer, kode_sepeda, qty, total_harga, status FROM penjualan_so WHERE id = ? FOR UPDATE',
      [soId]
    );

    if (soData.length === 0) {
      throw new Error('Sales Order tidak ditemukan.');
    }

    const so = soData[0];
    if (so.status !== 'Confirmed') {
      throw new Error(`SO berstatus ${so.status}, hanya Confirmed yang bisa dikirim.`);
    }

    // 2. Potong stok fisik dan kurangi stok_committed di gudang
    const [updateResult]: any = await connection.query(
      'UPDATE inventory_stok SET jumlah_stok = jumlah_stok - ?, stok_committed = stok_committed - ? WHERE kode_barang = ?',
      [so.qty, so.qty, so.kode_sepeda]
    );

    if (updateResult.affectedRows === 0) {
      throw new Error(`Data stok gudang untuk ${so.kode_sepeda} gagal diupdate.`);
    }

    // 3. Update status SO menjadi Shipped
    await connection.query(
      'UPDATE penjualan_so SET status = ? WHERE id = ?',
      ['Shipped', soId]
    );

    // 4. AUTOMATED FINANCIAL LEDGER — Catat 4 entri jurnal Double-Entry
    const hppPerUnit = await calculateHPP(connection, so.kode_sepeda);
    const totalHPP = hppPerUnit * so.qty;
    const totalHargaJual = parseFloat(so.total_harga);

    // Referensi dokumen langsung dari data SO
    const refDoc = so.no_so || `SO-${soId}`;

    // 4a. HPP keluar (Modal terserap ke COGS)
    if (totalHPP > 0) {
      await insertJurnal(connection, refDoc, `HPP keluar: Pengiriman ${so.kode_sepeda} x${so.qty}`, 'HPP', 'Debit', totalHPP);
      await insertJurnal(connection, refDoc, `Aset Persediaan keluar: Pengiriman ${so.kode_sepeda} x${so.qty}`, 'Aset_Persediaan', 'Kredit', totalHPP);
    }

    // 4b. Pendapatan masuk (Revenue Recognition)
    if (totalHargaJual > 0) {
      await insertJurnal(connection, refDoc, `Kas masuk dari penjualan ${so.kode_sepeda} x${so.qty} ke ${so.nama_customer}`, 'Kas_Bank', 'Debit', totalHargaJual);
      await insertJurnal(connection, refDoc, `Pendapatan penjualan ${so.kode_sepeda} x${so.qty}`, 'Pendapatan', 'Kredit', totalHargaJual);
    }

    await connection.commit();
    connection.release();
    
    res.json({ success: true, message: 'Surat Jalan Tercetak. Unit terdistribusi & Jurnal Keuangan tercatat.' });

  } catch (error: any) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    console.error('[shipSO] Transaction Error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};
