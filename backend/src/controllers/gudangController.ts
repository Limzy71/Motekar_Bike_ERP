import { Request, Response } from 'express';
import pool from '../config/database.js';

/**
 * Controller untuk Modul Gudang (Inventory).
 * Endpoint dilindungi oleh authMiddleware + requireRole('Owner', 'Admin', 'Gudang').
 */

// ============================================================
// [GET] /api/gudang — Ambil semua inventory_stok
// ============================================================
export const getAllStok = async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query(
      'SELECT id, kode_barang, nama_barang, kategori, jumlah_stok, stok_committed, (jumlah_stok - stok_committed) as stok_available, satuan, reorder_point, last_updated FROM inventory_stok ORDER BY jumlah_stok ASC, nama_barang ASC'
    );
    res.json({
      success: true,
      data: rows
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


