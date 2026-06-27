import pool from '../config/database.js';

async function migrate() {
  const connection = await pool.getConnection();
  try {
    console.log('Running AP Finance migration...');
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS tagihan_vendor (
        id INT NOT NULL AUTO_INCREMENT,
        no_tagihan_vendor VARCHAR(150) NOT NULL,
        id_po_header INT NOT NULL,
        id_penerimaan INT NOT NULL,
        tanggal_tagihan DATE NOT NULL,
        jatuh_tempo DATE NOT NULL,
        total_tagihan DECIMAL(15,2) NOT NULL,
        status ENUM('UNPAID', 'PARTIAL', 'PAID') NOT NULL DEFAULT 'UNPAID',
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY no_tagihan_vendor (no_tagihan_vendor),
        FOREIGN KEY (id_po_header) REFERENCES pengadaan_po_header(id) ON DELETE RESTRICT,
        FOREIGN KEY (id_penerimaan) REFERENCES penerimaan_barang(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS pembayaran_vendor (
        id INT NOT NULL AUTO_INCREMENT,
        id_tagihan INT NOT NULL,
        tanggal_bayar DATE NOT NULL,
        nominal_bayar DECIMAL(15,2) NOT NULL,
        metode_bayar VARCHAR(100) NOT NULL,
        referensi_transaksi VARCHAR(200),
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        FOREIGN KEY (id_tagihan) REFERENCES tagihan_vendor(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    console.log('AP Finance migration completed successfully!');
  } catch (error: any) {
    console.error('Migration error:', error.message);
  } finally {
    connection.release();
    process.exit(0);
  }
}

migrate();
