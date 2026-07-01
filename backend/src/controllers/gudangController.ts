import { Request, Response } from 'express';
import pool from '../config/database.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../helpers/asyncHandler.js';

/**
 * Controller untuk Modul Gudang (Inventory).
 * Endpoint dilindungi oleh authMiddleware + requireRole('Owner', 'Admin', 'Gudang').
 */

// ============================================================
// [GET] /api/gudang — Ambil semua inventory_stok
// ============================================================
export const getAllStok = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || '';
    const offset = (page - 1) * limit;

    const filter = (req.query.filter as string) || 'Semua';

    let query = 'SELECT id, kode_barang, nama_barang, kategori, tipe_item, jumlah_stok, stok_committed, (jumlah_stok - stok_committed) as stok_available, satuan, last_updated FROM inventory_stok';
    let countQuery = 'SELECT COUNT(*) as total FROM inventory_stok';
    
    let whereConditions: string[] = [];
    const params: any[] = [];

    if (search) {
      const searchParam = `%${search}%`;
      whereConditions.push('(kode_barang LIKE ? OR nama_barang LIKE ? OR kategori LIKE ?)');
      params.push(searchParam, searchParam, searchParam);
    }

    if (filter && filter !== 'Semua') {
      if (['RM', 'SA', 'FG'].includes(filter)) {
        whereConditions.push('tipe_item = ?');
        params.push(filter);
      }
    }

    if (whereConditions.length > 0) {
      const whereClause = ' WHERE ' + whereConditions.join(' AND ');
      query += whereClause;
      countQuery += whereClause;
    }

    query += ' ORDER BY jumlah_stok ASC, nama_barang ASC LIMIT ? OFFSET ?';
    
    const [countResult]: any = await pool.query(countQuery, params);
    const totalItems = countResult[0].total;
    const totalPages = Math.ceil(totalItems / limit);

    const queryParams = [...params, limit, offset];
    const [rows] = await pool.query(query, queryParams);

    res.json({
      success: true,
      data: rows,
      meta: {
        totalItems,
        totalPages,
        currentPage: page
      }
    });
  } catch (error: any) {
    console.error('[getAllStok] Error:', error);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};

// ============================================================
// [POST] /api/gudang/masuk — Catat stok masuk
// ============================================================
export const stokMasuk = async (req: Request, res: Response): Promise<void> => {
  try {
    const { kode_barang, nama_barang, kategori, jumlah_masuk, satuan } = req.body;

    if (!kode_barang || !nama_barang || !jumlah_masuk || !satuan) {
      res.status(400).json({ success: false, message: 'Mohon lengkapi data stok masuk.' });
      return;
    }

    const parsedJumlah = parseInt(jumlah_masuk, 10);
    if (isNaN(parsedJumlah) || parsedJumlah <= 0) {
      res.status(400).json({ success: false, message: 'Jumlah stok harus lebih dari 0.' });
      return;
    }

    // Cek apakah kode barang sudah ada
    const [existing]: any = await pool.query(
      'SELECT id, jumlah_stok FROM inventory_stok WHERE kode_barang = ?',
      [kode_barang.trim()]
    );

    if (existing.length > 0) {
      // Jika ada, tambahkan stoknya
      await pool.query(
        'UPDATE inventory_stok SET jumlah_stok = jumlah_stok + ?, last_updated = CURRENT_TIMESTAMP WHERE kode_barang = ?',
        [parsedJumlah, kode_barang.trim()]
      );
    } else {
      // Jika belum ada, buat record baru
      await pool.query(
        'INSERT INTO inventory_stok (kode_barang, nama_barang, kategori, jumlah_stok, satuan) VALUES (?, ?, ?, ?, ?)',
        [kode_barang.trim(), nama_barang.trim(), kategori?.trim() || 'Lainnya', parsedJumlah, satuan.trim()]
      );
    }

    res.status(201).json({
      success: true,
      message: 'Stok masuk berhasil dicatat.'
    });

  } catch (error: any) {
    console.error('[stokMasuk] Error:', error);
    res.status(500).json({ success: false, message: `Error catat stok: ${error.message}` });
  }
};

// ============================================================
// [PATCH] /api/gudang/opname/:id — Penyesuaian stok manual
// ============================================================
export const opnameStok = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { jumlah_aktual } = req.body;

    const stokId = parseInt(id, 10);
    const parsedJumlah = parseInt(jumlah_aktual, 10);

    if (isNaN(stokId)) {
      res.status(400).json({ success: false, message: 'ID Stok tidak valid.' });
      return;
    }

    if (isNaN(parsedJumlah) || parsedJumlah < 0) {
      res.status(400).json({ success: false, message: 'Jumlah aktual harus berupa angka non-negatif.' });
      return;
    }

    const [result]: any = await pool.query(
      'UPDATE inventory_stok SET jumlah_stok = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
      [parsedJumlah, stokId]
    );

    if (result.affectedRows > 0) {
      res.json({ success: true, message: 'Opname stok berhasil disesuaikan.' });
    } else {
      res.status(404).json({ success: false, message: 'Data stok tidak ditemukan.' });
    }

  } catch (error: any) {
    console.error('[opnameStok] Error:', error);
    res.status(500).json({ success: false, message: `Error opname stok: ${error.message}` });
  }
};


// ============================================================
// [GET] /api/gudang/po-pending — Ambil PO yang siap diterima
// ============================================================
export const getPendingPO = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const [rows] = await pool.query(`
    SELECT po.id, po.nomor_po, po.status, po.created_at, v.nama_vendor
    FROM pengadaan_po_header po
    JOIN master_vendor v ON po.id_vendor = v.id
    WHERE po.status = 'APPROVED' OR po.status = 'SENT_TO_VENDOR'
    ORDER BY po.created_at ASC
  `);
  res.json({ success: true, data: rows });
});

