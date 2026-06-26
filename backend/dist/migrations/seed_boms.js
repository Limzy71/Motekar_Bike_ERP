import pool from '../config/database.js';
async function seedBOM() {
    try {
        console.log('Running seeder: seed_boms...');
        // 1. Seed Komponen (RM)
        const components = [
            { kode_barang: 'KOMP-001', nama_barang: 'Frame Sepeda Alumunium', kategori: 'Komponen', tipe_item: 'RM', jumlah_stok: 100, satuan: 'Pcs' },
            { kode_barang: 'KOMP-002', nama_barang: 'Ban Luar Kenda 27.5"', kategori: 'Komponen', tipe_item: 'RM', jumlah_stok: 200, satuan: 'Pcs' },
            { kode_barang: 'KOMP-003', nama_barang: 'Rantai Shimano 9-Speed', kategori: 'Komponen', tipe_item: 'RM', jumlah_stok: 150, satuan: 'Pcs' },
            { kode_barang: 'KOMP-004', nama_barang: 'Sadel Jok Ergonomis', kategori: 'Komponen', tipe_item: 'RM', jumlah_stok: 100, satuan: 'Pcs' },
            { kode_barang: 'KOMP-005', nama_barang: 'Stang / Handlebar Flat', kategori: 'Komponen', tipe_item: 'RM', jumlah_stok: 100, satuan: 'Pcs' },
            { kode_barang: 'KOMP-006', nama_barang: 'Pedal Alloy Anti-Slip', kategori: 'Komponen', tipe_item: 'RM', jumlah_stok: 200, satuan: 'Set' }
        ];
        for (const comp of components) {
            const [existing] = await pool.query('SELECT id FROM inventory_stok WHERE kode_barang = ?', [comp.kode_barang]);
            if (existing.length === 0) {
                await pool.query('INSERT INTO inventory_stok (kode_barang, nama_barang, kategori, tipe_item, jumlah_stok, satuan) VALUES (?, ?, ?, ?, ?, ?)', [comp.kode_barang, comp.nama_barang, comp.kategori, comp.tipe_item, comp.jumlah_stok, comp.satuan]);
            }
        }
        console.log('Komponen seeded.');
        // 2. Define Bicycles and BOMs
        const bicycles = [
            { kode: 'FG-MTB-001', id_bom: 'BOM-MTB-001', nama: 'BOM Rakit MTB X1' },
            { kode: 'FG-CTY-002', id_bom: 'BOM-CTY-002', nama: 'BOM Rakit City Cruiser' },
            { kode: 'FG-ROD-003', id_bom: 'BOM-ROD-003', nama: 'BOM Rakit Aero Road' },
            { kode: 'FG-EBK-004', id_bom: 'BOM-EBK-004', nama: 'BOM Rakit E-Volt 500' },
            { kode: 'FG-FLD-005', id_bom: 'BOM-FLD-005', nama: 'BOM Rakit Fold Lite' }
        ];
        const bomDetails = [
            { kode_item_komponen: 'KOMP-001', qty_kebutuhan: 1 },
            { kode_item_komponen: 'KOMP-002', qty_kebutuhan: 2 },
            { kode_item_komponen: 'KOMP-003', qty_kebutuhan: 1 },
            { kode_item_komponen: 'KOMP-004', qty_kebutuhan: 1 },
            { kode_item_komponen: 'KOMP-005', qty_kebutuhan: 1 },
            { kode_item_komponen: 'KOMP-006', qty_kebutuhan: 1 } // 1 set
        ];
        for (const bike of bicycles) {
            // Create Header
            const [existingBom] = await pool.query('SELECT id_bom FROM manufaktur_bom_header WHERE id_bom = ?', [bike.id_bom]);
            if (existingBom.length === 0) {
                await pool.query('INSERT INTO manufaktur_bom_header (id_bom, kode_item_parent, nama_resep) VALUES (?, ?, ?)', [bike.id_bom, bike.kode, bike.nama]);
                // Create Details
                for (const detail of bomDetails) {
                    await pool.query('INSERT INTO manufaktur_bom_detail (id_bom, kode_item_komponen, qty_kebutuhan) VALUES (?, ?, ?)', [bike.id_bom, detail.kode_item_komponen, detail.qty_kebutuhan]);
                }
                console.log(`BOM seeded for ${bike.kode}`);
            }
            else {
                console.log(`BOM already exists for ${bike.kode}`);
            }
        }
        console.log('Seeder seed_boms completed successfully.');
    }
    catch (error) {
        console.error('Seeder failed:', error);
    }
    finally {
        process.exit();
    }
}
seedBOM();
