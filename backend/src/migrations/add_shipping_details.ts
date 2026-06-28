import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'motekar_db'
  });

  try {
    await connection.query(`
      ALTER TABLE penjualan_so_header 
      ADD COLUMN nama_supir VARCHAR(100), 
      ADD COLUMN plat_nomor VARCHAR(50), 
      ADD COLUMN no_telepon_supir VARCHAR(50)
    `);
    console.log('Added shipping columns (nama_supir, plat_nomor, no_telepon_supir) to penjualan_so_header.');
  } catch(e) {
    console.error('Migration error:', e);
  } finally {
    connection.end();
  }
}

run();
