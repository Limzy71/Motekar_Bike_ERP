import pool from '../config/database.js';

async function up() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    console.log('Synchronizing schema updates for live environment...');

    // 1. Check & Add target_selesai to operasi_wo_header
    const [colsWO]: any = await connection.query("SHOW COLUMNS FROM operasi_wo_header LIKE 'target_selesai'");
    if (colsWO.length === 0) {
      await connection.query('ALTER TABLE operasi_wo_header ADD COLUMN target_selesai DATE DEFAULT NULL');
      console.log('✔ Column target_selesai added to operasi_wo_header.');
    } else {
      console.log('⊘ Column target_selesai already exists.');
    }

    // 2. Check & Add wo_id to qc_inspeksi
    const [colsQcWo]: any = await connection.query("SHOW COLUMNS FROM qc_inspeksi LIKE 'wo_id'");
    if (colsQcWo.length === 0) {
      await connection.query('ALTER TABLE qc_inspeksi ADD COLUMN wo_id INT DEFAULT NULL');
      console.log('✔ Column wo_id added to qc_inspeksi.');
    } else {
      console.log('⊘ Column wo_id already exists.');
    }

    // 3. Check & Add id_inventory_fg to qc_inspeksi
    const [colsQcFg]: any = await connection.query("SHOW COLUMNS FROM qc_inspeksi LIKE 'id_inventory_fg'");
    if (colsQcFg.length === 0) {
      await connection.query('ALTER TABLE qc_inspeksi ADD COLUMN id_inventory_fg INT DEFAULT NULL');
      console.log('✔ Column id_inventory_fg added to qc_inspeksi.');
    } else {
      console.log('⊘ Column id_inventory_fg already exists.');
    }

    await connection.commit();
    console.log('Live schema synchronization SUCCESS');
  } catch (error) {
    await connection.rollback();
    console.error('Migration failed:', error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

up();
