import pool from '../config/database.js';
import { resolveAllocations } from '../controllers/operasiController.js';

async function fixOldWO() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    console.log('--- RETROACTIVE ALLOCATION FIXER ---');

    // 1. Get all WOs that don't have any allocations
    const [wos]: any = await connection.query(`
      SELECT wo.id, wo.nomor_wo, wo.id_inventory_fg, wo.jumlah_produksi, fg.kode_barang
      FROM operasi_wo_header wo
      JOIN inventory_stok fg ON wo.id_inventory_fg = fg.id
      WHERE wo.id NOT IN (
        SELECT DISTINCT id_wo_header FROM operasi_wo_material_allocation
      )
    `);

    console.log(`Found ${wos.length} Work Orders without allocations.`);

    for (const wo of wos) {
      console.log(`Processing ${wo.nomor_wo} (Product: ${wo.kode_barang}, Qty: ${wo.jumlah_produksi})...`);

      const allocations = await resolveAllocations(connection, wo.kode_barang, wo.jumlah_produksi);
      if (allocations.length === 0) {
        console.log(`  ⊘ No BOM found for ${wo.kode_barang}, skipping.`);
        continue;
      }

      for (const alloc of allocations) {
        if (alloc.qty_allocated <= 0) continue;
        let statusAlokasi = alloc.is_phantom ? 'Phantom' : 'Reserved';
        await connection.query(
          'INSERT INTO operasi_wo_material_allocation (id_wo_header, id_inventory_material, qty_kebutuhan, status_alokasi) VALUES (?, ?, ?, ?)',
          [wo.id, alloc.id_inventory_material, alloc.qty_allocated, statusAlokasi]
        );
        
        if (!alloc.is_phantom) {
          await connection.query(
            'UPDATE inventory_stok SET stok_committed = stok_committed + ? WHERE id = ?',
            [alloc.qty_allocated, alloc.id_inventory_material]
          );
        }
      }

      const hardDeficits = allocations.filter(a => a.is_deficit && !a.is_phantom);
      if (hardDeficits.length > 0) {
          for (const def of hardDeficits) {
              const [exists]: any = await connection.query(
                  'SELECT id FROM pengadaan_restock_requests WHERE nomor_wo = ? AND id_inventory_material = ?',
                  [wo.nomor_wo, def.id_inventory_material]
              );
              if (exists.length === 0) {
                  await connection.query(
                      'INSERT INTO pengadaan_restock_requests (id_inventory_material, nomor_wo, jumlah_diminta, status) VALUES (?, ?, ?, ?)',
                      [def.id_inventory_material, wo.nomor_wo, def.deficit_amount, 'Pending']
                  );
              }
          }
          console.log(`  ✔ Generated restock requests for ${hardDeficits.length} deficit components.`);
      }
      console.log(`  ✔ Successfully updated allocations for ${wo.nomor_wo}.`);
    }

    await connection.commit();
    console.log('--- ALL DONE SUCCESSFULLY ---');
  } catch (error: any) {
    await connection.rollback();
    console.error('Error during execution:', error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

fixOldWO();
