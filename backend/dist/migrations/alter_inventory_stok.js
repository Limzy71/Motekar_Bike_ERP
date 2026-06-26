import pool from '../config/database.js';
async function migrate() {
    try {
        console.log('Running migration: alter_inventory_stok...');
        try {
            await pool.query(`
        ALTER TABLE inventory_stok ADD COLUMN stok_committed INT NOT NULL DEFAULT 0;
      `);
            console.log('Column stok_committed added.');
        }
        catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('Column stok_committed already exists.');
            }
            else {
                throw e;
            }
        }
        console.log('Table inventory_stok altered successfully.');
    }
    catch (error) {
        console.error('Migration failed:', error);
    }
    finally {
        process.exit();
    }
}
migrate();
