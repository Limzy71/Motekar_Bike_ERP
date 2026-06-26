import pool from './src/config/database.js';

async function fixDB() {
    try {
        console.log('Adding lead_time_hari to inventory_stok...');
        await pool.query('ALTER TABLE inventory_stok ADD COLUMN lead_time_hari INT DEFAULT 0 AFTER id_vendor');
    } catch (e: any) {
        if (e.code !== 'ER_DUP_FIELDNAME') console.error(e);
        else console.log('Column lead_time_hari already exists.');
    }

    try {
        console.log('Adding kode_part_vendor to inventory_stok...');
        await pool.query('ALTER TABLE inventory_stok ADD COLUMN kode_part_vendor VARCHAR(50) NULL AFTER lead_time_hari');
    } catch (e: any) {
        if (e.code !== 'ER_DUP_FIELDNAME') console.error(e);
        else console.log('Column kode_part_vendor already exists.');
    }

    console.log('Done.');
    process.exit(0);
}

fixDB();
