import pool from '../config/database.js';

async function migrate() {
  const sql = `
    CREATE TABLE IF NOT EXISTS keuangan_jurnal (
      id_jurnal INT AUTO_INCREMENT PRIMARY KEY,
      tanggal TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      referensi_dokumen VARCHAR(100) NOT NULL,
      keterangan TEXT NOT NULL,
      tipe_akun ENUM('Aset_Persediaan', 'Pendapatan', 'HPP', 'Kas_Bank') NOT NULL,
      posisi ENUM('Debit', 'Kredit') NOT NULL,
      nominal DECIMAL(15, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  try {
    console.log('Running migration: create_keuangan_jurnal...');
    await pool.query(sql);
    console.log('Table keuangan_jurnal created successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    process.exit();
  }
}

migrate();
