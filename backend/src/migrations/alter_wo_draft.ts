import pool from '../config/database.js';

async function up() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    console.log('Altering operasi_wo_header status column...');
    await connection.query(`
      ALTER TABLE operasi_wo_header 
      MODIFY COLUMN status ENUM('DRAFT', 'ON_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'DRAFT'
    `);
    
    // Convert existing 'ON_PROGRESS' items created by the previous seeder to 'DRAFT' if needed? 
    // Wait, the seeder created them as ON_PROGRESS. The user might want them to be ON_PROGRESS.
    // I will leave existing data alone.

    await connection.commit();
    console.log('✔ Table operasi_wo_header altered successfully (Added DRAFT status).');

  } catch (error: any) {
    await connection.rollback();
    console.error('✘ Migration FAILED:', error.message);
  } finally {
    connection.release();
    process.exit(0);
  }
}

up();
