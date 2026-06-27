import db from '../config/database.js';

export async function up() {
    const conn = await db.getConnection();
    try {
        await conn.query(`
            ALTER TABLE inventory_stok
            ADD COLUMN reorder_point INT NOT NULL DEFAULT 15,
            ADD COLUMN bom_ratio INT NOT NULL DEFAULT 1,
            ADD COLUMN id_vendor INT NULL,
            ADD FOREIGN KEY (id_vendor) REFERENCES master_vendor(id) ON DELETE SET NULL
        `);
        console.log("Migration successful: add_inventory_procurement_fields");
    } catch (err) {
        console.error("Migration failed: add_inventory_procurement_fields", err);
        throw err;
    } finally {
        conn.release();
    }
}

export async function down() {
    const conn = await db.getConnection();
    try {
        await conn.query(`
            ALTER TABLE inventory_stok
            DROP FOREIGN KEY inventory_stok_ibfk_1,
            DROP COLUMN id_vendor,
            DROP COLUMN bom_ratio,
            DROP COLUMN reorder_point
        `);
        console.log("Rollback successful: add_inventory_procurement_fields");
    } catch (err) {
        console.error("Rollback failed: add_inventory_procurement_fields", err);
        throw err;
    } finally {
        conn.release();
    }
}
