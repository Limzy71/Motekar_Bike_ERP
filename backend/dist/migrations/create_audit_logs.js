import pool from '../config/database.js';
/**
 * Migration: Membuat tabel audit_logs untuk Sistem Audit Otomatis.
 */
async function up() {
    try {
        console.log('[Migration] Creating audit_logs table...');
        await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        action VARCHAR(255) NOT NULL,
        ip_address VARCHAR(45),
        status ENUM('Success', 'Failed', 'Warning') NOT NULL DEFAULT 'Success',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);
        console.log('      ✔ Table audit_logs created successfully.');
    }
    catch (error) {
        console.error('[Migration] FAILED:', error.message);
    }
    finally {
        process.exit(0);
    }
}
up();
