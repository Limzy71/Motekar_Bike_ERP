import pool from '../config/database.js';

async function migrate() {
  try {
    console.log('Running migration: rename_restock_requests...');
    
    const sql = `RENAME TABLE gudang_restock_requests TO pengadaan_restock_requests;`;
    
    await pool.query(sql);
    console.log('Migration rename_restock_requests completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    process.exit();
  }
}

migrate();
