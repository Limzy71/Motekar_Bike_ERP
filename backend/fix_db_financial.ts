import pool from './src/config/database.js';

async function alterFinancial() {
    try {
        console.log('Altering inventory_stok, sales_order_header, and sales_order_detail...');
        
        await pool.query(`
            ALTER TABLE inventory_stok 
            ADD COLUMN hpp_satuan DECIMAL(15,2) NULL AFTER harga_standar,
            ADD COLUMN harga_jual_standar DECIMAL(15,2) NULL AFTER hpp_satuan
        `).catch(e => { if (e.code !== 'ER_DUP_FIELDNAME') throw e; else console.log('inventory_stok columns exist.'); });

        await pool.query(`
            ALTER TABLE sales_order_header 
            ADD COLUMN biaya_pengiriman DECIMAL(15,2) DEFAULT 0 AFTER total_nilai
        `).catch(e => { if (e.code !== 'ER_DUP_FIELDNAME') throw e; else console.log('sales_order_header columns exist.'); });

        await pool.query(`
            ALTER TABLE sales_order_detail 
            ADD COLUMN hpp_satuan_tercatat DECIMAL(15,2) NULL AFTER harga_satuan
        `).catch(e => { if (e.code !== 'ER_DUP_FIELDNAME') throw e; else console.log('sales_order_detail columns exist.'); });

        console.log('Financial schema updated successfully.');

    } catch (e: any) {
        console.error('Migration error:', e);
    } finally {
        console.log('Done.');
        process.exit(0);
    }
}

alterFinancial();
