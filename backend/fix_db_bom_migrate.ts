import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function migrateBom() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'motekar_db'
  });

  try {
    console.log('Fetching BOM from master_bom...');
    const [rows]: any = await conn.query(`
      SELECT p.kode_barang as parent_kode, p.nama_barang as parent_nama,
             c_stok.kode_barang as child_kode, b.qty_dibutuhkan 
      FROM master_bom b 
      JOIN inventory_stok p ON b.id_parent = p.id 
      JOIN inventory_stok c_stok ON b.id_child = c_stok.id
    `);

    // Group by parent
    const bomMap = new Map<string, any>();
    for (const r of rows) {
      if (!bomMap.has(r.parent_kode)) {
        bomMap.set(r.parent_kode, { nama: r.parent_nama, children: [] });
      }
      bomMap.get(r.parent_kode).children.push({ child_kode: r.child_kode, qty: r.qty_dibutuhkan });
    }

    for (const [parentKode, data] of bomMap.entries()) {
      const idBom = `BOM-${parentKode}`;
      console.log(`Processing ${idBom}...`);

      // Check if header exists
      const [header]: any = await conn.query('SELECT * FROM manufaktur_bom_header WHERE id_bom = ?', [idBom]);
      if (header.length === 0) {
        await conn.query(
          'INSERT INTO manufaktur_bom_header (id_bom, kode_item_parent, nama_resep) VALUES (?, ?, ?)',
          [idBom, parentKode, `BOM ${data.nama}`]
        );
      }

      // Delete existing details
      await conn.query('DELETE FROM manufaktur_bom_detail WHERE id_bom = ?', [idBom]);

      // Insert new details
      for (const child of data.children) {
        await conn.query(
          'INSERT INTO manufaktur_bom_detail (id_bom, kode_item_komponen, qty_kebutuhan) VALUES (?, ?, ?)',
          [idBom, child.child_kode, child.qty]
        );
      }
    }

    console.log('✅ Migration successful!');
  } catch (err) {
    console.error('❌ Error migrating BOM:', err);
  } finally {
    await conn.end();
  }
}

migrateBom();
