import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import morgan from 'morgan';
import pool from './config/database.js';
import apiRoutes from './routes.js'; // Import routing baru
import { errorMiddleware } from './middlewares/errorMiddleware.js';
import { stream } from './config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5050;

app.use(cors());
app.use(express.json({ limit: '5mb' })); // 5mb untuk upload base64 avatar

// Morgan Logging: [METHOD] /url - STATUS_CODE - RESPONSE_TIME ms
app.use(morgan(':method :url - :status - :response-time ms', { stream }));

// Serve static files (uploaded avatars)
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

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

// Registrasi Global Error Handling Middleware (WAJIB di akhir)
app.use(errorMiddleware);

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`[Server]: Backend running at http://127.0.0.1:${PORT}`);
  
  // Auto-upgrade database schema for qc_inspeksi if needed
  try {
    const [columns]: any = await pool.query("SHOW COLUMNS FROM `qc_inspeksi` LIKE 'wo_id'");
    if (columns.length === 0) {
      console.log("[Server]: Upgrading qc_inspeksi schema...");
      await pool.query("ALTER TABLE `qc_inspeksi` ADD COLUMN `wo_id` int DEFAULT NULL AFTER `id` ");
      await pool.query("ALTER TABLE `qc_inspeksi` ADD COLUMN `id_inventory_fg` int DEFAULT NULL AFTER `wo_id` ");
      await pool.query("ALTER TABLE `qc_inspeksi` ADD KEY `wo_id` (`wo_id`)");
      await pool.query("ALTER TABLE `qc_inspeksi` ADD KEY `id_inventory_fg` (`id_inventory_fg`)");
      await pool.query("ALTER TABLE `qc_inspeksi` ADD CONSTRAINT `qc_inspeksi_ibfk_1` FOREIGN KEY (`wo_id`) REFERENCES `operasi_wo_header` (`id`) ON DELETE SET NULL");
      await pool.query("ALTER TABLE `qc_inspeksi` ADD CONSTRAINT `qc_inspeksi_ibfk_2` FOREIGN KEY (`id_inventory_fg`) REFERENCES `inventory_stok` (`id`) ON DELETE SET NULL");
      console.log("[Server]: qc_inspeksi schema upgraded successfully.");
    }
  } catch (err: any) {
    console.error("[Server]: Schema upgrade failed or already run:", err.message);
  }
});