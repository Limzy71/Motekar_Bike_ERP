import pool from '../config/database.js';

async function migrate() {
    try {
        console.log('Running migration: alter_vendor_srm...');
        await pool.query(`
            ALTER TABLE master_vendor 
            ADD COLUMN status_vendor ENUM('AKTIF', 'INAKTIF', 'BLACKLIST') DEFAULT 'AKTIF',
            ADD COLUMN alasan_blacklist TEXT NULL,
            ADD COLUMN skor_rating DECIMAL(2,1) DEFAULT 5.0;
        `);
        console.log('Migration alter_vendor_srm completed successfully.');
        process.exit(0);
    } catch (error: any) {
        if (error.code === 'ER_DUP_FIELDNAME') {
            console.log('Columns already exist. Skipping migration.');
            process.exit(0);
        } else {
            console.error('Migration failed:', error);
            process.exit(1);
        }
    }
}

migrate();
