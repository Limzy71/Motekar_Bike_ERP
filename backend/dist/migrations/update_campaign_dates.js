import pool from '../config/database.js';
async function migrate() {
    try {
        console.log('Running migration: update_campaign_dates...');
        const sql = `
      ALTER TABLE pemasaran_campaigns
      ADD COLUMN tanggal_mulai DATE NULL,
      ADD COLUMN tanggal_selesai DATE NULL;
    `;
        await pool.query(sql);
        // Update existing rows with some default dates (today and today+7)
        await pool.query('UPDATE pemasaran_campaigns SET tanggal_mulai = CURRENT_DATE, tanggal_selesai = DATE_ADD(CURRENT_DATE, INTERVAL 7 DAY)');
        console.log('Migration update_campaign_dates completed successfully.');
    }
    catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
            console.log('Migration already applied. Columns exist.');
        }
        else {
            console.error('Migration failed:', error);
        }
    }
    finally {
        process.exit();
    }
}
migrate();
