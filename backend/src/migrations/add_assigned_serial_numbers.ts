import pool from '../config/database.js';

async function up() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    console.log('Checking for assigned_serial_numbers in penjualan_so_detail...');
    const [cols]: any = await connection.query(
      "SHOW COLUMNS FROM penjualan_so_detail LIKE 'assigned_serial_numbers'"
    );

    if (cols.length === 0) {
      await connection.query(
        'ALTER TABLE penjualan_so_detail ADD COLUMN assigned_serial_numbers JSON DEFAULT NULL COMMENT "Disimpan saat alokasi QC"'
      );
      console.log('✔ Column assigned_serial_numbers added to penjualan_so_detail.');
    } else {
      console.log('⊘ Column assigned_serial_numbers already exists, skipping.');
    }

    await connection.commit();
    console.log('Migration SUCCESS');
  } catch (error) {
    await connection.rollback();
    console.error('Migration failed:', error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

up();
