import pool from '../config/database.js';

async function seed() {
  const connection = await pool.getConnection();
  try {
    console.log('Running seeder: vendor_and_reorder (STRICT AVL 16 PAIRS)...');
    
    // Disable FK checks to wipe out cleanly
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    
    console.log('Wiping old vendor data and RM inventory...');
    await connection.query('TRUNCATE TABLE master_vendor');
    // Only delete RM to keep FG (sepeda jadi) intact
    await connection.query('DELETE FROM inventory_stok WHERE tipe_item = "RM"');

    // Also clear pending PR and restock requests to avoid orphaned data errors
    await connection.query('TRUNCATE TABLE pengadaan_pr_detail');
    await connection.query('TRUNCATE TABLE pengadaan_pr_header');
    await connection.query('TRUNCATE TABLE pengadaan_restock_requests');
    
    // 16 Pairs Data
    const pairings = [
      { vName: 'PT Frame Nusantara Inti', vCode: 'VND-001', kCode: 'KOMP-001', kName: 'Frame Sepeda 27.5 Alloy', stok: 50, rop: 15, min: 5, satuan: 'pcs', bomRatio: 1 },
      { vName: 'PT Kenda Rubber Indonesia', vCode: 'VND-002', kCode: 'KOMP-002', kName: 'Ban Luar Kenda 27.5', stok: 5, rop: 20, min: 10, satuan: 'pcs', bomRatio: 2 }, // KRITIS
      { vName: 'PT Fork Presisi Utama', vCode: 'VND-003', kCode: 'KOMP-003', kName: 'Suspension Fork Travel 120mm', stok: 45, rop: 15, min: 5, satuan: 'pcs', bomRatio: 1 },
      { vName: 'PT Ergo Saddle Indonesia', vCode: 'VND-004', kCode: 'KOMP-004', kName: 'Saddle MTB Comfort', stok: 60, rop: 20, min: 10, satuan: 'pcs', bomRatio: 1 },
      { vName: 'PT Seatpost Alloy Mandiri', vCode: 'VND-005', kCode: 'KOMP-005', kName: 'Seatpost Alloy 30.9mm', stok: 55, rop: 15, min: 5, satuan: 'pcs', bomRatio: 1 },
      { vName: 'PT Rim Lingkar Sejati', vCode: 'VND-006', kCode: 'KOMP-006', kName: 'Rim Alloy Double Wall 27.5', stok: 100, rop: 40, min: 15, satuan: 'pcs', bomRatio: 2 },
      { vName: 'PT Rajawali Spokes & Hub', vCode: 'VND-007', kCode: 'KOMP-007', kName: 'Spokes & Hub Set 32H', stok: 120, rop: 30, min: 10, satuan: 'set', bomRatio: 2 },
      { vName: 'PT Shimano Drivetrain Nusantara', vCode: 'VND-008', kCode: 'KOMP-008', kName: 'Crankset Shimano Altus', stok: 40, rop: 15, min: 5, satuan: 'pcs', bomRatio: 1 },
      { vName: 'PT KMC Chain Indonesia', vCode: 'VND-009', kCode: 'KOMP-009', kName: 'Chain KMC 9 Speed', stok: 80, rop: 25, min: 10, satuan: 'pcs', bomRatio: 1 },
      { vName: 'PT SunRace Cassette Gemilang', vCode: 'VND-010', kCode: 'KOMP-010', kName: 'Cassette SunRace 9 Speed', stok: 50, rop: 20, min: 8, satuan: 'pcs', bomRatio: 1 },
      { vName: 'PT Derailleur Mekanika Prima', vCode: 'VND-011', kCode: 'KOMP-011', kName: 'Derailleur (RD/FD) Set', stok: 45, rop: 15, min: 5, satuan: 'set', bomRatio: 2 },
      { vName: 'PT Cockpit Bartech Indonesia', vCode: 'VND-012', kCode: 'KOMP-012', kName: 'Handlebar Alloy 720mm', stok: 70, rop: 20, min: 10, satuan: 'pcs', bomRatio: 1 },
      { vName: 'PT Stem Matrix Perkasa', vCode: 'VND-013', kCode: 'KOMP-013', kName: 'Stem Alloy 50mm', stok: 65, rop: 20, min: 10, satuan: 'pcs', bomRatio: 1 },
      { vName: 'PT Tektro Brake Systems', vCode: 'VND-014', kCode: 'KOMP-014', kName: 'Hydraulic Brake Set Tektro', stok: 35, rop: 10, min: 4, satuan: 'set', bomRatio: 2 },
      { vName: 'PT Microshift Indonesia', vCode: 'VND-015', kCode: 'KOMP-015', kName: 'Shifter Set 3x9 Speed', stok: 45, rop: 15, min: 5, satuan: 'set', bomRatio: 2 },
      { vName: 'PT Velo Grips Makmur', vCode: 'VND-016', kCode: 'KOMP-016', kName: 'Hand Grip Rubber Anti-Slip', stok: 90, rop: 30, min: 10, satuan: 'pairs', bomRatio: 2 }
    ];

    console.log('Inserting 16 AVL Pairs...');
    
    for (const pair of pairings) {
      // 1. Insert Vendor
      const [vResult]: any = await connection.query(
        'INSERT INTO master_vendor (kode_vendor, nama_vendor, status_blacklist) VALUES (?, ?, ?)',
        [pair.vCode, pair.vName, false]
      );
      const vendorId = vResult.insertId;

      // 2. Insert RM into inventory_stok
      await connection.query(
        `INSERT INTO inventory_stok 
        (kode_barang, nama_barang, kategori, jumlah_stok, satuan, tipe_item, harga_standar, id_vendor, reorder_point, minimum_stock, bom_ratio) 
        VALUES (?, ?, 'Komponen', ?, ?, 'RM', 50000, ?, ?, ?, ?)`,
        [pair.kCode, pair.kName, pair.stok, pair.satuan, vendorId, pair.rop, pair.min, pair.bomRatio]
      );
    }

    // Re-enable FK checks
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('Seeder STRICT AVL completed successfully.');
  } catch (error) {
    console.error('Seeder failed:', error);
  } finally {
    connection.release();
    process.exit();
  }
}

seed();
