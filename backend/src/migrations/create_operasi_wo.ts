import pool from '../config/database.js';

async function migrate() {
  const sql = `
    CREATE TABLE IF NOT EXISTS operasi_wo (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nomor_wo VARCHAR(50) UNIQUE NOT NULL,
      kode_sepeda VARCHAR(50) NOT NULL,
      jumlah_produksi INT NOT NULL,
      status ENUM('Menunggu', 'Perakitan Frame', 'Setup Drivetrain', 'Selesai') NOT NULL DEFAULT 'Menunggu',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  try {
    console.log('Running migration: create_operasi_wo...');
    await pool.query(sql);
    console.log('Table operasi_wo created successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    process.exit();
  }
}

migrate();
