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
    // Update pengadaan_po_header ENUM
    await connection.query(`
      ALTER TABLE pengadaan_po_header 
      MODIFY COLUMN status ENUM('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','COMPLETED','PARTIAL_RECEIVED_WITH_DEFECT','CANCELLED') NOT NULL DEFAULT 'DRAFT'
    `);
    console.log('PO status enum updated.');

    // Update penerimaan_barang table for e-POD photos
    await connection.query(`
      ALTER TABLE penerimaan_barang 
      ADD COLUMN foto_barang TEXT NULL,
      ADD COLUMN foto_surat_jalan TEXT NULL,
      ADD COLUMN foto_packaging TEXT NULL
    `);
    console.log('Added e-POD columns to penerimaan_barang.');

    // Create rtv_dokumen table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS rtv_dokumen (
        id INT AUTO_INCREMENT PRIMARY KEY,
        no_rtv VARCHAR(50) NOT NULL UNIQUE,
        penerimaan_id INT NOT NULL,
        barang_id INT NOT NULL,
        qty_retur INT NOT NULL,
        alasan TEXT,
        status ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (penerimaan_id) REFERENCES penerimaan_barang(id) ON DELETE CASCADE,
        FOREIGN KEY (barang_id) REFERENCES inventory_stok(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);
    console.log('Created rtv_dokumen table.');

  } catch(e) {
    console.error(e);
  } finally {
    connection.end();
  }
}

run();
