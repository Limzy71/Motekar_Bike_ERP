import pool from '../config/database.js';

async function up() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // ============================================================
    // PHASE 1: DESTROY LEGACY TABLE
    // ============================================================
    console.log('[1/4] Dropping legacy table: operasi_wo...');
    await connection.query('DROP TABLE IF EXISTS operasi_wo;');
    console.log('      ✔ Legacy table operasi_wo incinerated.');

    // ============================================================
    // PHASE 2: CREATE operasi_wo_header
    // ============================================================
    console.log('[2/4] Creating table: operasi_wo_header...');
    await connection.query(`
      CREATE TABLE operasi_wo_header (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nomor_wo VARCHAR(50) UNIQUE NOT NULL,
        id_inventory_fg INT NOT NULL COMMENT 'FK to inventory_stok.id',
        jumlah_produksi INT NOT NULL,
        status ENUM('ON_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'ON_PROGRESS',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (id_inventory_fg) REFERENCES inventory_stok(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('      ✔ Table operasi_wo_header created.');

    // ============================================================
    // PHASE 3: CREATE operasi_wo_material_allocation
    // ============================================================
    console.log('[3/4] Creating table: operasi_wo_material_allocation...');
    await connection.query(`
      CREATE TABLE operasi_wo_material_allocation (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_wo_header INT NOT NULL,
        id_inventory_material INT NOT NULL COMMENT 'FK to inventory_stok.id',
        qty_kebutuhan INT NOT NULL,
        status_alokasi ENUM('Reserved', 'Consumed') NOT NULL DEFAULT 'Reserved',
        FOREIGN KEY (id_wo_header) REFERENCES operasi_wo_header(id) ON DELETE CASCADE,
        FOREIGN KEY (id_inventory_material) REFERENCES inventory_stok(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('      ✔ Table operasi_wo_material_allocation created.');

    // ============================================================
    // PHASE 4: SEEDER PABRIK (1 WO ON_PROGRESS + ALOKASI MATERIAL)
    // ============================================================
    console.log('[4/4] Seeding dummy Work Order (ON_PROGRESS) + Material Allocation...');

    if (process.env.NO_SEED !== 'true') {
      // 1. Cari target Finished Goods (misal: kode FG yang punya BOM)
      // Coba cari FG yang punya resep di manufaktur_bom_header
      const [fgList]: any = await connection.query(`
        SELECT i.id, i.kode_barang, i.nama_barang
        FROM inventory_stok i
        JOIN manufaktur_bom_header b ON i.kode_barang = b.kode_item_parent
        WHERE i.tipe_item = 'FG' LIMIT 1
      `);

      if (fgList.length > 0) {
        const fg = fgList[0];
        const targetQty = 5; // Produksi 5 unit

        // Insert WO Header
        const year = new Date().getFullYear();
        const nomor_wo = `WO/MTK/${year}/0001`;
        const [insertWO]: any = await connection.query(
          'INSERT INTO operasi_wo_header (nomor_wo, id_inventory_fg, jumlah_produksi, status) VALUES (?, ?, ?, ?)',
          [nomor_wo, fg.id, targetQty, 'ON_PROGRESS']
        );
        const woId = insertWO.insertId;

        // Cari resep BOM
        const [bomHeader]: any = await connection.query(
          'SELECT id_bom FROM manufaktur_bom_header WHERE kode_item_parent = ?',
          [fg.kode_barang]
        );

        if (bomHeader.length > 0) {
          const idBom = bomHeader[0].id_bom;
          
          // Cari komponen dan lookup ID inventory-nya
          const [bomDetails]: any = await connection.query(`
            SELECT d.kode_item_komponen, d.qty_kebutuhan, i.id as id_material
            FROM manufaktur_bom_detail d
            JOIN inventory_stok i ON d.kode_item_komponen = i.kode_barang
            WHERE d.id_bom = ?
          `, [idBom]);

          for (const detail of bomDetails) {
            const qtyTotal = detail.qty_kebutuhan * targetQty;
            
            // Insert Alokasi Material (Reserved)
            await connection.query(
              'INSERT INTO operasi_wo_material_allocation (id_wo_header, id_inventory_material, qty_kebutuhan, status_alokasi) VALUES (?, ?, ?, ?)',
              [woId, detail.id_material, qtyTotal, 'Reserved']
            );

            // Lakukan Soft-Allocation (Tambah stok_committed)
            await connection.query(
              'UPDATE inventory_stok SET stok_committed = stok_committed + ? WHERE id = ?',
              [qtyTotal, detail.id_material]
            );
          }
          console.log(`      ✔ Dummy WO (${nomor_wo}) seeded untuk ${fg.nama_barang} (${targetQty} unit) dengan ${bomDetails.length} material teralokasi.`);
        } else {
          console.log('      ⚠ Finished Goods tidak punya resep BOM, skip material allocation.');
        }
      } else {
        console.log('      ⚠ Tidak ada Finished Goods dengan resep BOM untuk di-seed.');
      }
    } else {
      console.log('      ⊘ Skipping WO dummy seeder due to NO_SEED flag.');
    }

    await connection.commit();
    console.log('\n[✔] REFACTOR MIGRATION COMPLETE: operasi_wo → Header-Detail with Material Allocation.');
  } catch (error: any) {
    await connection.rollback();
    console.error('\n[✘] Migration FAILED:', error.message);
    console.error(error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

up();
