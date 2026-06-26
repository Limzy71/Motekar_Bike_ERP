import pool from '../config/database.js';
/**
 * Migration: Menambahkan kolom foto_profil ke tabel users.
 */
async function up() {
    try {
        console.log('[Migration] Adding foto_profil column to users...');
        const [cols] = await pool.query("SHOW COLUMNS FROM users LIKE 'foto_profil'");
        if (cols.length === 0) {
            await pool.query('ALTER TABLE users ADD COLUMN foto_profil VARCHAR(255) DEFAULT NULL AFTER email');
            console.log('      ✔ Column foto_profil added to users table.');
        }
        else {
            console.log('      ⊘ Column foto_profil already exists, skipping.');
        }
        console.log('[Migration] Done.');
    }
    catch (error) {
        console.error('[Migration] FAILED:', error.message);
    }
    finally {
        process.exit(0);
    }
}
up();
