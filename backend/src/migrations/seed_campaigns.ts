import pool from '../config/database.js';

async function seed() {
  try {
    console.log('Running seeder: seed_campaigns...');
    
    const campaigns = [
      {
        nama: 'Pameran Internasional Sepeda JCC 2026 (Inabicycle)',
        jenis: 'Pameran',
        budget: 75000000,
        status: 'Aktif',
        tanggal_mulai: '2026-07-10',
        tanggal_selesai: '2026-07-15',
        lokasi: 'Jakarta Convention Center (JCC) - Hall A & B'
      },
      {
        nama: 'B2B Roadshow Distributor Utama Wilayah Jawa Barat',
        jenis: 'Kunjungan Langsung',
        budget: 35000000,
        status: 'Aktif',
        tanggal_mulai: '2026-08-01',
        tanggal_selesai: '2026-08-15',
        lokasi: 'Bandung, Tasikmalaya, Cirebon & Garut'
      },
      {
        nama: 'Meta Ads & Google Search Q3 (Peluncuran Motekar Gen 2)',
        jenis: 'Digital Ads',
        budget: 50000000,
        status: 'Aktif',
        tanggal_mulai: '2026-07-01',
        tanggal_selesai: '2026-09-30',
        lokasi: 'Nasional (Facebook, Instagram, Google Ads)'
      }
    ];

    // Bersihkan tabel terlebih dahulu agar bersih dan tidak duplikat
    await pool.query('SET FOREIGN_KEY_CHECKS = 0;');
    await pool.query('TRUNCATE TABLE pemasaran_campaigns;');
    await pool.query('SET FOREIGN_KEY_CHECKS = 1;');

    for (const c of campaigns) {
      await pool.query(
        `INSERT INTO pemasaran_campaigns 
         (nama_campaign, jenis, budget_alokasi, status, tanggal_mulai, tanggal_selesai, lokasi) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [c.nama, c.jenis, c.budget, c.status, c.tanggal_mulai, c.tanggal_selesai, c.lokasi]
      );
    }
    
    console.log('Seeder: Berhasil menambahkan 3 Kampanye Pemasaran Profesional.');
  } catch (error) {
    console.error('Seeding failed:', error);
  } finally {
    process.exit();
  }
}

seed();
