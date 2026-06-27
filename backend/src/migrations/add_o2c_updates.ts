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
    // 1. Update sales_order ENUM status
    await connection.query(`
      ALTER TABLE sales_order 
      MODIFY COLUMN status ENUM('DRAFT', 'APPROVED', 'SHIPPED', 'DELIVERED', 'FAILED_DELIVERY', 'CANCELLED') NOT NULL DEFAULT 'DRAFT'
    `);
    console.log('sales_order status enum updated.');

    // 2. Add stok_karantina to inventory_stok
    await connection.query(`
      ALTER TABLE inventory_stok 
      ADD COLUMN stok_karantina INT NOT NULL DEFAULT 0
    `);
    console.log('Added stok_karantina to inventory_stok.');

    // 3. Create ar_invoice table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS ar_invoice (
        id INT AUTO_INCREMENT PRIMARY KEY,
        so_id INT NOT NULL,
        total_tagihan DECIMAL(15,2) NOT NULL,
        status_pembayaran ENUM('UNPAID', 'PAID') DEFAULT 'UNPAID',
        foto_bukti_terima VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (so_id) REFERENCES sales_order(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);
    console.log('Created ar_invoice table.');

  } catch(e) {
    console.error(e);
  } finally {
    connection.end();
  }
}

run();
