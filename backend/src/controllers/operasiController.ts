import { Request, Response } from 'express';
import pool from '../config/database.js';

/**
 * Controller untuk Modul Operasi Inti (Work Order / Perakitan).
 * Endpoint dilindungi oleh authMiddleware + requireRole('Owner', 'Admin', 'Operasi').
 */

// ============================================================
// [GET] /api/operasi/wo — Ambil semua data Work Order
// ============================================================
export const getAllWO = async (req: Request, res: Response): Promise<void> => {
  try {
    const sql = `
      SELECT w.*, i.nama_barang as nama_sepeda 
      FROM operasi_wo w
      LEFT JOIN inventory_stok i ON w.kode_sepeda = i.kode_barang
      ORDER BY w.created_at DESC
    `;
    const [rows] = await pool.query(sql);
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error: any) {
    console.error('[getAllWO] Error:', error);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};

// ============================================================
// [POST] /api/operasi/wo — Membuat perintah kerja baru
// ============================================================
export const createWO = async (req: Request, res: Response): Promise<void> => {
  try {
    const { kode_sepeda, jumlah_produksi } = req.body;

    if (!kode_sepeda || !jumlah_produksi) {
      res.status(400).json({ success: false, message: 'Kode Sepeda dan Jumlah Produksi harus diisi.' });
      return;
    }

    const parsedJumlah = parseInt(jumlah_produksi, 10);
    if (isNaN(parsedJumlah) || parsedJumlah <= 0) {
      res.status(400).json({ success: false, message: 'Jumlah produksi harus lebih dari 0.' });
      return;
    }

    // 1. Generate nomor_wo otomatis (WO/MTK/YYYY/XXXX)
    const year = new Date().getFullYear();
    const prefix = `WO/MTK/${year}/`;
    
    const [lastWO]: any = await pool.query(
      'SELECT nomor_wo FROM operasi_wo WHERE nomor_wo LIKE ? ORDER BY id DESC LIMIT 1',
      [`${prefix}%`]
    );

    let nextNumber = 1;
    if (lastWO.length > 0) {
      const lastNomor = lastWO[0].nomor_wo;
      const parts = lastNomor.split('/');
      const lastIndex = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastIndex)) {
        nextNumber = lastIndex + 1;
      }
    }
    const nomor_wo = `${prefix}${nextNumber.toString().padStart(4, '0')}`;

    // 2. Insert Work Order (status default: Menunggu)
    await pool.query(
      'INSERT INTO operasi_wo (nomor_wo, kode_sepeda, jumlah_produksi, status) VALUES (?, ?, ?, ?)',
      [nomor_wo, kode_sepeda, parsedJumlah, 'Menunggu']
    );

    res.status(201).json({
      success: true,
      message: 'Work Order berhasil dibuat.',
      data: { nomor_wo }
    });

  } catch (error: any) {
    console.error('[createWO] Error:', error);
    res.status(500).json({ success: false, message: `Error membuat WO: ${error.message}` });
  }
};

// ============================================================
// [PATCH] /api/operasi/wo/:id/move — Mengubah status tahapan perakitan
// ============================================================
export const moveWO = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'Menunggu', 'Perakitan Frame', 'Setup Drivetrain', 'Selesai'

    const woId = parseInt(id, 10);
    if (isNaN(woId) || !status) {
      res.status(400).json({ success: false, message: 'ID atau Status tidak valid.' });
      return;
    }

    const [result]: any = await pool.query(
      'UPDATE operasi_wo SET status = ? WHERE id = ?',
      [status, woId]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ success: false, message: 'Work Order tidak ditemukan.' });
    } else {
      res.json({ success: true, message: `Work Order berhasil dipindah ke tahapan: ${status}` });
    }
  } catch (error: any) {
    console.error('[moveWO] Error:', error);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};
