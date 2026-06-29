import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const vendors = [
  { kode_vendor: 'VND-001', nama_vendor: 'Frame-Indonesia', kategori: 'LOKAL' },
  { kode_vendor: 'VND-002', nama_vendor: 'Fork-Indonesia', kategori: 'LOKAL' },
  { kode_vendor: 'VND-003', nama_vendor: 'Saddle-Indonesia', kategori: 'LOKAL' },
  { kode_vendor: 'VND-004', nama_vendor: 'Seatpost-Indonesia', kategori: 'LOKAL' },
  { kode_vendor: 'VND-005', nama_vendor: 'Rim-Indonesia', kategori: 'LOKAL' },
  { kode_vendor: 'VND-006', nama_vendor: 'Spoke-Indonesia', kategori: 'LOKAL' },
  { kode_vendor: 'VND-007', nama_vendor: 'Ban-Indonesia', kategori: 'LOKAL' },
  { kode_vendor: 'VND-008', nama_vendor: 'Cran-Indonesia', kategori: 'LOKAL' },
  { kode_vendor: 'VND-009', nama_vendor: 'Chain-Indonesia', kategori: 'LOKAL' },
  { kode_vendor: 'VND-010', nama_vendor: 'Cassette-Indonesia', kategori: 'LOKAL' },
  { kode_vendor: 'VND-011', nama_vendor: 'Derail-Indonesia', kategori: 'LOKAL' },
  { kode_vendor: 'VND-012', nama_vendor: 'Handle-Indonesia', kategori: 'LOKAL' },
  { kode_vendor: 'VND-013', nama_vendor: 'Stem-Indonesia', kategori: 'LOKAL' },
  { kode_vendor: 'VND-014', nama_vendor: 'Brake-Indonesia', kategori: 'LOKAL' },
  { kode_vendor: 'VND-015', nama_vendor: 'Shifter-Indonesia', kategori: 'LOKAL' },
  { kode_vendor: 'VND-016', nama_vendor: 'Grips-Indonesia', kategori: 'LOKAL' },
];

const inventories = [
  // RM (Komponen)
  { kode: 'RM-001', nama: 'Frame', kategori: 'Komponen', tipe: 'RM', satuan: 'pc', harga: 500000 },
  { kode: 'RM-002', nama: 'Fork', kategori: 'Komponen', tipe: 'RM', satuan: 'pc', harga: 150000 },
  { kode: 'RM-003', nama: 'Saddle', kategori: 'Komponen', tipe: 'RM', satuan: 'pc', harga: 50000 },
  { kode: 'RM-004', nama: 'Seatpost', kategori: 'Komponen', tipe: 'RM', satuan: 'pc', harga: 30000 },
  { kode: 'RM-005', nama: 'Rim', kategori: 'Komponen', tipe: 'RM', satuan: 'pc', harga: 80000 },
  { kode: 'RM-006', nama: 'Spokes & Hub', kategori: 'Komponen', tipe: 'RM', satuan: 'set', harga: 60000 },
  { kode: 'RM-007', nama: 'Tire & Tube', kategori: 'Komponen', tipe: 'RM', satuan: 'set', harga: 90000 },
  { kode: 'RM-008', nama: 'Crankset', kategori: 'Komponen', tipe: 'RM', satuan: 'pc', harga: 200000 },
  { kode: 'RM-009', nama: 'Chain', kategori: 'Komponen', tipe: 'RM', satuan: 'pc', harga: 40000 },
  { kode: 'RM-010', nama: 'Cassette', kategori: 'Komponen', tipe: 'RM', satuan: 'pc', harga: 120000 },
  { kode: 'RM-011', nama: 'Derailleur (Front/Rear)', kategori: 'Komponen', tipe: 'RM', satuan: 'pc', harga: 180000 },
  { kode: 'RM-012', nama: 'Handlebar', kategori: 'Komponen', tipe: 'RM', satuan: 'pc', harga: 60000 },
  { kode: 'RM-013', nama: 'Stem', kategori: 'Komponen', tipe: 'RM', satuan: 'pc', harga: 45000 },
  { kode: 'RM-014', nama: 'Brake Levers', kategori: 'Komponen', tipe: 'RM', satuan: 'pc', harga: 75000 },
  { kode: 'RM-015', nama: 'Shifters', kategori: 'Komponen', tipe: 'RM', satuan: 'pc', harga: 110000 },
  { kode: 'RM-016', nama: 'Grips', kategori: 'Komponen', tipe: 'RM', satuan: 'pc', harga: 20000 },

  // SA (WIP / Sub-Assembly)
  { kode: 'SA-001', nama: 'Frame Set Assy', kategori: 'Komponen', tipe: 'SA', satuan: 'set', harga: 730000 },
  { kode: 'SA-002', nama: 'Wheel Set Assy', kategori: 'Komponen', tipe: 'SA', satuan: 'set', harga: 460000 }, // 2 rim + 2 spoke + 2 tire = (80+60+90)*2
  { kode: 'SA-003', nama: 'Drivetrain Assy', kategori: 'Komponen', tipe: 'SA', satuan: 'set', harga: 720000 }, // 200+40+120+(180*2) = 720k
  { kode: 'SA-004', nama: 'Cockpit & Controls Assy', kategori: 'Komponen', tipe: 'SA', satuan: 'set', harga: 485000 }, // 60+45+(75*2)+(110*2)+(20*2) = 485k

  // FG (Barang Jadi)
  { kode: 'FG-001', nama: 'Sepeda Motekar Bike Assy', kategori: 'Sepeda Jadi', tipe: 'FG', satuan: 'unit', harga: 2395000, jual: 3500000 }
];

