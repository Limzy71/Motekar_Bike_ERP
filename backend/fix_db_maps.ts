import pool from './src/config/database.js';

async function alterMaps() {
    try {
        console.log('Altering sales_order_header for maps integration...');
        
        await pool.query(`
            ALTER TABLE sales_order_header 
            ADD COLUMN latitude DECIMAL(10,8) NULL,
            ADD COLUMN longitude DECIMAL(11,8) NULL
        `).catch(e => { if (e.code !== 'ER_DUP_FIELDNAME') throw e; else console.log('sales_order_header map columns already exist.'); });

        console.log('Maps schema updated successfully.');

    } catch (e: any) {
        console.error('Migration error:', e);
    } finally {
        console.log('Done.');
        process.exit(0);
    }
}

alterMaps();
