import pool from '../config/database.js';
async function listKomponen() {
    const [rows] = await pool.query('SELECT kode_barang, nama_barang FROM inventory_stok WHERE tipe_item = "RM" OR kategori = "Komponen"');
    console.log(JSON.stringify(rows, null, 2));
    process.exit();
}
listKomponen();
