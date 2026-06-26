import pool from './config/database.js';
async function main() {
    try {
        const [headers] = await pool.query('SELECT * FROM pengadaan_pr_header');
        console.log('=== PR HEADERS ===');
        console.log(headers);
        const [details] = await pool.query('SELECT * FROM pengadaan_pr_detail');
        console.log('=== PR DETAILS ===');
        console.log(details);
        const [stok] = await pool.query('SELECT kode_barang, nama_barang, jumlah_stok, reorder_point FROM inventory_stok WHERE jumlah_stok <= reorder_point');
        console.log('=== STOK KRITIS ===');
        console.log(stok);
    }
    catch (e) {
        console.error(e);
    }
    finally {
        await pool.end();
    }
}
main();
