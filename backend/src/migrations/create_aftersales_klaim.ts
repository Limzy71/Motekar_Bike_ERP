import pool from '../config/database.js';

async function migrate() {
    try {
        console.log('Creating aftersales_klaim table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS aftersales_klaim (
                id_klaim VARCHAR(50) PRIMARY KEY,
                id_sales_order INT NOT NULL,
                nama_retailer VARCHAR(255) NOT NULL,
                kode_item_fg VARCHAR(100) NOT NULL,
                tanggal_klaim DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                deskripsi_keluhan TEXT NOT NULL,
                foto_bukti_kerusakan LONGTEXT NOT NULL,
                status_klaim ENUM('SUBMITTED', 'IN_INSPECTION', 'APPROVED_REPLACE', 'APPROVED_REWORK', 'REJECTED') DEFAULT 'SUBMITTED',
                catatan_investigasi_qc TEXT,
                FOREIGN KEY (id_sales_order) REFERENCES sales_order_header(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
