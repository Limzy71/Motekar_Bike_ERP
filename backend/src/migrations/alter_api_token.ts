import pool from '../config/database.js';

async function migrate() {
  const connection = await pool.getConnection();
  try {
    console.log('Renaming api_token to refresh_token...');
    await connection.query('ALTER TABLE users CHANGE api_token refresh_token VARCHAR(255) NULL');
    console.log('Done.');
  } catch (error: any) {
    if (error.code === 'ER_BAD_FIELD_ERROR' || error.code === 'ER_DUP_FIELDNAME') {
      console.log('Column might already be renamed.');
    } else {
      console.error(error);
    }
  } finally {
    connection.release();
    process.exit();
  }
}
migrate();
