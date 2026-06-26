import { Request, Response } from 'express';
import pool from '../config/database.js';

// POST /api/aftersales/klaim
export const createKlaim = async (req: Request, res: Response) => {
    try {
        const { id_sales_order, nama_retailer, kode_item_fg, deskripsi_keluhan, foto_bukti_kerusakan } = req.body;

        if (!id_sales_order || !nama_retailer || !kode_item_fg || !deskripsi_keluhan || !foto_bukti_kerusakan) {
            return res.status(400).json({ success: false, message: 'Harap lengkapi semua field termasuk foto bukti.' });
        }

        // Generate ID (e.g., CLM-YYYYMMDD-XXXX)
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const id_klaim = `CLM-${dateStr}-${randomNum}`;

        await pool.query(
            `INSERT INTO aftersales_klaim 
             (id_klaim, id_sales_order, nama_retailer, kode_item_fg, deskripsi_keluhan, foto_bukti_kerusakan, status_klaim) 
             VALUES (?, ?, ?, ?, ?, ?, 'SUBMITTED')`,
            [id_klaim, id_sales_order, nama_retailer, kode_item_fg, deskripsi_keluhan, foto_bukti_kerusakan]
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
            SELECT k.*, s.nomor_so 
            FROM aftersales_klaim k
            JOIN sales_order_header s ON k.id_sales_order = s.id
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

        await pool.query(
            `UPDATE aftersales_klaim 
             SET catatan_investigasi_qc = ?, status_klaim = ? 
             WHERE id_klaim = ?`,
            [catatan_investigasi_qc || null, status_klaim, id]
        );

        res.json({ success: true, message: `Investigasi untuk ${id} berhasil disimpan dengan status ${status_klaim}.` });
    } catch (error: any) {
        console.error('Error investigateKlaim:', error);
        res.status(500).json({ success: false, message: 'Gagal menyimpan hasil investigasi.', error: error.message });
    }
};
