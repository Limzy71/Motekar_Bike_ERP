import pool from '../config/database.js';
import bcrypt from 'bcrypt';

async function seedAdditionalUsers() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    console.log('\n========================================');
    console.log('🌱 ADDITIONAL USERS SEEDER');
    console.log('========================================\n');

    const hashedPassword = await bcrypt.hash('password123', 10);

    const newUsers = [
      { username: 'admin',     nama_lengkap: 'IT & System Administrator',       email: 'admin@motekar.com',     divisi_role: 'IT Support' },
      { username: 'pengadaan', nama_lengkap: 'Staf Pengadaan',    email: 'pengadaan@motekar.com', divisi_role: 'Pengadaan' },
      { username: 'qc',        nama_lengkap: 'Staf Kendali Mutu', email: 'qc@motekar.com',        divisi_role: 'Kendali Mutu' },
      { username: 'sales',     nama_lengkap: 'Staf Penjualan',    email: 'sales@motekar.com',     divisi_role: 'Penjualan & Penagihan' },
      { username: 'produksi',  nama_lengkap: 'Staf Produksi',     email: 'produksi@motekar.com',  divisi_role: 'Operasi Inti' },
      { username: 'marketing', nama_lengkap: 'Staf Pemasaran',    email: 'marketing@motekar.com', divisi_role: 'Pemasaran' },
      { username: 'gudang',    nama_lengkap: 'Staf Gudang',       email: 'gudang@motekar.com',    divisi_role: 'Gudang' },
    ];

    for (const user of newUsers) {
      const [existingUser]: any = await connection.query(
        'SELECT id FROM users WHERE username = ?', [user.username]
      );

      if (existingUser.length === 0) {
        await connection.query(
          `INSERT INTO users (username, password, nama_lengkap, email, divisi_role) 
           VALUES (?, ?, ?, ?, ?)`,
          [user.username, hashedPassword, user.nama_lengkap, user.email, user.divisi_role]
        );
        console.log(`      ✔ Akun "${user.username}" (${user.divisi_role}) berhasil dibuat.`);
      } else {
        console.log(`      ⊘ Akun "${user.username}" sudah ada, skip.`);
      }
    }

    await connection.commit();

    console.log('\n========================================');
    console.log('✅ ADDITIONAL USERS SEEDER COMPLETE!');
    console.log('Semua password akun: password123');
    console.log('========================================\n');

  } catch (error: any) {
    await connection.rollback();
    console.error('\n[✘] Seeder GAGAL:', error.message);
    console.error(error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

seedAdditionalUsers();
