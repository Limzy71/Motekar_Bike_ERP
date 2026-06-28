import pool from '../config/database.js';
async function migrate() {
    const sqlCampaigns = `
    CREATE TABLE IF NOT EXISTS pemasaran_campaigns (
      id_campaign INT AUTO_INCREMENT PRIMARY KEY,
      nama_campaign VARCHAR(200) NOT NULL,
      jenis ENUM('Pameran', 'Digital Ads', 'Kunjungan Langsung') NOT NULL DEFAULT 'Pameran',
      budget_alokasi DECIMAL(15, 2) NOT NULL DEFAULT 0,
      status ENUM('Aktif', 'Selesai') NOT NULL DEFAULT 'Aktif',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;
    const sqlLeads = `
    CREATE TABLE IF NOT EXISTS pemasaran_leads (
      id_lead INT AUTO_INCREMENT PRIMARY KEY,
      nama_toko VARCHAR(200) NOT NULL,
      kontak_person VARCHAR(100) NOT NULL,
      no_telepon VARCHAR(30) NOT NULL,
      id_campaign INT,
      alamat TEXT,
      estimasi_nilai_deal DECIMAL(15, 2) NOT NULL DEFAULT 0,
      status_pipeline ENUM('New Lead', 'Follow Up', 'Negosiasi', 'Won_Deal', 'Lost') NOT NULL DEFAULT 'New Lead',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (id_campaign) REFERENCES pemasaran_campaigns(id_campaign) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;
    const sqlAktivitas = `
      CREATE TABLE IF NOT EXISTS pemasaran_aktivitas (
        id_aktivitas INT AUTO_INCREMENT PRIMARY KEY,
        id_lead INT NOT NULL,
        tanggal TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        jenis_interaksi ENUM('Telepon', 'Meeting', 'Email') NOT NULL DEFAULT 'Telepon',
        catatan_hasil TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (id_lead) REFERENCES pemasaran_leads(id_lead) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
    try {
        console.log('Running migration: create_pemasaran_crm...');
        await pool.query('SET FOREIGN_KEY_CHECKS = 0;');
        await pool.query('DROP TABLE IF EXISTS pemasaran_aktivitas, pemasaran_leads, pemasaran_campaigns;');
        await pool.query('SET FOREIGN_KEY_CHECKS = 1;');
        await pool.query(sqlCampaigns);
        console.log('Table pemasaran_campaigns created successfully.');
        await pool.query(sqlLeads);
        console.log('Table pemasaran_leads created successfully.');
        await pool.query(sqlAktivitas);
        console.log('Table pemasaran_aktivitas created successfully.');
        console.log('All CRM tables migrated successfully.');
    }
    catch (error) {
        console.error('Migration failed:', error);
    }
    finally {
        process.exit();
    }
}
migrate();
