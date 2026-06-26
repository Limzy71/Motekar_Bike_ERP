import pool from '../config/database.js';

async function up() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // ============================================================
    // PHASE 1: DESTROY LEGACY TABLE
    // ============================================================
    console.log('[1/7] Dropping legacy table: penjualan_so...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 0;');
    await connection.query('DROP TABLE IF EXISTS penjualan_so_detail;');
    await connection.query('DROP TABLE IF EXISTS penjualan_so_header;');
    await connection.query('DROP TABLE IF EXISTS penjualan_so;');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1;');
    console.log('      ✔ Legacy table incinerated.');

    // ============================================================
    // PHASE 2: ADD harga_jual COLUMN TO MASTER INVENTORY
    // ============================================================
    console.log('[2/7] Adding harga_jual column to inventory_stok...');
    const [cols]: any = await connection.query(
      "SHOW COLUMNS FROM inventory_stok LIKE 'harga_jual'"
    );
    if (cols.length === 0) {
      await connection.query(
        'ALTER TABLE inventory_stok ADD COLUMN harga_jual DECIMAL(15,2) NOT NULL DEFAULT 0'
      );
      console.log('      ✔ Column harga_jual added.');
    } else {
      console.log('      ⊘ Column harga_jual already exists, skipping.');
    }

    // ============================================================
    // PHASE 3: CREATE penjualan_so_header
    // ============================================================
    console.log('[3/7] Creating table: penjualan_so_header...');
    await connection.query(`
      CREATE TABLE penjualan_so_header (
        id INT AUTO_INCREMENT PRIMARY KEY,
        no_so VARCHAR(100) NOT NULL UNIQUE,
        id_customer INT NOT NULL COMMENT 'FK to pemasaran_leads.id_lead (Won_Deal)',
        status ENUM('Draft', 'Confirmed', 'Shipped') NOT NULL DEFAULT 'Draft',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (id_customer) REFERENCES pemasaran_leads(id_lead) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('      ✔ Table penjualan_so_header created.');

    // ============================================================
    // PHASE 4: CREATE penjualan_so_detail
    // ============================================================
    console.log('[4/7] Creating table: penjualan_so_detail...');
    await connection.query(`
      CREATE TABLE penjualan_so_detail (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_so_header INT NOT NULL,
        kode_barang VARCHAR(100) NOT NULL,
        qty INT NOT NULL,
        harga_jual_satuan DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT 'Harga jual per unit saat SO dibuat (snapshot)',
        hpp_snapshot DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT 'HPP per unit saat SO dibuat (snapshot historis)',
        FOREIGN KEY (id_so_header) REFERENCES penjualan_so_header(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('      ✔ Table penjualan_so_detail created.');

    if (process.env.NO_SEED !== 'true') {
      // ============================================================
      // PHASE 5: SEED CRM LEADS (Won_Deal + Filter Test)
      // ============================================================
      console.log('[5/7] Seeding CRM Leads for SO dropdown test...');

      // Check existing campaigns, create one if needed
      const [campaigns]: any = await connection.query('SELECT id_campaign FROM pemasaran_campaigns LIMIT 1');
      let campaignId: number;
      if (campaigns.length === 0) {
        const [campResult]: any = await connection.query(
          "INSERT INTO pemasaran_campaigns (nama_campaign, jenis, budget_alokasi, status) VALUES ('Pameran Inabicycle 2026', 'Pameran', 50000000, 'Aktif')"
        );
        campaignId = campResult.insertId;
      } else {
        campaignId = campaigns[0].id_campaign;
      }

      // Lead A: Won_Deal (MUST appear in SO dropdown)
      const [existingWon]: any = await connection.query("SELECT id_lead FROM pemasaran_leads WHERE status_pipeline = 'Won_Deal' LIMIT 1");
      let leadAId: number;
      if (existingWon.length === 0) {
        const [leadAResult]: any = await connection.query(
          "INSERT INTO pemasaran_leads (nama_toko, kontak_person, no_telepon, id_campaign, estimasi_nilai_deal, status_pipeline) VALUES (?, ?, ?, ?, ?, 'Won_Deal')",
          ['PT Nusantara Jaya Sepeda', 'Budi Santoso', '0812-3456-7890', campaignId, 250000000]
        );
        leadAId = leadAResult.insertId;
      } else {
        leadAId = existingWon[0].id_lead;
      }

      // Lead B: Negosiasi (MUST NOT appear in SO dropdown — filter test)
      const [existingNego]: any = await connection.query("SELECT id_lead FROM pemasaran_leads WHERE nama_toko = 'CV Angin Ribut Bicycles' LIMIT 1");
      if (existingNego.length === 0) {
        await connection.query(
          "INSERT INTO pemasaran_leads (nama_toko, kontak_person, no_telepon, id_campaign, estimasi_nilai_deal, status_pipeline) VALUES (?, ?, ?, ?, ?, 'Negosiasi')",
          ['CV Angin Ribut Bicycles', 'Dina Pratama', '0856-9999-1234', campaignId, 75000000]
        );
      }
      console.log('      ✔ CRM Leads seeded (Won_Deal + Negosiasi).');

      // ============================================================
      // PHASE 6: SEED harga_jual ON FG ITEMS
      // ============================================================
      console.log('[6/7] Seeding harga_jual on Finished Goods items...');
      const [fgItems]: any = await connection.query(
        "SELECT kode_barang, harga_standar FROM inventory_stok WHERE tipe_item = 'FG'"
      );

      for (const fg of fgItems) {
        const hargaStandar = parseFloat(fg.harga_standar) || 0;
        // Set harga jual ~1.7x dari harga standar (markup 70%)
        const hargaJual = hargaStandar > 0 ? Math.round(hargaStandar * 1.7 / 100000) * 100000 : 5500000;
        await connection.query(
          'UPDATE inventory_stok SET harga_jual = ? WHERE kode_barang = ?',
          [hargaJual, fg.kode_barang]
        );
      }
      console.log(`      ✔ harga_jual updated for ${fgItems.length} FG item(s).`);

      // ============================================================
      // PHASE 7: SEED 2 SALES ORDER DOCUMENTS
      // ============================================================
      console.log('[7/7] Seeding 2 Sales Order documents...');

      const year = new Date().getFullYear();
      const noSO1 = `SO/MTK/${year}/0001`;
      const noSO2 = `SO/MTK/${year}/0002`;

      // SO #1 — Draft, single-item
      const [so1Result]: any = await connection.query(
        'INSERT INTO penjualan_so_header (no_so, id_customer, status) VALUES (?, ?, ?)',
        [noSO1, leadAId, 'Draft']
      );
      const so1Id = so1Result.insertId;

      // SO #2 — Confirmed, multi-item (validation target)
      const [so2Result]: any = await connection.query(
        'INSERT INTO penjualan_so_header (no_so, id_customer, status) VALUES (?, ?, ?)',
        [noSO2, leadAId, 'Confirmed']
      );
      const so2Id = so2Result.insertId;

      // Fetch FG items for detail seeding
      const [fgForDetail]: any = await connection.query(
        "SELECT kode_barang, harga_jual FROM inventory_stok WHERE tipe_item = 'FG' LIMIT 3"
      );

      if (fgForDetail.length >= 1) {
        const fg1 = fgForDetail[0];
        const hpp1 = fg1.harga_jual * 0.6; // Simulate HPP ~60% of sell price

        // SO #1 detail: 1 item
        await connection.query(
          'INSERT INTO penjualan_so_detail (id_so_header, kode_barang, qty, harga_jual_satuan, hpp_snapshot) VALUES (?, ?, ?, ?, ?)',
          [so1Id, fg1.kode_barang, 10, fg1.harga_jual, hpp1]
        );

        // SO #2 detail: multi-item
        await connection.query(
          'INSERT INTO penjualan_so_detail (id_so_header, kode_barang, qty, harga_jual_satuan, hpp_snapshot) VALUES (?, ?, ?, ?, ?)',
          [so2Id, fg1.kode_barang, 10, fg1.harga_jual, hpp1]
        );

        if (fgForDetail.length >= 2) {
          const fg2 = fgForDetail[1];
          const hpp2 = fg2.harga_jual * 0.6;
          await connection.query(
            'INSERT INTO penjualan_so_detail (id_so_header, kode_barang, qty, harga_jual_satuan, hpp_snapshot) VALUES (?, ?, ?, ?, ?)',
            [so2Id, fg2.kode_barang, 5, fg2.harga_jual, hpp2]
          );
        }
      }
      console.log('      ✔ 2 SO documents seeded (Draft + Confirmed multi-item).');
    } else {
      console.log('      ⊘ Skipping CRM, FG Pricing, and SO Seeders due to NO_SEED flag.');
    }

    await connection.commit();
    console.log('\n[✔] REFACTOR MIGRATION COMPLETE: penjualan_so → Master-Detail + Double-Entry Pricing.');
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
