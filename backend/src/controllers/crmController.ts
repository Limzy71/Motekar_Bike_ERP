import { Request, Response } from 'express';
import db from '../config/database.js';
import { asyncHandler } from '../helpers/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import bcrypt from 'bcrypt';

// ============================================
// ONBOARDING RETAILER
// ============================================
export const submitOnboarding = asyncHandler(async (req: Request, res: Response) => {
    const { nama_toko, pic, kontak } = req.body;
    const dokumen_nib = req.file?.filename;

    if (!nama_toko || !pic || !kontak || !dokumen_nib) {
        throw new AppError('Semua field wajib diisi termasuk dokumen NIB', 400);
    }

    const conn = await db.getConnection();
    try {
        await conn.query(
            'INSERT INTO retailer_prospek (nama_toko, pic, kontak, dokumen_nib, status) VALUES (?, ?, ?, ?, "PROSPEK")',
            [nama_toko, pic, kontak, dokumen_nib]
        );
        res.status(201).json({ success: true, message: 'Data prospek berhasil disubmit' });
    } finally {
        conn.release();
    }
});

export const getProspects = asyncHandler(async (req: Request, res: Response) => {
    const [rows] = await db.query('SELECT * FROM retailer_prospek ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
});

export const verifyProspect = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [prospects]: any = await conn.query('SELECT * FROM retailer_prospek WHERE id = ? FOR UPDATE', [id]);
        if (prospects.length === 0) {
            throw new AppError('Prospek tidak ditemukan', 404);
        }
        const prospek = prospects[0];

        if (prospek.status === 'VERIFIED') {
            throw new AppError('Prospek sudah terverifikasi', 400);
        }

        // Update status
        await conn.query('UPDATE retailer_prospek SET status = "VERIFIED" WHERE id = ?', [id]);

        const username = prospek.nama_toko.toLowerCase().replace(/[^a-z0-9]/g, '');
        const plainPassword = 'password123';
        const hashedPassword = await bcrypt.hash(plainPassword, 10);
        
        // Menggabungkan nama_toko dan kontak ke dalam field nama_lengkap sesuai constraint DB
        const namaLengkap = `${prospek.nama_toko} - ${prospek.kontak}`;

        await conn.query(
            'INSERT INTO users (username, password, nama_lengkap, divisi_role, status) VALUES (?, ?, ?, ?, "Aktif")',
            [username, hashedPassword, namaLengkap, 'Retailer']
        );

        await conn.commit();
        res.json({ 
            success: true, 
            message: 'Prospek diverifikasi. Akun Retailer dibuat.', 
            data: { username, password: plainPassword } 
        });
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
});

// ============================================
// WARRRANTY CLAIMS
// ============================================
export const submitWarrantyClaim = asyncHandler(async (req: Request, res: Response) => {
    const { no_invoice, keluhan } = req.body;
    const foto_kerusakan = req.file?.filename;

    if (!no_invoice || !keluhan || !foto_kerusakan) {
        throw new AppError('Nomor Invoice, Keluhan, dan Foto Kerusakan wajib diisi', 400);
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Cari invoice berdasarkan so_id atau nomor invoice. Wait, the prompt says ar_invoice.
        // Let's check if there is an invoice number. ar_invoice only has `id` and `so_id`.
        // I will assume the user inputs the `ar_invoice.id` as no_invoice.
        
        const [invoices]: any = await conn.query(`
            SELECT i.id, i.created_at, s.nomor_po 
            FROM ar_invoice i 
            LEFT JOIN sales_order s ON i.so_id = s.id 
            WHERE i.id = ?`, 
            [no_invoice]
        );

        if (invoices.length === 0) {
            throw new AppError('Invoice tidak ditemukan', 404);
        }
        
        const invoice = invoices[0];
        
        // Cek masa garansi (1 tahun)
        const invoiceDate = new Date(invoice.created_at);
        const currentDate = new Date();
        const diffTime = Math.abs(currentDate.getTime() - invoiceDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        if (diffDays > 365) {
            throw new AppError('Masa garansi 1 tahun telah habis', 400);
        }

        const no_klaim = 'CLM-' + Date.now();

        await conn.query(
            'INSERT INTO klaim_garansi (no_klaim, ar_invoice_id, keluhan, foto_kerusakan) VALUES (?, ?, ?, ?)',
            [no_klaim, invoice.id, keluhan, foto_kerusakan]
        );

        await conn.commit();
        res.status(201).json({ success: true, message: 'Klaim garansi berhasil diajukan', data: { no_klaim } });
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
});

export const getWarrantyClaims = asyncHandler(async (req: Request, res: Response) => {
    const [rows] = await db.query(`
        SELECT c.*, i.created_at as invoice_date 
        FROM klaim_garansi c
        JOIN ar_invoice i ON c.ar_invoice_id = i.id
        ORDER BY c.created_at DESC
    `);
    res.json({ success: true, data: rows });
});

export const investigateWarrantyClaim = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { catatan_investigasi_qc, status_klaim } = req.body;

    if (!status_klaim) {
        throw new AppError('Status resolusi wajib dipilih', 400);
    }

    const conn = await db.getConnection();
    try {
        await conn.query(
            `UPDATE klaim_garansi 
             SET catatan_investigasi_qc = ?, status = ? 
             WHERE no_klaim = ?`,
            [catatan_investigasi_qc || null, status_klaim, id]
        );

        res.json({ success: true, message: `Investigasi untuk ${id} berhasil disimpan dengan status ${status_klaim}.` });
    } finally {
        conn.release();
    }
});
