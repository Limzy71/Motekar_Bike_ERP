import pool from './config/database.js';
async function fixTipeItem() {
    await pool.query("UPDATE inventory_stok SET tipe_item = 'SA' WHERE kode_barang LIKE 'WIP-%'");
    await pool.query("UPDATE inventory_stok SET tipe_item = 'FG' WHERE kode_barang LIKE 'FG-%'");
    console.log("Database fixed!");
    process.exit(0);
}
fixTipeItem();
