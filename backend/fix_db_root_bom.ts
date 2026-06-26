import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function insertRootBom() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'motekar_db'
  });

  try {
    console.log('Fetching IDs from inventory_stok...');
    const [items] = await conn.query<any[]>('SELECT id, kode_barang FROM inventory_stok WHERE kode_barang IN ("FG-001", "WIP-001", "WIP-002", "WIP-003", "WIP-004")');
    
    const idMap: Record<string, number> = {};
    items.forEach(item => {
      idMap[item.kode_barang] = item.id;
    });

    const fgId = idMap['FG-001'];
    if (!fgId) {
      throw new Error('FG-001 tidak ditemukan di database.');
    }

    const wipIds = [
      idMap['WIP-001'],
      idMap['WIP-002'],
      idMap['WIP-003'],
      idMap['WIP-004']
    ];

    if (wipIds.some(id => !id)) {
      throw new Error('Salah satu WIP tidak ditemukan di database.');
    }

    console.log('Checking existing Root BOM for FG-001...');
    const [existing] = await conn.query<any[]>('SELECT * FROM master_bom WHERE id_parent = ?', [fgId]);
    if (existing.length > 0) {
      console.log('Root BOM for FG-001 already exists, clearing old records...');
      await conn.query('DELETE FROM master_bom WHERE id_parent = ?', [fgId]);
    }

    console.log('Inserting Root BOM...');
    const insertQuery = 'INSERT INTO master_bom (id_parent, id_child, qty_dibutuhkan) VALUES ?';
    const values = wipIds.map(childId => [fgId, childId, 1]);

    await conn.query(insertQuery, [values]);

    console.log('✅ Root BOM successfully inserted!');
  } catch (err) {
    console.error('❌ Error inserting Root BOM:', err);
  } finally {
    await conn.end();
  }
}

insertRootBom();
