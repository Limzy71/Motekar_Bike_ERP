const mysql = require('mysql2/promise');

async function run() {
    const conn = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        database: 'motekar_db'
    });
    
    await conn.query("ALTER TABLE pengadaan_po_header MODIFY status ENUM('DRAFT', 'ISSUED', 'PENDING_APPROVAL', 'APPROVED', 'SENT_TO_VENDOR', 'REJECTED', 'COMPLETED', 'PARTIAL_RECEIVED_WITH_DEFECT', 'CANCELLED') NOT NULL DEFAULT 'DRAFT'");
    console.log('Enum updated successfully');
    process.exit(0);
}

run();
