import pool from '../config/database.js';

async function seed() {
  try {
    console.log('Running seeder: seed_campaigns...');
    const campaigns = [
      { nama: 'Pameran Inabicycle JCC 2026', jenis: 'Pameran', budget: 25000000, status: 'Aktif' },
      { nama: 'Iklan Instagram Q2', jenis: 'Digital Ads', budget: 15000000, status: 'Aktif' },
      { nama: 'Roadshow Pabrik Jawa Barat', jenis: 'Kunjungan Langsung', budget: 10000000, status: 'Selesai' },
      { nama: 'Sponsorship Gowes Nasional', jenis: 'Pameran', budget: 50000000, status: 'Aktif' },
    ];

    // Cek apakah data sudah ada untuk menghindari duplikasi
    const [rows]: any = await pool.query('SELECT COUNT(*) as count FROM pemasaran_campaigns');
    if (rows[0].count > 0) {
      console.log('Tabel pemasaran_campaigns sudah berisi data. Melewati proses seeding.');
      process.exit();
    }

    for (const c of campaigns) {
      await pool.query(
        'INSERT INTO pemasaran_campaigns (nama_campaign, jenis, budget_alokasi, status) VALUES (?, ?, ?, ?)',
        [c.nama, c.jenis, c.budget, c.status]
      );
    }
    
    console.log('Seeder: Berhasil menambahkan 4 kampanye (Pameran, Digital Ads, Kunjungan Langsung).');
  } catch (error) {
    console.error('Seeding failed:', error);
  } finally {
    process.exit();
  }
}

seed();
