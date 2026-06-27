import db from '../config/database.js';

export async function up() {
    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        // 1. work_order
        await conn.query(`
            CREATE TABLE IF NOT EXISTS work_order (
                id INT AUTO_INCREMENT PRIMARY KEY,
                no_wo VARCHAR(50) NOT NULL UNIQUE,
                barang_jadi_id INT NOT NULL,
                qty_target INT NOT NULL,
                status ENUM('PENDING_KITTING', 'SUB_ASSEMBLY', 'FINAL_ASSEMBLY', 'TUNING', 'QC_CHECK', 'COMPLETED', 'REWORK') DEFAULT 'PENDING_KITTING',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (barang_jadi_id) REFERENCES inventory_stok(id) ON DELETE RESTRICT
            )
        `);

        // 2. kitting_material
        await conn.query(`
            CREATE TABLE IF NOT EXISTS kitting_material (
                id INT AUTO_INCREMENT PRIMARY KEY,
                wo_id INT NOT NULL,
                komponen_id INT NOT NULL,
                qty_dibutuhkan DECIMAL(10,2) NOT NULL,
                status ENUM('PENDING', 'RELEASED') DEFAULT 'PENDING',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (wo_id) REFERENCES work_order(id) ON DELETE CASCADE,
                FOREIGN KEY (komponen_id) REFERENCES inventory_stok(id) ON DELETE RESTRICT
            )
        `);

        // 3. qc_log
        await conn.query(`
            CREATE TABLE IF NOT EXISTS qc_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                wo_id INT NOT NULL,
                hasil_inspeksi ENUM('PASS', 'FAIL') NOT NULL,
                catatan_reject TEXT,
                inspektur VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (wo_id) REFERENCES work_order(id) ON DELETE CASCADE
            )
        `);

        await conn.commit();
        console.log("Migration successful: add_produksi_qc");
    } catch (err) {
        await conn.rollback();
        console.error("Migration failed: add_produksi_qc", err);
        throw err;
    } finally {
        conn.release();
    }
}

export async function down() {
    const conn = await db.getConnection();

    try {
        await conn.query('DROP TABLE IF EXISTS qc_log');
        await conn.query('DROP TABLE IF EXISTS kitting_material');
        await conn.query('DROP TABLE IF EXISTS work_order');
        console.log("Rollback successful: add_produksi_qc");
    } catch (err) {
        console.error("Rollback failed: add_produksi_qc", err);
        throw err;
    } finally {
        conn.release();
    }
}
