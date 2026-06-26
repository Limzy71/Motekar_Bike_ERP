import pool from '../config/database.js';
async function migrate() {
    const sqlHeader = `
    CREATE TABLE IF NOT EXISTS manufaktur_bom_header (
      id_bom VARCHAR(50) PRIMARY KEY,
      kode_item_parent VARCHAR(50) NOT NULL,
      nama_resep VARCHAR(150) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;
    const sqlDetail = `
    CREATE TABLE IF NOT EXISTS manufaktur_bom_detail (
      id_detail INT AUTO_INCREMENT PRIMARY KEY,
      id_bom VARCHAR(50) NOT NULL,
      kode_item_komponen VARCHAR(50) NOT NULL,
      qty_kebutuhan INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_bom) REFERENCES manufaktur_bom_header(id_bom) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;
    try {
        console.log('Running migration: create_manufaktur_bom...');
        await pool.query(sqlHeader);
        console.log('Table manufaktur_bom_header created successfully.');
        await pool.query(sqlDetail);
        console.log('Table manufaktur_bom_detail created successfully.');
        if (process.env.NO_SEED !== 'true') {
            // --- SEEDER BOM SEP-001 ---
            console.log('Seeding Master BOM for SEP-001...');
            const idBom = 'BOM-SEP-001';
            // Hapus BOM lama jika ada (untuk mencegah duplikasi jika dijalankan ulang)
            await pool.query('DELETE FROM manufaktur_bom_header WHERE id_bom = ?', [idBom]);
            // Insert Header BOM
            await pool.query('INSERT INTO manufaktur_bom_header (id_bom, kode_item_parent, nama_resep) VALUES (?, ?, ?)', [idBom, 'SEP-001', 'Resep Standar MTB Motekar X1']);
            // Insert Detail Komponen BOM
            await pool.query('INSERT INTO manufaktur_bom_detail (id_bom, kode_item_komponen, qty_kebutuhan) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)', [
                idBom, 'KOMP-001', 1, // Rantai Shimano 12-Speed
                idBom, 'KOMP-002', 2, // Ban Luar Kenda 27.5
                idBom, 'KOMP-003', 1 // Rem Cakram Hidrolik
            ]);
            console.log('Master BOM for SEP-001 seeded successfully.');
        }
        else {
            console.log('Skipping seeder for manufaktur_bom due to NO_SEED flag.');
        }
    }
    catch (error) {
        console.error('Migration failed:', error);
    }
    finally {
        process.exit();
    }
}
migrate();
