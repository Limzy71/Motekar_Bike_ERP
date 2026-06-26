import pool from './config/database.js';
async function check() {
    try {
        const [rows] = await pool.query("DESCRIBE users;");
        console.log(rows);
        process.exit(0);
    }
    catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
