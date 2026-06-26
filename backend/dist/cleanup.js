import pool from './config/database.js';
async function run() {
    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.query("SELECT kode_barang, nama_barang, reorder_point, id_vendor FROM inventory_stok WHERE kode_barang LIKE 'KOMP-%'");
        console.log(JSON.stringify(rows, null, 2));
    }
    catch (err) {
        console.error(err);
    }
    finally {
        conn.release();
        process.exit(0);
    }
}
run();