// ============================================================
// [GET] /api/gudang/po-pending/:id — Ambil detail PO untuk GR
// ============================================================
export const getPendingPODetails = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const [rows] = await pool.query(`
    SELECT d.id_inventory_material, d.qty, i.kode_barang, i.nama_barang
    FROM pengadaan_po_detail d
    JOIN inventory_stok i ON d.id_inventory_material = i.id
    WHERE d.id_po_header = ?
  `, [id]);
  res.json({ success: true, data: rows });
});

// ============================================================
// [GET] /api/gudang/receipts - Ambil riwayat penerimaan barang (Goods Receipt History)
// ============================================================
export const getReceiptHistory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const [rows] = await pool.query(`
    SELECT pb.id, pb.tanggal_terima as tanggal_penerimaan, pb.surat_jalan_vendor as no_surat_jalan, pb.penerima, pb.catatan,
           po.id as id_po_header, po.nomor_po, po.catatan as catatan_po, po.status as status_po, po.total_nilai,
           v.nama_vendor
    FROM penerimaan_barang pb
    JOIN pengadaan_po_header po ON pb.id_po_header = po.id
    LEFT JOIN master_vendor v ON po.id_vendor = v.id
    ORDER BY pb.tanggal_terima DESC
    LIMIT 100
  `);
  
  for (const row of rows as any[]) {
      const [items]: any = await pool.query(`
          SELECT d.qty, d.harga_satuan, (d.qty * d.harga_satuan) as total_harga, i.nama_barang, i.kode_barang
          FROM pengadaan_po_detail d
          JOIN inventory_stok i ON d.id_inventory_material = i.id
          WHERE d.id_po_header = ?
      `, [row.id_po_header]);
      row.items = items;
  }
  
  res.json({ success: true, data: rows });
});

// ============================================================
// [POST] /api/gudang/receive — Proses Penerimaan Barang (GR)
// ============================================================
export const receiveGoods = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();

  try {
    const id_po_header = parseInt(req.body.id_po_header, 10);
    const penerima = req.body.penerima;
    const surat_jalan_vendor = req.body.surat_jalan_vendor || null;
    const catatan = req.body.catatan || null;
    let items = [];
    
    if (typeof req.body.items === 'string') {
        items = JSON.parse(req.body.items);
    } else {
        items = req.body.items;
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const foto_barang = files?.['foto_barang']?.[0]?.filename || null;
    const foto_surat_jalan = files?.['foto_surat_jalan']?.[0]?.filename || null;
    const foto_packaging = files?.['foto_packaging']?.[0]?.filename || null;

    if (!items || items.length === 0) throw new AppError('Minimal satu barang harus diterima!', 400);

    await connection.beginTransaction();

    // 1. Validasi PO Exist
    const [poRows]: any = await connection.query('SELECT status FROM pengadaan_po_header WHERE id = ? FOR UPDATE', [id_po_header]);
    if (poRows.length === 0) throw new AppError('Purchase Order tidak ditemukan.', 404);
    if (poRows[0].status === 'COMPLETED') throw new AppError('Purchase Order sudah selesai diterima.', 400);

    // 2. Insert ke penerimaan_barang beserta foto e-POD
    const [receiptResult]: any = await connection.query(
      'INSERT INTO penerimaan_barang (id_po_header, penerima, surat_jalan_vendor, catatan, foto_barang, foto_surat_jalan, foto_packaging) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id_po_header, penerima, surat_jalan_vendor, catatan, foto_barang, foto_surat_jalan, foto_packaging]
    );
    const receiptId = receiptResult.insertId;

    let allBaik = true;
    let hasRTV = false;

    // 3. Proses setiap item (Detail & Update Stok)
    for (const item of items) {
      // Insert detail penerimaan
      await connection.query(
        'INSERT INTO detail_penerimaan (id_penerimaan, id_inventory_material, qty_diterima, kondisi) VALUES (?, ?, ?, ?)',
        [receiptId, item.id_inventory_material, item.qty_diterima, item.kondisi]
      );

      if (item.kondisi === 'BAIK') {
        await connection.query(
          'UPDATE inventory_stok SET jumlah_stok = jumlah_stok + ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
          [item.qty_diterima, item.id_inventory_material]
        );
      } else {
        // RTV Flow untuk kondisi RUSAK
        allBaik = false;
        hasRTV = true;
        
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const randomNum = Math.floor(100 + Math.random() * 900);
        const no_rtv = `RTV-${dateStr}-${randomNum}`;
        
        await connection.query(
          'INSERT INTO rtv_dokumen (no_rtv, penerimaan_id, barang_id, qty_retur, alasan, status) VALUES (?, ?, ?, ?, ?, ?)',
          [no_rtv, receiptId, item.id_inventory_material, item.qty_diterima, 'Gagal Incoming QC (Rusak saat datang)', 'PENDING']
        );
      }
    }

    // 4. Update status PO
    const newStatus = allBaik ? 'COMPLETED' : 'PARTIAL_RECEIVED_WITH_DEFECT';
    await connection.query('UPDATE pengadaan_po_header SET status = ? WHERE id = ?', [newStatus, id_po_header]);

    await connection.commit();
    
    let message = 'Penerimaan barang berhasil diproses dan e-POD telah disimpan.';
    if (hasRTV) {
        message += ' Perhatian: Terdapat barang yang gagal QC (RUSAK) dan telah masuk antrean Return to Vendor (RTV).';
    }

    res.status(201).json({ success: true, message, data: { hasRTV, newStatus } });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});
