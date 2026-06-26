import pool from '../config/database.js';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fresh() {
  const connection = await pool.getConnection();
  try {
    console.log('--- 🧹 MOTEKAR ERP DATABASE FACTORY RESET ---');
    console.log('\n[1/2] Wiping all tables...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 0;');
    
    // Ambil daftar semua tabel
    const [tables]: any = await connection.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE()
    `);
    
    if (tables.length > 0) {
      for (const row of tables) {
        const tableName = row['TABLE_NAME'] || row['table_name'];
        await connection.query(`DROP TABLE IF EXISTS \`${tableName}\` CASCADE`);
      }
      console.log(`      ✔ ${tables.length} tables dropped successfully.`);
    } else {
      console.log('      ✔ Database is already empty.');
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1;');
    
    console.log('\n[2/2] Restoring Master Schema...');
    
    const schemaPath = path.join(__dirname, 'master_schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`master_schema.sql not found at ${schemaPath}`);
    }

    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    // Split statements by semicolon and filter empty ones
    const statements = schemaSql.split(/;\s*$/m).filter(s => s.trim().length > 0);
    
    for (const statement of statements) {
      if (statement.trim()) {
        await connection.query(statement);
      }
    }

    console.log(`      ✔ Master schema restored successfully (${statements.length} statements).`);

    console.log('\n======================================================');
    console.log('✅ DATABASE FACTORY RESET COMPLETE!');
    console.log('Struktur tabel sempurna, dan data transaksi kosong bersih.');
    console.log('======================================================\n');

  } catch (error: any) {
    console.error('\n[✘] Factory Reset FAILED:', error.message);
  } finally {
    connection.release();
    process.exit(0);
  }
}

fresh();
