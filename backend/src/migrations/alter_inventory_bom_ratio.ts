import pool from '../config/database.js';

async function migrate() {
  const connection = await pool.getConnection();
  try {
    console.log('Running migration: alter_inventory_bom_ratio...');
    
    await connection.query(`
      ALTER TABLE inventory_stok
      ADD COLUMN bom_ratio INT NOT NULL DEFAULT 1 AFTER minimum_stock;
    `);

    console.log('Migration alter_inventory_bom_ratio completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    connection.release();
    process.exit();
  }
}

migrate();
