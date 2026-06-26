import pool from '../config/database.js';
import bcrypt from 'bcrypt';

async function seedFinanceUser() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    console.log('\n========================================');
    console.log('🌱 FINANCE USER SEEDER');
    console.log('========================================\n');

    const hashedPassword = await bcrypt.hash('password123', 10);

    const user = { username: 'finance', nama_lengkap: 'Staf Keuangan / Finance', email: 'finance@motekar.com', divisi_role: 'Keuangan', status: 'Aktif' };

    const [existingUser]: any = await connection.query(
      'SELECT id FROM users WHERE username = ?', [user.username]
    );

    if (existingUser.length === 0) {
      await connection.query(
        `INSERT INTO users (username, password, nama_lengkap, email, divisi_role, status) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [user.username, hashedPassword, user.nama_lengkap, user.email, user.divisi_role, user.status]
      );
      console.log(`      ✔ Akun "${user.username}" (${user.divisi_role}) berhasil dibuat.`);
    } else {
      console.log(`      ⊘ Akun "${user.username}" sudah ada, skip.`);
    }

    await connection.commit();

    console.log('\n========================================');
    console.log('✅ FINANCE USER SEEDER COMPLETE!');
    console.log('Password: password123');
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

seedFinanceUser();
