import { Request, Response } from 'express';
import pool from '../config/database.js';
import bcrypt from 'bcrypt';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { logAudit } from '../helpers/auditHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Folder penyimpanan foto profil
const UPLOAD_DIR = path.join(__dirname, '../../public/uploads/avatars');

// Pastikan direktori ada
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ============================================================
// [GET] /api/profil/me — Ambil data profil user yang sedang login
// ============================================================
export const getMyProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    // req.user di-set oleh authMiddleware (authenticate)
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Tidak terautentikasi.' });
      return;
    }

    const [rows]: any = await pool.query(
      'SELECT id, username, nama_lengkap, email, divisi_role, foto_profil, created_at FROM users WHERE id = ?',
      [userId]
    );

    if (rows.length === 0) {
      res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
      return;
    }

    res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// [PATCH] /api/profil/password — Ubah password
// ============================================================
export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Tidak terautentikasi.' });
      return;
    }

    const { old_password, new_password } = req.body;
    
    if (!old_password || !new_password || new_password.length < 8) {
      res.status(400).json({ success: false, message: 'Password lama dan baru (min 8 karakter) wajib diisi.' });
      return;
    }

    // Ambil password lama dari database
    const [rows]: any = await pool.query('SELECT password FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) {
      res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
      return;
    }

    const dbPassword = rows[0].password;
    let isMatch = false;

    // Verifikasi password lama
    if (dbPassword.startsWith('$2y$') || dbPassword.startsWith('$2a$') || dbPassword.startsWith('$2b$')) {
      const compatibleHash = dbPassword.replace(/^\$2y\$/, '$2a$');
      isMatch = await bcrypt.compare(old_password, compatibleHash);
    } else {
      const inputMd5 = crypto.createHash('md5').update(old_password).digest('hex');
      isMatch = dbPassword === old_password || dbPassword === inputMd5;
    }

    if (!isMatch) {
      res.status(401).json({ success: false, message: 'Password saat ini salah.' });
      return;
    }

    const hashed = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);

    await logAudit(userId, 'Memperbarui kredensial password.', req.ip, 'Success');

    res.json({ success: true, message: 'Password berhasil diperbarui.' });
  } catch (error: any) {
    if ((req as any).user?.id) {
      await logAudit((req as any).user.id, 'Gagal memperbarui password.', req.ip, 'Failed');
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// [POST] /api/profil/avatar — Upload foto profil (max 2MB)
// ============================================================
export const uploadAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Tidak terautentikasi.' });
      return;
    }

    // Baca raw body sebagai base64 dari JSON payload
    const { image_data, file_name } = req.body;

    if (!image_data) {
      res.status(400).json({ success: false, message: 'Data gambar tidak ditemukan.' });
      return;
    }

    // Validasi format base64
    const matches = image_data.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
    if (!matches) {
      res.status(400).json({ success: false, message: 'Format gambar tidak valid. Gunakan PNG, JPEG, atau WebP.' });
      return;
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // Validasi ukuran: max 2MB
    if (buffer.length > 2 * 1024 * 1024) {
      res.status(400).json({ success: false, message: 'Ukuran foto maksimal 2MB.' });
      return;
    }

    // Hapus foto lama jika ada
    const [oldRows]: any = await pool.query('SELECT foto_profil FROM users WHERE id = ?', [userId]);
    if (oldRows[0]?.foto_profil) {
      const oldPath = path.join(UPLOAD_DIR, oldRows[0].foto_profil);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    // Simpan file baru
    const fileName = `avatar_${userId}_${Date.now()}.${ext}`;
    const filePath = path.join(UPLOAD_DIR, fileName);
    fs.writeFileSync(filePath, buffer);

    // Update database
    await pool.query('UPDATE users SET foto_profil = ? WHERE id = ?', [fileName, userId]);

    await logAudit(userId, 'Mengunggah foto profil baru.', req.ip, 'Success');

    res.json({ 
      success: true, 
      message: 'Foto profil berhasil diperbarui.',
      data: { foto_profil: fileName }
    });
  } catch (error: any) {
    console.error('[uploadAvatar] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// [DELETE] /api/profil/avatar — Hapus foto profil
// ============================================================
export const deleteAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Tidak terautentikasi.' });
      return;
    }

    const [rows]: any = await pool.query('SELECT foto_profil FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) {
      res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
      return;
    }

    const foto = rows[0].foto_profil;
    if (foto) {
      const filePath = path.join(UPLOAD_DIR, foto);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      await pool.query('UPDATE users SET foto_profil = NULL WHERE id = ?', [userId]);
      await logAudit(userId, 'Menghapus foto profil.', req.ip, 'Success');
    }

    res.json({ success: true, message: 'Foto profil berhasil dihapus.' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// [POST] /api/profil/email/request — Pengajuan Ganti Email (RBAC)
// ============================================================
import crypto from 'crypto';

export const requestEmailChange = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Tidak terautentikasi.' });
      return;
    }

    const { email_baru } = req.body;
    if (!email_baru) {
      res.status(400).json({ success: false, message: 'Email baru wajib diisi.' });
      return;
    }

    // Cek RBAC
    if (user.divisi_role === 'IT Support') {
      res.status(403).json({ success: false, message: 'IT Support dilarang mengganti email secara mandiri.' });
      return;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const status = user.divisi_role === 'Owner' ? 'Pending_Verification' : 'Pending_Approval';

    // Cek apakah ada pengajuan sebelumnya
    const [existing]: any = await pool.query(
      'SELECT id FROM pengajuan_ganti_email WHERE id_user = ? AND status IN ("Pending_Approval", "Pending_Verification")',
      [user.id]
    );

    if (existing.length > 0) {
      await pool.query(
        'UPDATE pengajuan_ganti_email SET email_baru = ?, status = ?, token_verifikasi = ?, updated_at = NOW() WHERE id = ?',
        [email_baru, status, token, existing[0].id]
      );
    } else {
      await pool.query(
        'INSERT INTO pengajuan_ganti_email (id_user, email_baru, status, token_verifikasi) VALUES (?, ?, ?, ?)',
        [user.id, email_baru, status, token]
      );
    }

    let msg = '';
    if (status === 'Pending_Verification') {
      msg = `Pengajuan ganti email berhasil. Simulasi Token: ${token}`;
      await logAudit(user.id, `Mengajukan ganti email ke ${email_baru} (Otomatis Pending Verification).`, req.ip, 'Success');
    } else {
      msg = 'Pengajuan ganti email berhasil dibuat dan menunggu persetujuan IT Support.';
      await logAudit(user.id, `Mengajukan ganti email ke ${email_baru} (Menunggu Approval).`, req.ip, 'Warning');
    }

    res.json({ success: true, message: msg, token: status === 'Pending_Verification' ? token : null });
  } catch (error: any) {
    if ((req as any).user?.id) {
      await logAudit((req as any).user.id, 'Gagal mengajukan ganti email.', req.ip, 'Failed');
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// [POST] /api/profil/email/verify — Verifikasi Token Ganti Email
// ============================================================
export const verifyEmailChange = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Tidak terautentikasi.' });
      return;
    }

    const { token } = req.body;
    if (!token) {
      res.status(400).json({ success: false, message: 'Token verifikasi wajib diisi.' });
      return;
    }

    const [rows]: any = await pool.query(
      'SELECT id, email_baru FROM pengajuan_ganti_email WHERE id_user = ? AND token_verifikasi = ? AND status = "Pending_Verification"',
      [user.id, token]
    );

    if (rows.length === 0) {
      res.status(400).json({ success: false, message: 'Token tidak valid atau pengajuan belum disetujui.' });
      return;
    }

    const pengajuan = rows[0];

    // Transaksi: Update users email & update status pengajuan
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      
      await connection.query('UPDATE users SET email = ? WHERE id = ?', [pengajuan.email_baru, user.id]);
      await connection.query('UPDATE pengajuan_ganti_email SET status = "Completed", updated_at = NOW() WHERE id = ?', [pengajuan.id]);
      
      await connection.commit();
      await logAudit(user.id, `Berhasil memverifikasi pergantian email ke ${pengajuan.email_baru}.`, req.ip, 'Success');
      res.json({ success: true, message: 'Email berhasil diverifikasi dan diperbarui.' });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (error: any) {
    if ((req as any).user?.id) {
      await logAudit((req as any).user.id, 'Gagal memverifikasi ganti email.', req.ip, 'Failed');
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// [POST] /api/profil/telegram/test — Test Telegram API
// ============================================================
export const testTelegram = async (req: Request, res: Response): Promise<void> => {
  try {
    const { chat_id } = req.body;
    
    if (!chat_id) {
      res.status(400).json({ success: false, message: 'Chat ID wajib diisi.' });
      return;
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      res.status(500).json({ success: false, message: 'TELEGRAM_BOT_TOKEN belum dikonfigurasi di .env server.' });
      return;
    }

    const text = "Halo! Ini adalah pesan uji coba dari sistem Motekar ERP. Integrasi Telegram Anda berhasil! 🚀";
    
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat_id,
        text: text
      })
    });

    const data: any = await response.json();
    if (!response.ok || !data.ok) {
      res.status(400).json({ success: false, message: `Gagal mengirim pesan via API Telegram: ${data.description || 'Unknown error'}` });
      return;
    }

    res.json({ success: true, message: 'Pesan uji coba berhasil dikirim ke Telegram.' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// [GET] /api/profil/audit — Ambil riwayat audit user
// ============================================================
export const getAuditLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Tidak terautentikasi.' });
      return;
    }

    const [rows]: any = await pool.query(
      'SELECT id, action, ip_address, status, DATE_FORMAT(created_at, "%d/%m/%Y %H:%i") as waktu FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 5',
      [userId]
    );

    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
