import pool from '../config/database.js';

async function migrate() {
  try {
    console.log('Running migration: create_restock_requests...');
    
    const sql = `
      CREATE TABLE IF NOT EXISTS gudang_restock_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_inventory_material INT NOT NULL,
        nomor_wo VARCHAR(50) NOT NULL,
        jumlah_diminta INT NOT NULL,
        status ENUM('Pending', 'Selesai') NOT NULL DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_restock_material FOREIGN KEY (id_inventory_material) REFERENCES inventory_stok(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
    
    await pool.query(sql);
    console.log('Migration create_restock_requests completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    process.exit();
  }
}

migrate();
