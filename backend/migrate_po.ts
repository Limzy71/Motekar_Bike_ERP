import pool from './src/config/database.js';

async function migrate() {
    try {
        await pool.query('SET FOREIGN_KEY_CHECKS=0');
        await pool.query('DROP TABLE IF EXISTS pengadaan_po_detail, pengadaan_po_header');
        
        await pool.query(`
            CREATE TABLE pengadaan_po_header (
                id int NOT NULL AUTO_INCREMENT,
                nomor_po varchar(50) NOT NULL,
                id_vendor int NOT NULL,
                status enum('DRAFT','ISSUED','APPROVED','SENT_TO_VENDOR','COMPLETED','REJECTED') NOT NULL DEFAULT 'DRAFT',
                total_nilai decimal(15,2) NOT NULL DEFAULT '0.00',
                catatan text,
                created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY nomor_po (nomor_po),
                KEY id_vendor (id_vendor),
                CONSTRAINT pengadaan_po_header_ibfk_1 FOREIGN KEY (id_vendor) REFERENCES master_vendor (id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await pool.query(`
            CREATE TABLE pengadaan_po_detail (
                id int NOT NULL AUTO_INCREMENT,
                id_po_header int NOT NULL,
                id_inventory_material int NOT NULL,
                qty int NOT NULL,
                harga_satuan decimal(15,2) NOT NULL,
                PRIMARY KEY (id),
                KEY id_po_header (id_po_header),
                KEY id_inventory_material (id_inventory_material),
                CONSTRAINT pengadaan_po_detail_ibfk_1 FOREIGN KEY (id_po_header) REFERENCES pengadaan_po_header (id) ON DELETE CASCADE,
                CONSTRAINT pengadaan_po_detail_ibfk_2 FOREIGN KEY (id_inventory_material) REFERENCES inventory_stok (id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await pool.query('SET FOREIGN_KEY_CHECKS=1');
        console.log('MIGRATION SUCCESS');
        process.exit(0);
    } catch(e) {
        console.error('MIGRATION FAILED:', e);
        process.exit(1);
    }
}

migrate();
