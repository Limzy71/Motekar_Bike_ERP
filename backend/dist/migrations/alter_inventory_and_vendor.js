import pool from '../config/database.js';
async function migrate() {
    const connection = await pool.getConnection();
    try {
        console.log('Running migration: alter_inventory_and_vendor...');
        // 1. Alter master_vendor
        console.log('Altering master_vendor...');
        await connection.query(`
      ALTER TABLE master_vendor
      ADD COLUMN kode_vendor VARCHAR(50) NULL AFTER id,
      ADD COLUMN status_blacklist BOOLEAN NOT NULL DEFAULT FALSE AFTER alamat;
    `);
        // 2. Alter inventory_stok
        console.log('Altering inventory_stok...');
        await connection.query(`
      ALTER TABLE inventory_stok
      ADD COLUMN id_vendor INT NULL AFTER kategori,
      ADD COLUMN reorder_point INT NOT NULL DEFAULT 0 AFTER jumlah_stok,
      ADD COLUMN minimum_stock INT NOT NULL DEFAULT 0 AFTER reorder_point,
      ADD CONSTRAINT fk_inventory_vendor FOREIGN KEY (id_vendor) REFERENCES master_vendor(id) ON DELETE SET NULL;
    `);
        console.log('Migration alter_inventory_and_vendor completed successfully.');
    }
    catch (error) {
        console.error('Migration failed:', error);
    }
    finally {
        connection.release();
        process.exit();
    }
}
migrate();
