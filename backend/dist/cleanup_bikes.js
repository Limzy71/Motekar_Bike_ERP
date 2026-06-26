import pool from './config/database.js';
async function cleanup() {
    try {
        console.log('Menghapus data FG dummy...');
        // The user mentioned PRD-001 to PRD-005, but they might be FG-*
        const [delResult] = await pool.query(`DELETE FROM inventory_stok WHERE kode_barang != 'FG-001' AND kategori = 'FG'`);
        console.log('Baris dihapus (FG dummy):', delResult.affectedRows);
        const [delResult2] = await pool.query(`DELETE FROM inventory_stok WHERE kode_barang LIKE 'PRD-%'`);
        console.log('Baris dihapus (PRD dummy):', delResult2.affectedRows);
    }
    catch (err) {
        console.error('Error:', err);
    }
    finally {
        process.exit();
    }
}
cleanup();
