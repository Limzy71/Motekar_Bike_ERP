import pool from './src/config/database.js';
import bcrypt from 'bcrypt';

async function run() {
  try {
    // Generate bcrypt hash for 'testing123'
    const passwordHash = await bcrypt.hash('testing123', 10);
    
    // Hapus data lama jika ada
    await pool.query('DELETE FROM users WHERE username = ?', ['testing']);
    
    // Masukkan data baru
    await pool.query(
      'INSERT INTO users (username, password, nama_lengkap, divisi_role, status) VALUES (?, ?, ?, ?, ?)',
      ['testing', passwordHash, 'Akun testing', 'Owner', 'Aktif']
    );
    console.log('Seeder akun testing berhasil dijalankan!');
  } catch (error) {
    console.error('Gagal menjalankan seeder:', error);
  } finally {
    process.exit(0);
  }
}
run();
