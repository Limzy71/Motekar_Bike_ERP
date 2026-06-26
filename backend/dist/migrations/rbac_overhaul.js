import pool from '../config/database.js';
import bcrypt from 'bcrypt';
async function up() {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        console.log('Menjalankan Migrasi RBAC Overhaul: Lahirnya Sang Jenderal...');
        // Catatan: Kolom divisi_role adalah VARCHAR(50), bukan ENUM.
        // Jadi tidak perlu ALTER TABLE. Kita langsung insert/upsert user manager.
        const hashedPassword = await bcrypt.hash('admin123', 10); // Standard default password
        const managerUser = {
            username: 'manager',
            nama_lengkap: 'Manajer Operasional',
            email: 'manager@motekar.com',
            divisi_role: 'General Manager',
            password: hashedPassword
        };
        // Idempotent Insert (Insert Ignore atau On Duplicate Key Update)
        console.log(`Mendaftarkan akun Jenderal (General Manager)...`);
        await connection.query(`INSERT INTO users (username, password, nama_lengkap, email, divisi_role) 
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
       nama_lengkap = VALUES(nama_lengkap),
       divisi_role = VALUES(divisi_role)`, [managerUser.username, managerUser.password, managerUser.nama_lengkap, managerUser.email, managerUser.divisi_role]);
        await connection.commit();
        console.log('✔ Migrasi RBAC Overhaul Sukses. Sang Jenderal telah lahir.');
    }
    catch (error) {
        await connection.rollback();
        console.error('✘ Migrasi FAILED:', error.message);
    }
    finally {
        connection.release();
        process.exit(0);
    }
}
up();
