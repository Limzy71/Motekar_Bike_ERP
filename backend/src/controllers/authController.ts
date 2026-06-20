import { Request, Response } from 'express';
import pool from '../config/database.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

export const login = async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ status: 'error', message: 'Username dan password wajib diisi!' });
    return;
  }

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    const users = rows as any[];

    if (users.length === 0) {
      res.status(401).json({ status: 'error', message: 'Username tidak ditemukan!' });
      return;
    }

    const user = users[0];
    const dbPassword = user.password;

    let isMatch = false;

    // 1. Cek jika password di DB menggunakan Bcrypt PHP ($2y$ atau $2a$)
    if (dbPassword.startsWith('$2y$') || dbPassword.startsWith('$2a$')) {
      // PHP menggunakan prefix $2y$, Node.js menggunakan $2a$, kita ganti prefixnya agar kompatibel
      const compatibleHash = dbPassword.replace(/^\$2y\$/, '$2a$');
      isMatch = await bcrypt.compare(password, compatibleHash);
    } 
    
    // 2. Cek jika password menggunakan MD5 atau Plain Text
    if (!isMatch) {
      const inputMd5 = crypto.createHash('md5').update(password).digest('hex');
      isMatch = dbPassword === password || dbPassword === inputMd5;
    }

    if (!isMatch) {
      res.status(401).json({ status: 'error', message: 'Password salah!' });
      return;
    }

    // Generate api_token secara random (64 karakter hex)
    const apiToken = crypto.randomBytes(32).toString('hex');

    // Simpan token ke database agar bisa divalidasi oleh authMiddleware
    await pool.query('UPDATE users SET api_token = ? WHERE id = ?', [apiToken, user.id]);

    res.json({
      status: 'success',
      message: 'Login berhasil!',
      user: {
        id: user.id,
        username: user.username,
        nama: user.nama_lengkap || user.username,
        divisi_role: user.divisi_role || 'user',
        api_token: apiToken
      }
    });

  } catch (error: any) {
    res.status(500).json({ status: 'error', message: `Server error: ${error.message}` });
  }
};