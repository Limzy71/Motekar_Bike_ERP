import pool from '../config/database.js';

async function migrate() {
  const connection = await pool.getConnection();
  try {
    console.log('Running migration: create_po_tables...');
    await connection.beginTransaction();

    await connection.query(`
      CREATE TABLE IF NOT EXISTS pengadaan_po_header (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nomor_po VARCHAR(50) NOT NULL UNIQUE,
        id_pr INT NOT NULL,
        id_vendor INT NOT NULL,
        status_po ENUM('Draft', 'Issued', 'Manager_Approved', 'Sent_to_Vendor', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Draft',
        total_harga DECIMAL(15,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (id_pr) REFERENCES pengadaan_pr_header(id) ON DELETE CASCADE,
        FOREIGN KEY (id_vendor) REFERENCES master_vendor(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS pengadaan_po_detail (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_po_header INT NOT NULL,
        id_barang INT NULL,
        kode_barang VARCHAR(50) NOT NULL,
        qty_pesan INT NOT NULL,
        harga_satuan DECIMAL(15,2) NOT NULL DEFAULT 0,
        subtotal DECIMAL(15,2) NOT NULL DEFAULT 0,
        FOREIGN KEY (id_po_header) REFERENCES pengadaan_po_header(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    // Note: inventory_stok already has harga_standar, we will use it for harga_satuan.

    await connection.commit();
    console.log('Migration create_po_tables completed successfully.');
  } catch (error) {
    await connection.rollback();
    console.error('Migration failed:', error);
  } finally {
    connection.release();
    process.exit();
  }
}

migrate();
