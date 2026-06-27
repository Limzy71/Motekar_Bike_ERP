import pool from '../config/database.js';

async function migrate() {
  const connection = await pool.getConnection();
  try {
    console.log('Running Sales Order migration...');
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sales_order (
        id INT NOT NULL AUTO_INCREMENT,
        no_so VARCHAR(100) NOT NULL,
        nama_customer VARCHAR(200) NOT NULL,
        tanggal_order DATE NOT NULL,
        total_harga DECIMAL(15,2) NOT NULL,
        status ENUM('DRAFT', 'APPROVED', 'SHIPPED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY no_so (no_so)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS sales_order_detail (
        id INT NOT NULL AUTO_INCREMENT,
        so_id INT NOT NULL,
        barang_id INT NOT NULL,
        qty_order INT NOT NULL,
        harga_satuan DECIMAL(15,2) NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY (so_id) REFERENCES sales_order(id) ON DELETE CASCADE,
        FOREIGN KEY (barang_id) REFERENCES inventory_stok(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    console.log('Sales Order migration completed successfully!');
  } catch (error: any) {
    console.error('Migration error:', error.message);
  } finally {
    connection.release();
    process.exit(0);
  }
}

migrate();
