import pool from './src/config/database.js';

async function migrateSalesOrder() {
    try {
        console.log('Creating sales_order_header...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sales_order_header (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nomor_so VARCHAR(50) NOT NULL UNIQUE,
                nama_customer VARCHAR(100) NOT NULL,
                alamat_pengiriman TEXT NOT NULL,
                tanggal_target_kirim DATE NOT NULL,
                status_so ENUM('DRAFT', 'RESERVED', 'UNPAID', 'PAID', 'COMPLETED', 'BACKORDER') DEFAULT 'DRAFT',
                total_nilai DECIMAL(15, 2) NOT NULL DEFAULT 0,
                catatan TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('sales_order_header created.');

        console.log('Creating sales_order_detail...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sales_order_detail (
                id INT AUTO_INCREMENT PRIMARY KEY,
                id_so_header INT NOT NULL,
                id_inventory_barang_jadi INT NOT NULL,
                qty INT NOT NULL,
                harga_satuan DECIMAL(15, 2) NOT NULL,
                subtotal DECIMAL(15, 2) NOT NULL,
                status_item ENUM('TERSEDIA', 'DEFISIT') DEFAULT 'TERSEDIA',
                id_wo_terkait INT NULL,
                FOREIGN KEY (id_so_header) REFERENCES sales_order_header(id) ON DELETE CASCADE,
                FOREIGN KEY (id_inventory_barang_jadi) REFERENCES inventory_stok(id),
                FOREIGN KEY (id_wo_terkait) REFERENCES operasi_wo_header(id) ON DELETE SET NULL
            )
        `);
        console.log('sales_order_detail created.');

    } catch (e: any) {
        console.error('Migration error:', e);
    } finally {
        console.log('Done.');
        process.exit(0);
    }
}

migrateSalesOrder();
