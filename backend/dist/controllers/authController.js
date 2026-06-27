import pool from '../config/database.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { logAudit } from '../helpers/auditHelper.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../helpers/asyncHandler.js';
export const login = asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    const users = rows;
    if (users.length === 0) {
        throw new AppError('Username tidak ditemukan!', 401);
    }
    const user = users[0];
    const dbPassword = user.password;
    let isMatch = false;
    // 1. Cek jika password di DB menggunakan Bcrypt ($2y$ PHP, $2a$ legacy, $2b$ Node.js modern)
    if (dbPassword.startsWith('$2y$') || dbPassword.startsWith('$2a$') || dbPassword.startsWith('$2b$')) {
        // PHP menggunakan prefix $2y$, Node.js bcrypt v5+ menggunakan $2b$
        // bcrypt.compare() di Node.js secara native mendukung ketiga prefix
        const compatibleHash = dbPassword.replace(/^\$2y\$/, '$2a$');
        isMatch = await bcrypt.compare(password, compatibleHash);
    }
    // 2. Cek jika password menggunakan MD5 atau Plain Text
    if (!isMatch) {
        const inputMd5 = crypto.createHash('md5').update(password).digest('hex');
        isMatch = dbPassword === password || dbPassword === inputMd5;
    }
    if (!isMatch) {
        await logAudit(user.id, 'Percobaan login gagal (Password salah).', req.ip, 'Failed');
        throw new AppError('Password salah!', 401);
    }
    // Generate JWT Access Token (15 menit)
    const accessToken = jwt.sign({ id: user.id, username: user.username, nama_lengkap: user.nama_lengkap, divisi_role: user.divisi_role }, process.env.JWT_SECRET, { expiresIn: '15m' });
    // Generate JWT Refresh Token (7 hari)
    const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
    // Simpan refresh_token ke database
    await pool.query('UPDATE users SET refresh_token = ? WHERE id = ?', [refreshToken, user.id]);
    await logAudit(user.id, 'Login sistem berhasil.', req.ip, 'Success');
    res.json({
        status: 'success',
        message: 'Login berhasil!',
        user: {
            id: user.id,
            username: user.username,
            nama: user.nama_lengkap || user.username,
            divisi_role: user.divisi_role || 'user',
            api_token: accessToken, // Frontend masih memanggilnya api_token, biarkan agar kompatibel
            refresh_token: refreshToken
        }
    });
});
export const refreshToken = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
        throw new AppError('Refresh token tidak ditemukan!', 401);
    }
    try {
        const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        // Cek database untuk memastikan token masih valid (belum di-logout)
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ? AND refresh_token = ?', [payload.id, refreshToken]);
        const users = rows;
        if (users.length === 0) {
            throw new AppError('Refresh token tidak valid atau sudah ditarik!', 401);
        }
        const user = users[0];
        // Generate accessToken baru
        const newAccessToken = jwt.sign({ id: user.id, username: user.username, nama_lengkap: user.nama_lengkap, divisi_role: user.divisi_role }, process.env.JWT_SECRET, { expiresIn: '15m' });
        res.json({
            success: true,
            data: {
                api_token: newAccessToken
            }
        });
    }
    catch (error) {
        throw new AppError('Refresh token expired atau tidak valid!', 401);
    }
});
export const logout = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
        await pool.query('UPDATE users SET refresh_token = NULL WHERE refresh_token = ?', [refreshToken]);
    }
    res.json({ success: true, message: 'Logout berhasil.' });
});
