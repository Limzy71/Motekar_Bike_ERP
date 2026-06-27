const mysql = require('mysql2/promise');

async function run() {
    const conn = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        database: 'motekar_db'
    });
    
    const [rows] = await conn.query("SELECT nama_barang, kategori, tipe_item FROM inventory_stok WHERE tipe_item = 'FG' OR kategori = 'Sepeda'");
    console.log(rows);
    process.exit(0);
}

run();
