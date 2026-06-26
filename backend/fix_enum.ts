import mysql from 'mysql2/promise';

async function run() {
    try {
        const c = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            database: 'motekar_db'
        });
        
        await c.query("ALTER TABLE operasi_wo_material_allocation MODIFY COLUMN status_alokasi enum('Reserved','Consumed','Phantom') NOT NULL DEFAULT 'Reserved'");
        
        console.log('ALTER TABLE SUCCESS');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();
