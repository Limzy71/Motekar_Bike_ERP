import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './config/database.js';
import apiRoutes from './routes.js'; // Import routing baru
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config();
const app = express();
const PORT = Number(process.env.PORT) || 5050;
app.use(cors());
app.use(express.json({ limit: '5mb' })); // 5mb untuk upload base64 avatar
// Serve static files (uploaded avatars)
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
// Daftarkan routing dengan prefix /api
app.use('/api', apiRoutes);
app.get('/api/health', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT COUNT(*) as total_user FROM users');
        const data = rows;
        res.json({
            status: 'success',
            message: `Backend Terkoneksi ke MySQL! Total baris di tabel users: ${data[0].total_user}`
        });
    }
    catch (error) {
        res.status(500).json({ status: 'error', message: `Gagal membaca database: ${error.message}` });
    }
});
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server]: Backend running at http://127.0.0.1:${PORT}`);
});
