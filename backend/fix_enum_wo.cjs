const mysql = require('mysql2/promise');
async function run() {
    try {
        const conn = await mysql.createConnection({ host: 'localhost', user: 'root', database: 'motekar_db' });
        await conn.query("ALTER TABLE operasi_wo_material_allocation MODIFY COLUMN status_alokasi ENUM('Reserved', 'Consumed', 'Phantom') NOT NULL DEFAULT 'Reserved'");
        console.log('Enum updated');
        process.exit(0);
    } catch (e) {
        console.error(e);
    }
}
run();
