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
      ALTER TABLE operasi_wo_header 
      MODIFY COLUMN status ENUM('DRAFT','IN_PROGRESS','KITTING_RELEASED','SUB_ASSEMBLY','FINAL_ASSEMBLY','TUNING_QC','COMPLETED','CANCELLED') NOT NULL DEFAULT 'DRAFT', 
      ADD COLUMN catatan_rework TEXT, 
      ADD COLUMN qc_history JSON
    `);
    console.log('Success altering table');
  } catch(e) {
    console.error(e);
  } finally {
    connection.end();
  }
}

run();
