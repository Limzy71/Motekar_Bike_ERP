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
      { username: 'agus',      nama_lengkap: 'Ir. Agus Hexagraha, M.Kom', email: 'agus@motekar.com',       divisi_role: 'Owner' },
      { username: 'manager',   nama_lengkap: 'General Manager',           email: 'manager@motekar.com',    divisi_role: 'General Manager' },
      { username: 'admin',     nama_lengkap: 'IT Support',                email: 'it_support@motekar.com', divisi_role: 'IT Support' },
      { username: 'pengadaan', nama_lengkap: 'Tim Pengadaan',             email: 'pengadaan@motekar.com',  divisi_role: 'Pengadaan' },
      { username: 'gudang',    nama_lengkap: 'Tim Gudang',                email: 'gudang@motekar.com',     divisi_role: 'Gudang' },
      { username: 'produksi',  nama_lengkap: 'Operasi Inti',              email: 'operasi@motekar.com',    divisi_role: 'Operasi Inti' },
      { username: 'qc',        nama_lengkap: 'Kendali Mutu',              email: 'qc@motekar.com',         divisi_role: 'Kendali Mutu' },
      { username: 'keuangan',  nama_lengkap: 'Tim Keuangan',              email: 'keuangan@motekar.com',   divisi_role: 'Keuangan & Akuntansi' },
      { username: 'penjualan', nama_lengkap: 'Pemasaran & Penjualan',     email: 'penjualan@motekar.com',  divisi_role: 'Pemasaran & Penjualan' },
      { username: 'legal',     nama_lengkap: 'Legal & Kepatuhan',         email: 'legal@motekar.com',      divisi_role: 'Legal & Kepatuhan' },
      { username: 'testing',   nama_lengkap: 'Testing / Guest',           email: 'guest@motekar.com',      divisi_role: 'Owner' },
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
