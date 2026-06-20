import pool from '../config/database.js';

async function migrate() {
  const sql = `
    CREATE TABLE IF NOT EXISTS penjualan_so (
      id INT AUTO_INCREMENT PRIMARY KEY,
      no_so VARCHAR(50) UNIQUE NOT NULL,
      nama_customer VARCHAR(100) NOT NULL,
      kode_sepeda VARCHAR(50) NOT NULL,
      qty INT NOT NULL,
      total_harga DECIMAL(15, 2) NOT NULL,
      tanggal_order DATETIME DEFAULT CURRENT_TIMESTAMP,
      status ENUM('Draft', 'Confirmed', 'Shipped') NOT NULL DEFAULT 'Draft',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  try {
    console.log('Running migration: create_penjualan_so...');
    await pool.query(sql);
    console.log('Table penjualan_so created successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    process.exit();
  }
}

migrate();
