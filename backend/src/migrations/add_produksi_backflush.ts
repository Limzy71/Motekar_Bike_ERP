import db from '../config/database.js';

export async function up() {
    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        // 1. Tambah Kolom Lokasi Jika Belum Ada & Update Lokasi WIP
        try {
            await conn.query(`
                ALTER TABLE inventory_stok 
                ADD COLUMN lokasi VARCHAR(100) DEFAULT 'Gudang Utama'
            `);
        } catch (e: any) {
            if (e.code !== 'ER_DUP_FIELDNAME') {
                throw e;
            }
        }

        await conn.query(`
            UPDATE inventory_stok 
            SET lokasi = 'Lantai Produksi (WIP)' 
            WHERE kategori = 'Barang Setengah Jadi' OR tipe_item = 'SA'
        `);

        // 2. Drop and Recreate master_bom according to requested schema
        await conn.query(`DROP TABLE IF EXISTS master_bom`);
        
        await conn.query(`
            CREATE TABLE master_bom (
                id INT AUTO_INCREMENT PRIMARY KEY,
                barang_jadi_id INT NOT NULL,
                komponen_id INT NOT NULL,
                qty_dibutuhkan DECIMAL(10,2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (barang_jadi_id) REFERENCES inventory_stok(id) ON DELETE CASCADE,
                FOREIGN KEY (komponen_id) REFERENCES inventory_stok(id) ON DELETE RESTRICT
            )
        `);

        // 3. Seeding Data
        // Get FG ID for "Sepeda Motekar" (or similar FG)
        const [fgs]: any = await conn.query(`SELECT id FROM inventory_stok WHERE kategori IN ('Barang Jadi', 'FG') LIMIT 1`);
        
        if (fgs.length > 0) {
            const fgId = fgs[0].id;

            // Get Components
            const [components]: any = await conn.query(`SELECT id, nama_barang FROM inventory_stok WHERE nama_barang IN ('Frame Set', 'Wheel Set', 'Drivetrain', 'Cockpit') LIMIT 4`);
            
            for (const comp of components) {
                await conn.query(`
                    INSERT INTO master_bom (barang_jadi_id, komponen_id, qty_dibutuhkan) 
                    VALUES (?, ?, 1)
                `, [fgId, comp.id]);
            }
        }

        await conn.commit();
        console.log("Migration successful: add_produksi_backflush");
    } catch (err) {
        await conn.rollback();
        console.error("Migration failed: add_produksi_backflush", err);
        throw err;
    } finally {
        conn.release();
    }
}

export async function down() {
    const conn = await db.getConnection();
    try {
        await conn.query('DROP TABLE IF EXISTS master_bom');
        console.log("Rollback successful: add_produksi_backflush");
    } catch (err) {
        console.error("Rollback failed: add_produksi_backflush", err);
        throw err;
    } finally {
        conn.release();
    }
}
