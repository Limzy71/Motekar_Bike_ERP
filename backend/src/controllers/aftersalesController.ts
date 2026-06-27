import { Request, Response } from 'express';
import pool from '../config/database.js';

// POST /api/aftersales/klaim
export const createKlaim = async (req: Request, res: Response) => {
    try {
        const { id_sales_order, nama_retailer, kode_item_fg, deskripsi_keluhan, foto_bukti_kerusakan } = req.body;

        if (!id_sales_order || !nama_retailer || !kode_item_fg || !deskripsi_keluhan) {
            return res.status(400).json({ success: false, message: 'Harap lengkapi semua field.' });
        }

        // Verify SO exists
        const [soRows]: any = await pool.query(
            'SELECT id, no_so, status FROM penjualan_so_header WHERE id = ?',
            [id_sales_order]
        );
        if (soRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Sales Order tidak ditemukan.' });
        }

        // Generate ID (e.g., CLM-YYYYMMDD-XXXX)
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const id_klaim = `CLM-${dateStr}-${randomNum}`;

        await pool.query(
            `INSERT INTO aftersales_klaim 
             (id_klaim, id_sales_order, nama_retailer, kode_item_fg, deskripsi_keluhan, foto_bukti_kerusakan, status_klaim) 
             VALUES (?, ?, ?, ?, ?, ?, 'SUBMITTED')`,
            [id_klaim, id_sales_order, nama_retailer, kode_item_fg, deskripsi_keluhan, foto_bukti_kerusakan || null]
        );

        res.json({ success: true, message: `Tiket klaim ${id_klaim} berhasil dibuat.` });
    } catch (error: any) {
        console.error('Error createKlaim:', error);
        res.status(500).json({ success: false, message: 'Gagal membuat tiket klaim.', error: error.message });
    }
};

// GET /api/aftersales/klaim
export const getAllKlaim = async (req: Request, res: Response) => {
    try {
        const [rows] = await pool.query(`
            SELECT k.*, s.no_so as nomor_so 
            FROM aftersales_klaim k
            LEFT JOIN penjualan_so_header s ON k.id_sales_order = s.id
            ORDER BY k.tanggal_klaim DESC
        `);
        res.json({ success: true, data: rows });
    } catch (error: any) {
        console.error('Error getAllKlaim:', error);
        res.status(500).json({ success: false, message: 'Gagal memuat data klaim.', error: error.message });
    }
};

// PATCH /api/aftersales/klaim/:id/investigate
export const investigateKlaim = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { catatan_investigasi_qc, status_klaim } = req.body;

        if (!status_klaim) {
            return res.status(400).json({ success: false, message: 'Status resolusi wajib dipilih.' });
        }

        const validStatuses = ['IN_INSPECTION', 'APPROVED_REPLACE', 'APPROVED_REWORK', 'REJECTED'];
        if (!validStatuses.includes(status_klaim)) {
            return res.status(400).json({ success: false, message: 'Status tidak valid.' });
        }

        const [result]: any = await pool.query(
            `UPDATE aftersales_klaim 
             SET catatan_investigasi_qc = ?, status_klaim = ? 
             WHERE id_klaim = ?`,
            [catatan_investigasi_qc || null, status_klaim, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Tiket klaim tidak ditemukan.' });
        }

        res.json({ success: true, message: `Investigasi untuk ${id} berhasil disimpan dengan status ${status_klaim}.` });
    } catch (error: any) {
        console.error('Error investigateKlaim:', error);
        res.status(500).json({ success: false, message: 'Gagal menyimpan hasil investigasi.', error: error.message });
    }
};
