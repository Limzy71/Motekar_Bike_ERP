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
      UPDATE penjualan_so_header 
      SET nama_supir = 'Budi (Dakota)', 
          plat_nomor = 'D 1234 ABC', 
          no_telepon_supir = '081234567890' 
      WHERE nomor_so = 'SO-MTK-2026-0001'
    `);
    console.log('Updated SO-MTK-2026-0001 with mock shipping details.');
  } catch(e) {
    console.error('Migration error:', e);
  } finally {
    connection.end();
  }
}

run();
