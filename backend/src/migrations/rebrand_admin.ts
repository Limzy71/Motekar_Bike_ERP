import pool from '../config/database.js';

async function up() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    console.log('Menjalankan Migrasi RBAC: Rebranding Admin -> IT Support...');

    await connection.query(
      `UPDATE users SET divisi_role = 'IT Support', nama_lengkap = 'IT & System Administrator' WHERE divisi_role = 'Admin'`
    );

    await connection.commit();
    console.log('✔ Migrasi RBAC Rebranding Sukses. Admin kini menjadi IT Support.');

  } catch (error: any) {
    await connection.rollback();
    console.error('✘ Migrasi FAILED:', error.message);
  } finally {
    connection.release();
    process.exit(0);
  }
}

up();
