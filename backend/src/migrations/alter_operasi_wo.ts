import pool from '../config/database.js';

async function migrate() {
  try {
    console.log('Running migration: alter_operasi_wo...');
    
    await pool.query(`
      ALTER TABLE operasi_wo 
      MODIFY status ENUM('Menunggu', 'Perakitan Frame', 'Setup Drivetrain', 'Selesai', 'Closed') NOT NULL DEFAULT 'Menunggu';
    `);
    
    // Using try-catch for ADD COLUMN to ignore if it already exists
    try {
      await pool.query(`
        ALTER TABLE operasi_wo ADD COLUMN catatan_rework TEXT NULL;
      `);
      console.log('Column catatan_rework added.');
    } catch (e: any) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('Column catatan_rework already exists.');
      } else {
        throw e;
      }
    }
    
    console.log('Table operasi_wo altered successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    process.exit();
  }
}

migrate();
