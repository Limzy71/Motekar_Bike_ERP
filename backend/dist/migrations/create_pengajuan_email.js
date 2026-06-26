import pool from '../config/database.js';
/**
 * Migration: Membuat tabel pengajuan_ganti_email untuk RBAC Ganti Email.
 */
async function up() {
    try {
        console.log('[Migration] Creating pengajuan_ganti_email table...');
        await pool.query(`
      CREATE TABLE IF NOT EXISTS pengajuan_ganti_email (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_user INT NOT NULL,
        email_baru VARCHAR(150) NOT NULL,
        status ENUM('Pending_Approval', 'Pending_Verification', 'Rejected', 'Completed') NOT NULL DEFAULT 'Pending_Approval',
        token_verifikasi VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (id_user) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);
        console.log('      ✔ Table pengajuan_ganti_email created successfully.');
    }
    catch (error) {
        console.error('[Migration] FAILED:', error.message);
    }
    finally {
        process.exit(0);
    }
}
up();
