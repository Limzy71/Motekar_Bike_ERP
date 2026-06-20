import pool from '../config/database.js';

async function migrate() {
  const sqlHeader = `
    CREATE TABLE IF NOT EXISTS manufaktur_bom_header (
      id_bom VARCHAR(50) PRIMARY KEY,
      kode_item_parent VARCHAR(50) NOT NULL,
      nama_resep VARCHAR(150) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  const sqlDetail = `
    CREATE TABLE IF NOT EXISTS manufaktur_bom_detail (
      id_detail INT AUTO_INCREMENT PRIMARY KEY,
      id_bom VARCHAR(50) NOT NULL,
      kode_item_komponen VARCHAR(50) NOT NULL,
      qty_kebutuhan INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_bom) REFERENCES manufaktur_bom_header(id_bom) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  try {
    console.log('Running migration: create_manufaktur_bom...');
    await pool.query(sqlHeader);
    console.log('Table manufaktur_bom_header created successfully.');
    
    await pool.query(sqlDetail);
    console.log('Table manufaktur_bom_detail created successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    process.exit();
  }
}

migrate();
