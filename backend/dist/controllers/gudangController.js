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
export const getAllStok = async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, kode_barang, nama_barang, kategori, jumlah_stok, stok_committed, (jumlah_stok - stok_committed) as stok_available, satuan, last_updated FROM inventory_stok ORDER BY jumlah_stok ASC, nama_barang ASC');
        res.json({
            success: true,
            data: rows
        });
    }
    catch (error) {
        console.error('[getAllStok] Error:', error);
        res.status(500).json({ success: false, message: `Server error: ${error.message}` });
    }
};
// ============================================================
// [POST] /api/gudang/masuk — Catat stok masuk
// ============================================================
export const stokMasuk = async (req, res) => {
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
        const [existing] = await pool.query('SELECT id, jumlah_stok FROM inventory_stok WHERE kode_barang = ?', [kode_barang.trim()]);
        if (existing.length > 0) {
            // Jika ada, tambahkan stoknya
            await pool.query('UPDATE inventory_stok SET jumlah_stok = jumlah_stok + ?, last_updated = CURRENT_TIMESTAMP WHERE kode_barang = ?', [parsedJumlah, kode_barang.trim()]);
        }
        else {
            // Jika belum ada, buat record baru
            await pool.query('INSERT INTO inventory_stok (kode_barang, nama_barang, kategori, jumlah_stok, satuan) VALUES (?, ?, ?, ?, ?)', [kode_barang.trim(), nama_barang.trim(), kategori?.trim() || 'Lainnya', parsedJumlah, satuan.trim()]);
        }
        res.status(201).json({
            success: true,
            message: 'Stok masuk berhasil dicatat.'
        });
    }
    catch (error) {
        console.error('[stokMasuk] Error:', error);
        res.status(500).json({ success: false, message: `Error catat stok: ${error.message}` });
    }
};
// ============================================================
// [PATCH] /api/gudang/opname/:id — Penyesuaian stok manual
// ============================================================
export const opnameStok = async (req, res) => {
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
        const [result] = await pool.query('UPDATE inventory_stok SET jumlah_stok = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?', [parsedJumlah, stokId]);
        if (result.affectedRows > 0) {
            res.json({ success: true, message: 'Opname stok berhasil disesuaikan.' });
        }
        else {
            res.status(404).json({ success: false, message: 'Data stok tidak ditemukan.' });
        }
    }
    catch (error) {
        console.error('[opnameStok] Error:', error);
        res.status(500).json({ success: false, message: `Error opname stok: ${error.message}` });
    }
};
// ============================================================
// [GET] /api/gudang/po-pending — Ambil PO yang siap diterima
// ============================================================
export const getPendingPO = asyncHandler(async (req, res) => {
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
export const getPendingPODetails = asyncHandler(async (req, res) => {
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
// [POST] /api/gudang/receive — Proses Penerimaan Barang (GR)
// ============================================================
export const receiveGoods = asyncHandler(async (req, res) => {
    const { id_po_header, penerima, surat_jalan_vendor, catatan, items } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        // 1. Validasi PO Exist
        const [poRows] = await connection.query('SELECT status FROM pengadaan_po_header WHERE id = ? FOR UPDATE', [id_po_header]);
        if (poRows.length === 0)
            throw new AppError('Purchase Order tidak ditemukan.', 404);
        if (poRows[0].status === 'COMPLETED')
            throw new AppError('Purchase Order sudah selesai diterima.', 400);
        // 2. Insert ke penerimaan_barang
        const [receiptResult] = await connection.query('INSERT INTO penerimaan_barang (id_po_header, penerima, surat_jalan_vendor, catatan) VALUES (?, ?, ?, ?)', [id_po_header, penerima, surat_jalan_vendor || null, catatan || null]);
        const receiptId = receiptResult.insertId;
        // 3. Proses setiap item (Detail & Update Stok)
        for (const item of items) {
            // Insert detail penerimaan
            await connection.query('INSERT INTO detail_penerimaan (id_penerimaan, id_inventory_material, qty_diterima, kondisi) VALUES (?, ?, ?, ?)', [receiptId, item.id_inventory_material, item.qty_diterima, item.kondisi]);
            // Tambah stok hanya jika kondisi 'BAIK'
            if (item.kondisi === 'BAIK') {
                const [updateStok] = await connection.query('UPDATE inventory_stok SET jumlah_stok = jumlah_stok + ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?', [item.qty_diterima, item.id_inventory_material]);
            }
        }
        // 4. Update status PO menjadi COMPLETED (Asumsi Full Receipt)
        // Di sistem ERP riil, ada kalkulasi parsial. Untuk kesederhanaan BRD saat ini, kita set COMPLETED.
        await connection.query('UPDATE pengadaan_po_header SET status = ? WHERE id = ?', ['COMPLETED', id_po_header]);
        await connection.commit();
        res.status(201).json({ success: true, message: 'Penerimaan barang berhasil diproses dan stok telah ditambahkan.' });
    }
    catch (error) {
        await connection.rollback();
        throw error; // Biarkan AppError/Error biasa ditangkap oleh errorHandler
    }
    finally {
        connection.release();
    }
});
