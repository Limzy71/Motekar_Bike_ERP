import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './config/database.js';
import apiRoutes from './routes.js'; // Import routing baru

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5050;

app.use(cors());
app.use(express.json()); // Penting agar Express bisa membaca body JSON dari Frontend

// Daftarkan routing dengan prefix /api
app.use('/api', apiRoutes);

app.get('/api/health', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) as total_user FROM users');
    const data = rows as any[];
    res.json({ 
      status: 'success', 
      message: `Backend Terkoneksi ke MySQL! Total baris di tabel users: ${data[0].total_user}` 
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: `Gagal membaca database: ${error.message}` });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server]: Backend running at http://127.0.0.1:${PORT}`);
});