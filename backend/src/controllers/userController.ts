import { Request, Response } from 'express';
import pool from '../config/database.js';
import bcrypt from 'bcrypt';
import { logAudit } from '../helpers/auditHelper.js';

// GET /api/users
export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, nama_lengkap, email, divisi_role, status, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/users
export const createUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUser = (req as any).user;
    if (!currentUser) {
      res.status(401).json({ success: false, message: 'Tidak terautentikasi' });
      return;
    }

    const { username, nama_lengkap, email, divisi_role } = req.body;
    if (!username || !nama_lengkap || !divisi_role) {
      res.status(400).json({ success: false, message: 'Field wajib tidak lengkap.' });
      return;
    }

    // Anti-Kudeta: IT Support & General Manager tidak bisa membuat Owner baru
    if ((currentUser.divisi_role === 'IT Support' || currentUser.divisi_role === 'General Manager') && divisi_role === 'Owner') {
      res.status(403).json({ success: false, message: 'Hanya Owner yang dapat membuat akun dengan level Owner.' });
      return;
    }

    const defaultPassword = 'password123';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    const [result]: any = await pool.query(
      'INSERT INTO users (username, nama_lengkap, email, password, divisi_role, status) VALUES (?, ?, ?, ?, ?, ?)',
      [username, nama_lengkap, email || null, hashedPassword, divisi_role, 'Aktif']
    );

    await logAudit(currentUser.id, `Membuat akun user baru: ${username} (${divisi_role})`, req.ip, 'Success');

    res.status(201).json({ success: true, message: 'User berhasil ditambahkan dengan password default: password123' });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ success: false, message: 'Username atau email sudah digunakan.' });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

// PATCH /api/users/:id
export const updateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUser = (req as any).user;
    const targetId = parseInt(req.params.id, 10);
    const { username, nama_lengkap, divisi_role, status, email } = req.body;

    if (!currentUser) {
      res.status(401).json({ success: false, message: 'Tidak terautentikasi' });
      return;
    }

    // Ambil data target
    const [targetRows]: any = await pool.query('SELECT divisi_role FROM users WHERE id = ?', [targetId]);
    if (targetRows.length === 0) {
      res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
      return;
    }

    const targetRole = targetRows[0].divisi_role;

    // ANTI-KUDETA: IT Support & General Manager tidak boleh mengedit Owner
    if ((currentUser.divisi_role === 'IT Support' || currentUser.divisi_role === 'General Manager') && targetRole === 'Owner') {
      res.status(403).json({ success: false, message: 'Anda tidak memiliki otorisasi untuk memodifikasi kredensial Owner.' });
      return;
    }

    // ANTI-KUDETA: IT Support & GM tidak boleh mengubah role seseorang MENJADI Owner
    if ((currentUser.divisi_role === 'IT Support' || currentUser.divisi_role === 'General Manager') && divisi_role === 'Owner') {
      res.status(403).json({ success: false, message: 'Anda dilarang mempromosikan user menjadi Owner.' });
      return;
    }

    if (username) {
      await pool.query(
        'UPDATE users SET username = ?, nama_lengkap = ?, divisi_role = ?, status = ?, email = ? WHERE id = ?',
        [username, nama_lengkap, divisi_role, status, email || null, targetId]
      );
    } else {
      await pool.query(
        'UPDATE users SET nama_lengkap = ?, divisi_role = ?, status = ?, email = ? WHERE id = ?',
        [nama_lengkap, divisi_role, status, email || null, targetId]
      );
    }

    await logAudit(currentUser.id, `Mengubah data user ID: ${targetId} (${divisi_role})`, req.ip, 'Success');

    res.json({ success: true, message: 'Data user berhasil diperbarui.' });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ success: false, message: 'Username sudah digunakan.' });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

// PATCH /api/users/:id/reset-password
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUser = (req as any).user;
    const targetId = parseInt(req.params.id, 10);

    if (!currentUser) {
      res.status(401).json({ success: false, message: 'Tidak terautentikasi' });
      return;
    }

    // Ambil data target
    const [targetRows]: any = await pool.query('SELECT username, divisi_role FROM users WHERE id = ?', [targetId]);
    if (targetRows.length === 0) {
      res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
      return;
    }

    const targetRole = targetRows[0].divisi_role;
    const targetUsername = targetRows[0].username;

    // ANTI-KUDETA: IT Support & GM tidak boleh me-reset password Owner
    if ((currentUser.divisi_role === 'IT Support' || currentUser.divisi_role === 'General Manager') && targetRole === 'Owner') {
      res.status(403).json({ success: false, message: 'Anda tidak memiliki otorisasi untuk memodifikasi kredensial Owner.' });
      return;
    }

    const newPassword = 'motekar123';
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, targetId]);

    await logAudit(currentUser.id, `Reset password untuk user: ${targetUsername}`, req.ip, 'Success');

    res.json({ success: true, message: `Password berhasil di-reset ke: ${newPassword}` });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
