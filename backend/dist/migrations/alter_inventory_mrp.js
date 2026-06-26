import pool from '../config/database.js';
async function migrate() {
    try {
        console.log('Running migration: alter_inventory_mrp...');
        try {
            await pool.query(`
        ALTER TABLE inventory_stok 
        ADD COLUMN tipe_item ENUM('RM', 'SA', 'FG') NOT NULL DEFAULT 'RM',
        ADD COLUMN harga_standar DECIMAL(15,2) NOT NULL DEFAULT 0;
      `);
            console.log('Columns tipe_item and harga_standar added to inventory_stok.');
        }
        catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('Columns already exist.');
            }
            else {
                throw e;
            }
        }
        console.log('Table inventory_stok altered successfully for MRP.');
    }
    catch (error) {
        console.error('Migration failed:', error);
    }
    finally {
        process.exit();
    }
}
migrate();
