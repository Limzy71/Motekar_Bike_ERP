import pool from '../config/database.js';
async function up() {
    try {
        console.log('Running migration: alter_inventory_costs...');
        await pool.query(`
      ALTER TABLE inventory_stok
      ADD COLUMN biaya_rakit DECIMAL(15, 2) NOT NULL DEFAULT 0,
      ADD COLUMN biaya_antar DECIMAL(15, 2) NOT NULL DEFAULT 0
    `);
        console.log('Migration successful: Added biaya_rakit and biaya_antar to inventory_stok.');
    }
    catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
            console.log('Columns already exist. Skipping.');
        }
        else {
            console.error('Migration failed:', error);
        }
    }
    finally {
        process.exit(0);
    }
}
up();
