import db from '../config/database.js';

export async function up() {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        await conn.query(`
            CREATE TABLE IF NOT EXISTS retailer_prospek (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nama_toko VARCHAR(255) NOT NULL,
                pic VARCHAR(100) NOT NULL,
                kontak VARCHAR(50) NOT NULL,
                dokumen_nib VARCHAR(255) NOT NULL,
                status ENUM('PROSPEK', 'VERIFIED', 'REJECTED') DEFAULT 'PROSPEK',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS klaim_garansi (
                id INT AUTO_INCREMENT PRIMARY KEY,
                no_klaim VARCHAR(50) NOT NULL UNIQUE,
                ar_invoice_id INT NOT NULL,
                keluhan TEXT NOT NULL,
                foto_kerusakan VARCHAR(255) NOT NULL,
                status ENUM('PENDING_VALIDATION', 'QC_INVESTIGATION', 'REPLACEMENT_APPROVED', 'REJECTED') DEFAULT 'PENDING_VALIDATION',
                resolusi_catatan TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (ar_invoice_id) REFERENCES ar_invoice(id) ON DELETE CASCADE
            )
        `);

        await conn.commit();
        console.log("Migration successful: add_crm_aftersales");
    } catch (err) {
        await conn.rollback();
        console.error("Migration failed: add_crm_aftersales", err);
        throw err;
    } finally {
        conn.release();
    }
}

export async function down() {
    const conn = await db.getConnection();
    try {
        await conn.query('DROP TABLE IF EXISTS klaim_garansi');
        await conn.query('DROP TABLE IF EXISTS retailer_prospek');
        console.log("Rollback successful: add_crm_aftersales");
    } catch (err) {
        console.error("Rollback failed: add_crm_aftersales", err);
        throw err;
    } finally {
        conn.release();
    }
}
