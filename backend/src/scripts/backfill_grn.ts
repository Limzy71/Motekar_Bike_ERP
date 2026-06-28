import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'motekar_db'
  });

  try {
    // Cari PO yang sudah COMPLETED tapi belum ada di penerimaan_barang
    const [pos]: any = await connection.query(`
      SELECT p.id, p.nomor_po 
      FROM pengadaan_po_header p
      WHERE p.status = 'COMPLETED' 
      AND p.id NOT IN (SELECT id_po_header FROM penerimaan_barang)
    `);

    console.log(`Menemukan ${pos.length} PO COMPLETED yang belum punya GRN record.`);

    let count = 0;
    for (const po of pos) {
      const [details]: any = await connection.query('SELECT id_inventory_material, qty FROM pengadaan_po_detail WHERE id_po_header = ?', [po.id]);
      
      const [grInsert]: any = await connection.query(
          'INSERT INTO penerimaan_barang (id_po_header, penerima, surat_jalan_vendor, catatan) VALUES (?, ?, ?, ?)',
          [po.id, 'System (Backfill)', `SJ-${po.nomor_po.split('-').pop()}`, 'Auto-generated GRN via Backfill Script']
      );
      const grId = grInsert.insertId;

      for (const item of details) {
          await connection.query(
              'INSERT INTO detail_penerimaan (id_penerimaan, id_inventory_material, qty_diterima, kondisi) VALUES (?, ?, ?, ?)',
              [grId, item.id_inventory_material, item.qty, 'BAIK']
          );
      }
      count++;
    }

    console.log(`Berhasil melakukan backfill untuk ${count} Goods Receipt (GRN).`);
  } catch(e) {
    console.error(e);
  } finally {
    connection.end();
  }
}

run();
