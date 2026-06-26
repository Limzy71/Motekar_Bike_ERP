import pool from '../config/database.js';
import bcrypt from 'bcrypt';

/**
 * MASTER DATA SEEDER — Data Fundamental (Bukan Transaksi)
 * 
 * Isi:
 * 1. Akun Login Owner (bcrypt-hashed)
 * 2. Master Vendor
 * 3. Master Komponen (RM) + Finished Goods (FG)
 * 4. Master BOM (Resep Perakitan SEP-001)
 * 
 * TIDAK menyuntikkan data transaksi apa pun (PR, WO, SO kosong).
 */

async function seedMasterData() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    console.log('\n========================================');
    console.log('🌱 MASTER DATA SEEDER — Motekar ERP');
    console.log('========================================\n');

    // ============================================================
    // 1. AKUN LOGIN OWNER
    // ============================================================
    console.log('[1/5] Menyuntikkan akun Owner...');
    
    // Cek apakah user sudah ada
    const [existingUser]: any = await connection.query(
      'SELECT id FROM users WHERE username = ?', ['agus']
    );

    if (existingUser.length === 0) {
      const hashedPassword = await bcrypt.hash('password123', 10);
      await connection.query(
        `INSERT INTO users (username, password, nama_lengkap, email, divisi_role) 
         VALUES (?, ?, ?, ?, ?)`,
        ['agus', hashedPassword, 'Ir. Agus Hexagraha', 'agus@motekar.com', 'Owner']
      );
      console.log('      ✔ Akun "agus" (Owner) berhasil dibuat.');
    } else {
      console.log('      ⊘ Akun "agus" sudah ada, skip.');
    }

    // ============================================================
    // 2. MASTER VENDOR
    // ============================================================
    console.log('[2/5] Menyuntikkan Master Vendor...');

    const [existingVendor]: any = await connection.query(
      "SELECT id FROM master_vendor WHERE nama_vendor = 'PT Shimano Indonesia'"
    );

    if (existingVendor.length === 0) {
      await connection.query(
        `INSERT INTO master_vendor (nama_vendor, kontak, alamat) VALUES 
         ('PT Shimano Indonesia', '021-5551234', 'Kawasan Industri Cikarang, Jawa Barat')`
      );
      console.log('      ✔ Vendor "PT Shimano Indonesia" berhasil ditambahkan.');
    } else {
      console.log('      ⊘ Vendor sudah ada, skip.');
    }

    // ============================================================
    // 3. MASTER INVENTORY (KOMPONEN + FINISHED GOODS)
    // ============================================================
    console.log('[3/5] Menyuntikkan Master Inventory...');

    const inventoryItems = [
      { kode: 'KOMP-001', nama: 'Frame Sepeda',      kategori: 'Komponen',    tipe: 'RM', satuan: 'pcs', harga_standar: 850000 },
      { kode: 'KOMP-002', nama: 'Ban Luar Kenda 27.5', kategori: 'Komponen',  tipe: 'RM', satuan: 'pcs', harga_standar: 175000 },
      { kode: 'SEP-001',  nama: 'MTB Motekar X1',     kategori: 'Sepeda Jadi', tipe: 'FG', satuan: 'unit', harga_standar: 3200000 },
    ];

    for (const item of inventoryItems) {
      const [existing]: any = await connection.query(
        'SELECT id FROM inventory_stok WHERE kode_barang = ?', [item.kode]
      );
      if (existing.length === 0) {
        await connection.query(
          `INSERT INTO inventory_stok (kode_barang, nama_barang, kategori, tipe_item, jumlah_stok, satuan, harga_standar, stok_committed) 
           VALUES (?, ?, ?, ?, 0, ?, ?, 0)`,
          [item.kode, item.nama, item.kategori, item.tipe, item.satuan, item.harga_standar]
        );
        console.log(`      ✔ ${item.kode} — ${item.nama} (stok: 0)`);
      } else {
        console.log(`      ⊘ ${item.kode} sudah ada, skip.`);
      }
    }

    // ============================================================
    // 4. MASTER BOM (RESEP PERAKITAN SEP-001)
    // ============================================================
    console.log('[4/5] Menyuntikkan Master BOM untuk SEP-001...');

    const idBom = 'BOM-SEP-001';
    const [existingBom]: any = await connection.query(
      'SELECT id_bom FROM manufaktur_bom_header WHERE id_bom = ?', [idBom]
    );

    if (existingBom.length === 0) {
      await connection.query(
        'INSERT INTO manufaktur_bom_header (id_bom, kode_item_parent, nama_resep) VALUES (?, ?, ?)',
        [idBom, 'SEP-001', 'Resep Standar MTB Motekar X1']
      );
      await connection.query(
        `INSERT INTO manufaktur_bom_detail (id_bom, kode_item_komponen, qty_kebutuhan) VALUES 
         (?, 'KOMP-001', 1),
         (?, 'KOMP-002', 2)`,
        [idBom, idBom]
      );
      console.log('      ✔ BOM SEP-001 → KOMP-001 (x1), KOMP-002 (x2)');
    } else {
      console.log('      ⊘ BOM SEP-001 sudah ada, skip.');
    }

    // ============================================================
    // 5. VALIDASI AKHIR
    // ============================================================
    console.log('[5/5] Validasi akhir...');

    const [userCount]: any = await connection.query('SELECT COUNT(*) as c FROM users');
    const [invCount]: any = await connection.query('SELECT COUNT(*) as c FROM inventory_stok');
    const [bomCount]: any = await connection.query('SELECT COUNT(*) as c FROM manufaktur_bom_header');
    const [vendorCount]: any = await connection.query('SELECT COUNT(*) as c FROM master_vendor');

    await connection.commit();

    console.log('\n========================================');
    console.log('✅ MASTER DATA SEEDER COMPLETE!');
    console.log('========================================');
    console.log(`   Users       : ${userCount[0].c} akun`);
    console.log(`   Vendor      : ${vendorCount[0].c} vendor`);
    console.log(`   Inventory   : ${invCount[0].c} item (stok semua 0)`);
    console.log(`   BOM         : ${bomCount[0].c} resep`);
    console.log(`   Transaksi   : 0 (PR/WO/SO kosong bersih)`);
    console.log('========================================');
    console.log('\n🔑 LOGIN: username=agus | password=password123\n');

  } catch (error: any) {
    await connection.rollback();
    console.error('\n[✘] Seeder GAGAL:', error.message);
    console.error(error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

seedMasterData();
