import { Request, Response } from 'express';
import pool from '../config/database.js';

/**
 * Controller untuk Modul Pengadaan (Purchase Requisition).
 * Endpoint ini dilindungi oleh authMiddleware + requireRole('Owner', 'Admin', 'Pengadaan').
 */

// ============================================================
// [GET] /api/pengadaan — Ambil semua daftar PR
// Migrasi dari: get_pengadaan.php
// ============================================================
export const getAllPR = async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query('SELECT * FROM pengadaan_pr ORDER BY id DESC');
    res.json({
      success: true,
      data: rows
    });
  } catch (error: any) {
    console.error('[getAllPR] Error:', error);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};

// ============================================================
// [POST] /api/pengadaan — Simpan PR Baru
// Migrasi dari: simpan_pr.php
// ============================================================
export const createPR = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nomor_pr, item_barang, jumlah, satuan, vendor } = req.body;

    // Validasi sederhana (sesuai simpan_pr.php)
    if (!nomor_pr || !item_barang || !jumlah || !vendor) {
      res.status(400).json({ success: false, message: 'Mohon lengkapi semua field form dengan benar.' });
      return;
    }

    const parsedJumlah = parseInt(jumlah, 10);
    if (isNaN(parsedJumlah) || parsedJumlah <= 0) {
      res.status(400).json({ success: false, message: 'Jumlah harus lebih besar dari 0.' });
      return;
    }

    // Default status PR baru
    const status_pr = 'Menunggu Persetujuan';
    const parsedSatuan = satuan || 'pcs';

    // Eksekusi insert
    const [result] = await pool.query(
      'INSERT INTO pengadaan_pr (nomor_pr, item_barang, jumlah, satuan, vendor, status_pr) VALUES (?, ?, ?, ?, ?, ?)',
      [nomor_pr.trim(), item_barang.trim(), parsedJumlah, parsedSatuan.trim(), vendor.trim(), status_pr]
    );

    res.status(201).json({
      success: true,
      message: 'Purchase Request berhasil diajukan.'
    });

  } catch (error: any) {
    console.error('[createPR] Error:', error);
    res.status(500).json({ success: false, message: `Error insert PR: ${error.message}` });
  }
};

// ============================================================
// [PATCH] /api/pengadaan/:id/approve — Setujui PR
// Migrasi dari: approve_pr.php
// ============================================================
export const approvePR = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const prId = parseInt(id, 10);

    if (isNaN(prId)) {
      res.status(400).json({ success: false, message: 'ID PR tidak valid.' });
      return;
    }

    const newStatus = 'Diproses Vendor';

    const [result]: any = await pool.query(
      'UPDATE pengadaan_pr SET status_pr = ? WHERE id = ?',
      [newStatus, prId]
    );

    if (result.affectedRows > 0) {
      res.json({ success: true, message: 'PR berhasil disetujui dan dikirim ke vendor.' });
    } else {
      res.status(404).json({ success: false, message: 'PR tidak ditemukan atau status tidak berubah.' });
    }

  } catch (error: any) {
    console.error('[approvePR] Error:', error);
    res.status(500).json({ success: false, message: `Error update PR: ${error.message}` });
  }
};

// ============================================================
// [DELETE] /api/pengadaan/:id — Hapus PR
// Migrasi dari: hapus_pr.php
// ============================================================
export const deletePR = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const prId = parseInt(id, 10);

    if (isNaN(prId)) {
      res.status(400).json({ success: false, message: 'ID PR tidak valid.' });
      return;
    }

    const [result]: any = await pool.query(
      'DELETE FROM pengadaan_pr WHERE id = ?',
      [prId]
    );

    if (result.affectedRows > 0) {
      res.json({ success: true, message: 'Data PR berhasil dihapus.' });
    } else {
      res.status(404).json({ success: false, message: 'PR tidak ditemukan.' });
    }

  } catch (error: any) {
    console.error('[deletePR] Error:', error);
    res.status(500).json({ success: false, message: `Error menghapus data: ${error.message}` });
  }
};
