import pool from '../config/database.js';

async function migrate() {
  const connection = await pool.getConnection();
  try {
    console.log('Running Goods Receipt migration...');
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS penerimaan_barang (
        id INT NOT NULL AUTO_INCREMENT,
        id_po_header INT NOT NULL,
        tanggal_terima TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        penerima VARCHAR(150) NOT NULL,
        surat_jalan_vendor VARCHAR(100),
        catatan TEXT,
        PRIMARY KEY (id),
        FOREIGN KEY (id_po_header) REFERENCES pengadaan_po_header(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS detail_penerimaan (
        id INT NOT NULL AUTO_INCREMENT,
        id_penerimaan INT NOT NULL,
        id_inventory_material INT NOT NULL,
        qty_diterima INT NOT NULL DEFAULT 0,
        kondisi ENUM('BAIK', 'RUSAK') NOT NULL DEFAULT 'BAIK',
        PRIMARY KEY (id),
        FOREIGN KEY (id_penerimaan) REFERENCES penerimaan_barang(id) ON DELETE CASCADE,
        FOREIGN KEY (id_inventory_material) REFERENCES inventory_stok(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    console.log('Goods Receipt migration completed successfully!');
  } catch (error: any) {
    console.error('Migration error:', error.message);
  } finally {
    connection.release();
    process.exit(0);
  }
}

migrate();