const bomHeaders = [
  { id_bom: 'BOM-FG-001', nama_bom: 'BOM Sepeda Motekar Bike Assy', kode_item_parent: 'FG-001', versi: '1.0' },
  { id_bom: 'BOM-SA-001', nama_bom: 'BOM Frame Set Assy', kode_item_parent: 'SA-001', versi: '1.0' },
  { id_bom: 'BOM-SA-002', nama_bom: 'BOM Wheel Set Assy', kode_item_parent: 'SA-002', versi: '1.0' },
  { id_bom: 'BOM-SA-003', nama_bom: 'BOM Drivetrain Assy', kode_item_parent: 'SA-003', versi: '1.0' },
  { id_bom: 'BOM-SA-004', nama_bom: 'BOM Cockpit & Controls Assy', kode_item_parent: 'SA-004', versi: '1.0' },
];

const bomDetails = [
  // FG BOM
  { id_bom: 'BOM-FG-001', kode_item_komponen: 'SA-001', qty: 1 },
  { id_bom: 'BOM-FG-001', kode_item_komponen: 'SA-002', qty: 1 }, // Wheel Set Assy
  { id_bom: 'BOM-FG-001', kode_item_komponen: 'SA-003', qty: 1 },
  { id_bom: 'BOM-FG-001', kode_item_komponen: 'SA-004', qty: 1 },

  // Frame Set Assy BOM
  { id_bom: 'BOM-SA-001', kode_item_komponen: 'RM-001', qty: 1 }, // Frame
  { id_bom: 'BOM-SA-001', kode_item_komponen: 'RM-002', qty: 1 }, // Fork
  { id_bom: 'BOM-SA-001', kode_item_komponen: 'RM-003', qty: 1 }, // Saddle
  { id_bom: 'BOM-SA-001', kode_item_komponen: 'RM-004', qty: 1 }, // Seatpost

  // Wheel Set Assy BOM
  { id_bom: 'BOM-SA-002', kode_item_komponen: 'RM-005', qty: 2 }, // Rim
  { id_bom: 'BOM-SA-002', kode_item_komponen: 'RM-006', qty: 2 }, // Spokes & Hub
  { id_bom: 'BOM-SA-002', kode_item_komponen: 'RM-007', qty: 2 }, // Tire & Tube

  // Drivetrain Assy BOM
  { id_bom: 'BOM-SA-003', kode_item_komponen: 'RM-008', qty: 1 }, // Crankset
  { id_bom: 'BOM-SA-003', kode_item_komponen: 'RM-009', qty: 1 }, // Chain
  { id_bom: 'BOM-SA-003', kode_item_komponen: 'RM-010', qty: 1 }, // Cassette
  { id_bom: 'BOM-SA-003', kode_item_komponen: 'RM-011', qty: 2 }, // Derailleur (Front/Rear)

  // Cockpit & Controls Assy BOM
  { id_bom: 'BOM-SA-004', kode_item_komponen: 'RM-012', qty: 1 }, // Handlebar
  { id_bom: 'BOM-SA-004', kode_item_komponen: 'RM-013', qty: 1 }, // Stem
  { id_bom: 'BOM-SA-004', kode_item_komponen: 'RM-014', qty: 2 }, // Brake Levers
  { id_bom: 'BOM-SA-004', kode_item_komponen: 'RM-015', qty: 2 }, // Shifters
  { id_bom: 'BOM-SA-004', kode_item_komponen: 'RM-016', qty: 2 }, // Grips
];

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'motekar_db'
  });

  try {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    
    // Clean tables
    await connection.query('TRUNCATE TABLE manufaktur_bom_detail');
    await connection.query('TRUNCATE TABLE manufaktur_bom_header');
    await connection.query('TRUNCATE TABLE inventory_stok');
    await connection.query('TRUNCATE TABLE master_vendor');
    await connection.query('TRUNCATE TABLE keuangan_jurnal');
    
    // Seed Opening Balance (Saldo Kas Awal 500jt)
    await connection.query(
      "INSERT INTO keuangan_jurnal (referensi_dokumen, keterangan, tipe_akun, posisi, nominal) VALUES (?, ?, ?, ?, ?)",
      ['OB-2026', 'Setoran Modal Awal Perusahaan (Kas & Bank)', 'Kas_Bank', 'Debit', 500000000.00]
    );
    console.log('Opening balance (Rp 500jt) seeded.');
    
    // Seed Vendors
    for (const v of vendors) {
      await connection.query(
        'INSERT INTO master_vendor (kode_vendor, nama_vendor, kategori, status_vendor) VALUES (?, ?, ?, ?)',
        [v.kode_vendor, v.nama_vendor, v.kategori, 'AKTIF']
      );
    }
    console.log('Vendors seeded.');

    // Seed Inventory
    for (const i of inventories) {
      await connection.query(
        'INSERT INTO inventory_stok (kode_barang, nama_barang, kategori, satuan, tipe_item, harga_standar, harga_jual, jumlah_stok) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [i.kode, i.nama, i.kategori, i.satuan, i.tipe, i.harga, i.jual || 0, 30] // Stok awal 30 per komponen
      );
    }
    console.log('Inventory seeded.');

    // Seed BOM Header
    for (const bh of bomHeaders) {
      await connection.query(
        'INSERT INTO manufaktur_bom_header (id_bom, nama_resep, kode_item_parent) VALUES (?, ?, ?)',
        [bh.id_bom, bh.nama_bom, bh.kode_item_parent]
      );
    }
    console.log('BOM Headers seeded.');

    // Seed BOM Details
    for (const bd of bomDetails) {
      await connection.query(
        'INSERT INTO manufaktur_bom_detail (id_bom, kode_item_komponen, qty_kebutuhan) VALUES (?, ?, ?)',
        [bd.id_bom, bd.kode_item_komponen, bd.qty]
      );
    }
    console.log('BOM Details seeded.');

    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('All done successfully!');

  } catch(e) {
    console.error(e);
  } finally {
    connection.end();
  }
}

run();
