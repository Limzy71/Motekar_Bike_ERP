import pool from './src/config/database.js';

async function alterSalesOrder() {
    try {
        console.log('Altering sales_order_header...');
        await pool.query(`
            ALTER TABLE sales_order_header 
            ADD COLUMN foto_bukti_terima_retailer TEXT NULL AFTER tanggal_target_kirim,
            ADD COLUMN vendor_3pl VARCHAR(100) NULL AFTER foto_bukti_terima_retailer,
            ADD COLUMN nomor_resi_3pl VARCHAR(50) NULL AFTER vendor_3pl,
            ADD COLUMN foto_serah_terima_3pl TEXT NULL AFTER nomor_resi_3pl,
            MODIFY COLUMN status_so ENUM('DRAFT', 'RESERVED', 'UNPAID', 'SHIPPED', 'DELIVERED', 'PAID', 'COMPLETED', 'BACKORDER', 'FAILED_DELIVERY') DEFAULT 'DRAFT'
        `);
        console.log('sales_order_header altered successfully.');

    } catch (e: any) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log('Columns already exist. Proceeding...');
        } else {
            console.error('Migration error:', e);
        }
    } finally {
        console.log('Done.');
        process.exit(0);
    }
}

alterSalesOrder();
