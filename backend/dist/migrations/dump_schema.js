import mysql from 'mysql2/promise';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'motekar_erp'
    });
    const [tables] = await conn.query('SHOW TABLES');
    let schema = 'SET FOREIGN_KEY_CHECKS = 0;\n\n';
    for (const row of tables) {
        const tableName = Object.values(row)[0];
        const [creates] = await conn.query('SHOW CREATE TABLE `' + tableName + '`');
        schema += 'DROP TABLE IF EXISTS `' + tableName + '`;\n';
        schema += creates[0]['Create Table'] + ';\n\n';
    }
    schema += 'SET FOREIGN_KEY_CHECKS = 1;\n';
    fs.writeFileSync('src/migrations/master_schema.sql', schema);
    console.log('Schema dumped to src/migrations/master_schema.sql');
    await conn.end();
}
run().catch(console.error);
