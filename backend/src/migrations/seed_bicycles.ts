import pool from '../config/database.js';

async function seedBicycles() {
  try {
    console.log('Running seeder: seed_bicycles...');

    const bicycles = [
      {
        kode_barang: 'FG-MTB-001',
        nama_barang: 'MTB Motekar X1 (Mountain Bike)',
        kategori: 'Sepeda Jadi',
        tipe_item: 'FG',
        jumlah_stok: 25,
        satuan: 'Unit'
      },
      {
        kode_barang: 'FG-CTY-002',
        nama_barang: 'Motekar City Cruiser (City Bike)',
        kategori: 'Sepeda Jadi',
        tipe_item: 'FG',
        jumlah_stok: 40,
        satuan: 'Unit'
      },
      {
        kode_barang: 'FG-ROD-003',
        nama_barang: 'Motekar Aero Road (Road Bike)',
        kategori: 'Sepeda Jadi',
        tipe_item: 'FG',
        jumlah_stok: 15,
        satuan: 'Unit'
      },
      {
        kode_barang: 'FG-EBK-004',
        nama_barang: 'Motekar E-Volt 500 (E-Bike)',
        kategori: 'Sepeda Jadi',
        tipe_item: 'FG',
        jumlah_stok: 10,
        satuan: 'Unit'
      },
      {
        kode_barang: 'FG-FLD-005',
        nama_barang: 'Motekar Fold Lite (Folding Bike)',
        kategori: 'Sepeda Jadi',
        tipe_item: 'FG',
        jumlah_stok: 30,
        satuan: 'Unit'
      }
    ];

    for (const bike of bicycles) {
      // Check if exists
      const [existing]: any = await pool.query(
        'SELECT id FROM inventory_stok WHERE kode_barang = ?',
        [bike.kode_barang]
      );

      if (existing.length === 0) {
        await pool.query(
          'INSERT INTO inventory_stok (kode_barang, nama_barang, kategori, tipe_item, jumlah_stok, satuan) VALUES (?, ?, ?, ?, ?, ?)',
          [bike.kode_barang, bike.nama_barang, bike.kategori, bike.tipe_item, bike.jumlah_stok, bike.satuan]
        );
        console.log(`Inserted: ${bike.nama_barang}`);
      } else {
        console.log(`Skipped (Already exists): ${bike.nama_barang}`);
      }
    }

    console.log('Seeder seed_bicycles completed successfully.');
  } catch (error) {
    console.error('Seeder failed:', error);
  } finally {
    process.exit();
  }
}

seedBicycles();
