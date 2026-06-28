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
    const [pos]: any = await connection.query(`SELECT id, nomor_po, status FROM pengadaan_po_header`);
    console.log('--- Purchase Orders ---');
    console.table(pos);
    
    const [grs]: any = await connection.query(`SELECT id, id_po_header, tanggal_terima FROM penerimaan_barang`);
    console.log('\n--- Goods Receipts ---');
    console.table(grs);
  } catch(e) {
    console.error(e);
  } finally {
    connection.end();
  }
}

run();
