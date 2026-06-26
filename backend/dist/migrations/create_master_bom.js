import pool from '../config/database.js';
async function migrate() {
    try {
        console.log('Starting migration for Hierarchical BOM...');
        // 1. UPDATE TABEL inventory_stok
        console.log('Altering table inventory_stok...');
        // Drop kategori enum if it exists, but it's usually easier to just ALTER
        // Add kategori column if not exists
        const [cols] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_stok' AND COLUMN_NAME = 'kategori'
    `);
        await pool.query(`
      ALTER TABLE inventory_stok
      MODIFY COLUMN kategori ENUM('FG', 'WIP', 'RM', 'Komponen', 'Sepeda Jadi') DEFAULT 'RM';
    `);
        // 2. CREATE TABEL BARU master_bom
        console.log('Creating table master_bom...');
        await pool.query(`
      CREATE TABLE IF NOT EXISTS master_bom (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_parent INT NOT NULL,
        id_child INT NOT NULL,
        qty_dibutuhkan INT NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (id_parent) REFERENCES inventory_stok(id) ON DELETE CASCADE,
        FOREIGN KEY (id_child) REFERENCES inventory_stok(id) ON DELETE CASCADE,
        UNIQUE KEY unique_bom_relation (id_parent, id_child)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
        // 3. SEEDER: Insert FG and WIP into inventory_stok
        console.log('Seeding FG and WIP into inventory_stok...');
        // Check if Sepeda Motekar Bike Assy already exists
        const [existingFG] = await pool.query(`SELECT id FROM inventory_stok WHERE kode_barang = 'FG-001'`);
        let id_sepeda;
        if (existingFG.length === 0) {
            const [result] = await pool.query(`
        INSERT INTO inventory_stok (kode_barang, nama_barang, kategori, satuan, harga_standar, reorder_point, id_vendor)
        VALUES ('FG-001', 'Sepeda Motekar Bike Assy', 'FG', 'UNIT', 5000000, 5, NULL)
      `);
            id_sepeda = result.insertId;
        }
        else {
            id_sepeda = existingFG[0].id;
        }
        // Insert WIPs
        const wips = [
            { kode: 'WIP-001', nama: 'Frame Set Assy' },
            { kode: 'WIP-002', nama: 'Wheel Set Assy (Front & Rear)' },
            { kode: 'WIP-003', nama: 'Drivetrain Assy' },
            { kode: 'WIP-004', nama: 'Cockpit & Controls Assy' }
        ];
        const wipIds = {};
        for (const wip of wips) {
            const [existing] = await pool.query(`SELECT id FROM inventory_stok WHERE kode_barang = ?`, [wip.kode]);
            if (existing.length === 0) {
                const [result] = await pool.query(`
          INSERT INTO inventory_stok (kode_barang, nama_barang, kategori, satuan, harga_standar, reorder_point, id_vendor)
          VALUES (?, ?, 'WIP', 'SET', 0, 5, NULL)
        `, [wip.kode, wip.nama]);
                wipIds[wip.kode] = result.insertId;
            }
            else {
                wipIds[wip.kode] = existing[0].id;
            }
        }
        // Set all existing KOMP to RM
        await pool.query(`UPDATE inventory_stok SET kategori = 'RM' WHERE kode_barang LIKE 'KOMP-%'`);
        // 4. SEEDER RELASI BOM
        console.log('Seeding BOM Relations...');
        // Kosongkan master_bom terlebih dahulu
        await pool.query(`TRUNCATE TABLE master_bom`);
        // Helper to get component ID
        const getKompId = async (kode) => {
            const [rows] = await pool.query(`SELECT id FROM inventory_stok WHERE kode_barang = ?`, [kode]);
            return rows[0]?.id;
        };
        // Level 0 -> Level 1
        const relations = [
            { parent: id_sepeda, child: wipIds['WIP-001'], qty: 1 },
            { parent: id_sepeda, child: wipIds['WIP-002'], qty: 1 },
            { parent: id_sepeda, child: wipIds['WIP-003'], qty: 1 },
            { parent: id_sepeda, child: wipIds['WIP-004'], qty: 1 },
            // Level 1 -> Level 2
            // Frame Set Assy -> KOMP-001(Fork), KOMP-004(Saddle), KOMP-005(Seatpost), dll.
            // Kita perlu map kode_barang KOMP ke id
            // Frame: ? Kita anggap KOMP-008 Frame Alloy 27.5
            // Fork: KOMP-010 Suspension Fork Travel 120mm
            // Saddle: KOMP-004 Saddle MTB Comfort
            // Seatpost: KOMP-005 Seatpost Alloy 30.9mm
            { parent: wipIds['WIP-001'], child: await getKompId('KOMP-008'), qty: 1 }, // Frame
            { parent: wipIds['WIP-001'], child: await getKompId('KOMP-010'), qty: 1 }, // Fork
            { parent: wipIds['WIP-001'], child: await getKompId('KOMP-004'), qty: 1 }, // Saddle
            { parent: wipIds['WIP-001'], child: await getKompId('KOMP-005'), qty: 1 }, // Seatpost
            // Wheel Set Assy -> Rim(KOMP-006), Spokes(KOMP-007), Tire(KOMP-002)
            { parent: wipIds['WIP-002'], child: await getKompId('KOMP-006'), qty: 2 }, // Rim
            { parent: wipIds['WIP-002'], child: await getKompId('KOMP-007'), qty: 2 }, // Spokes & Hub
            { parent: wipIds['WIP-002'], child: await getKompId('KOMP-002'), qty: 2 }, // Tire & Tube
            // Drivetrain Assy -> Crankset(KOMP-009), Chain(KOMP-001), Cassette(KOMP-015), Derailleur(KOMP-011)
            { parent: wipIds['WIP-003'], child: await getKompId('KOMP-009'), qty: 1 }, // Crankset
            { parent: wipIds['WIP-003'], child: await getKompId('KOMP-001'), qty: 1 }, // Chain
            { parent: wipIds['WIP-003'], child: await getKompId('KOMP-015'), qty: 1 }, // Cassette
            { parent: wipIds['WIP-003'], child: await getKompId('KOMP-011'), qty: 2 }, // Derailleur (Front/Rear)
            // Cockpit & Controls Assy -> Handlebar(KOMP-012), Stem(KOMP-013), Brake Levers(KOMP-014), Shifters(KOMP-016), Grips(KOMP-003)
            { parent: wipIds['WIP-004'], child: await getKompId('KOMP-012'), qty: 1 }, // Handlebar
            { parent: wipIds['WIP-004'], child: await getKompId('KOMP-013'), qty: 1 }, // Stem
            { parent: wipIds['WIP-004'], child: await getKompId('KOMP-014'), qty: 2 }, // Brake Levers
            { parent: wipIds['WIP-004'], child: await getKompId('KOMP-016'), qty: 2 }, // Shifters
            { parent: wipIds['WIP-004'], child: await getKompId('KOMP-003'), qty: 2 } // Grips/Brake Pad (KOMP-003 was Rem Cakram Hidrolik or Grips? We will use KOMP-003 for now, qty 2)
        ];
        for (const rel of relations) {
            if (rel.parent && rel.child) {
                await pool.query(`
          INSERT INTO master_bom (id_parent, id_child, qty_dibutuhkan)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE qty_dibutuhkan = ?
        `, [rel.parent, rel.child, rel.qty, rel.qty]);
            }
            else {
                console.warn('Warning: Missing parent or child ID for relation:', rel);
            }
        }
        console.log('Migration and Seeding for BOM completed successfully!');
    }
    catch (error) {
        console.error('Migration failed:', error);
    }
    finally {
        process.exit();
    }
}
migrate();
