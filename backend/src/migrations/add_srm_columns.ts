import pool from '../config/database.js';

async function migrate() {
  const connection = await pool.getConnection();
  try {
    console.log('Running SRM migration: adding vendor columns...');
    
    // Add kode_vendor column
    await connection.query(`
      ALTER TABLE master_vendor 
      ADD COLUMN IF NOT EXISTS kode_vendor VARCHAR(50) NULL AFTER id
    `).catch(() => console.log('kode_vendor might already exist, skipping.'));

    // Add kategori column
    await connection.query(`
      ALTER TABLE master_vendor 
      ADD COLUMN IF NOT EXISTS kategori VARCHAR(100) NULL AFTER nama_vendor
    `).catch(() => console.log('kategori might already exist, skipping.'));

    // Add status_vendor column
    await connection.query(`
      ALTER TABLE master_vendor 
      ADD COLUMN IF NOT EXISTS status_vendor ENUM('AKTIF','INAKTIF','BLACKLIST') NOT NULL DEFAULT 'AKTIF'
    `).catch(() => console.log('status_vendor might already exist, skipping.'));

    // Add alasan_blacklist column
    await connection.query(`
      ALTER TABLE master_vendor 
      ADD COLUMN IF NOT EXISTS alasan_blacklist TEXT NULL
    `).catch(() => console.log('alasan_blacklist might already exist, skipping.'));

    // Add skor_rating column
    await connection.query(`
      ALTER TABLE master_vendor 
      ADD COLUMN IF NOT EXISTS skor_rating DECIMAL(3,1) NOT NULL DEFAULT 5.0
    `).catch(() => console.log('skor_rating might already exist, skipping.'));

    console.log('SRM migration completed successfully!');
  } catch (error: any) {
    console.error('Migration error:', error.message);
  } finally {
    connection.release();
    process.exit(0);
  }
}

migrate();
