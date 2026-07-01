import { Request, Response } from 'express';
import pool from '../config/database.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../helpers/asyncHandler.js';

// ============================================================
// [GET] /api/vendor — Ambil semua vendor (termasuk status & rating)
// ============================================================
export const getVendorsSRM = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const [rows] = await pool.query(`
        SELECT id, kode_vendor, nama_vendor, kategori, kontak, alamat,
               COALESCE(status_vendor, 'AKTIF') as status_vendor,
               alasan_blacklist,
               COALESCE(skor_rating, 5) as skor_rating,
               created_at
        FROM master_vendor 
        ORDER BY nama_vendor ASC
    `);
    res.json({ success: true, data: rows });
});

// ============================================================
// [POST] /api/vendor — Buat Vendor Baru
// ============================================================
export const createVendor = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { kode_vendor, nama_vendor, kategori, kontak, alamat } = req.body;

    const [result]: any = await pool.query(
        'INSERT INTO master_vendor (kode_vendor, nama_vendor, kategori, kontak, alamat, status_vendor, skor_rating) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [kode_vendor || null, nama_vendor, kategori || null, kontak || null, alamat || null, 'AKTIF', 5.0]
    );

    res.status(201).json({ success: true, message: 'Vendor berhasil ditambahkan.', data: { id: result.insertId } });
});

// ============================================================
// [PUT] /api/vendor/:id — Update Master Data Vendor
// ============================================================
export const updateVendor = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { kode_vendor, nama_vendor, kategori, kontak, alamat } = req.body;

    const [result]: any = await pool.query(
        'UPDATE master_vendor SET kode_vendor = ?, nama_vendor = ?, kategori = ?, kontak = ?, alamat = ? WHERE id = ?',
        [kode_vendor || null, nama_vendor, kategori || null, kontak || null, alamat || null, id]
    );

    if (result.affectedRows === 0) {
        throw new AppError('Vendor tidak ditemukan.', 404);
    }

    res.json({ success: true, message: 'Data vendor berhasil diperbarui.' });
});

// ============================================================
// [PATCH] /api/vendor/:id/status — Ubah Status SRM Vendor
// ============================================================
export const updateVendorStatus = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { status_vendor, alasan_blacklist, skor_rating } = req.body;

    // Build update fields
    const updateFields: Record<string, any> = { status_vendor };

    if (status_vendor === 'BLACKLIST') {
        updateFields.alasan_blacklist = alasan_blacklist;
    } else {
        updateFields.alasan_blacklist = null; // Hapus alasan jika tidak blacklist
    }

    if (skor_rating !== undefined) {
        updateFields.skor_rating = parseFloat(skor_rating);
    }

    const setClause = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(updateFields), id];

    const [result]: any = await pool.query(
        `UPDATE master_vendor SET ${setClause} WHERE id = ?`,
        values
    );

    if (result.affectedRows === 0) {
        throw new AppError('Vendor tidak ditemukan.', 404);
    }

    res.json({ success: true, message: `Status vendor berhasil diubah menjadi ${status_vendor}.` });
});

// ============================================================
// [DELETE] /api/vendor/:id — Hapus Vendor
// ============================================================
export const deleteVendor = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const [result]: any = await pool.query('DELETE FROM master_vendor WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
        throw new AppError('Vendor tidak ditemukan.', 404);
    }

    res.json({ success: true, message: 'Vendor berhasil dihapus secara permanen dari sistem.' });
});
