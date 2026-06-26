import pool from '../config/database.js';

async function up() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    console.log('Dropping old tables...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 0;');
    await connection.query('DROP TABLE IF EXISTS pengadaan_pr_detail;');
    await connection.query('DROP TABLE IF EXISTS pengadaan_pr_header;');
    await connection.query('DROP TABLE IF EXISTS master_vendor;');
    await connection.query('DROP TABLE IF EXISTS pengadaan_pr;');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1;');

    console.log('Creating master_vendor...');
    await connection.query(`
      CREATE TABLE master_vendor (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nama_vendor VARCHAR(255) NOT NULL,
        kontak VARCHAR(100),
        alamat TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating pengadaan_pr_header...');
    await connection.query(`
      CREATE TABLE pengadaan_pr_header (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nomor_pr VARCHAR(255) NOT NULL UNIQUE,
        id_vendor INT NOT NULL,
        status_pr VARCHAR(50) NOT NULL DEFAULT 'Draft',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (id_vendor) REFERENCES master_vendor(id) ON DELETE CASCADE
      )
    `);

    console.log('Creating pengadaan_pr_detail...');
    await connection.query(`
      CREATE TABLE pengadaan_pr_detail (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_pr_header INT NOT NULL,
        kode_barang VARCHAR(100) NOT NULL,
        jumlah INT NOT NULL,
        satuan VARCHAR(50) NOT NULL,
        FOREIGN KEY (id_pr_header) REFERENCES pengadaan_pr_header(id) ON DELETE CASCADE
      )
    `);

    if (process.env.NO_SEED !== 'true') {
      console.log('Seeding master_vendor...');
      const [vendorResult]: any = await connection.query(`
        INSERT INTO master_vendor (nama_vendor, kontak, alamat) VALUES 
        ('PT Shimano Indonesia', '021-5551234', 'Kawasan Industri Cikarang, Jawa Barat'),
        ('CV Maxxis Rubber', '021-5556789', 'Jl. Raya Bogor KM 30'),
        ('SRAM Corp Supplier', '0812-999-0000', 'Gedung Kencana, Jakarta')
      `);

      const year = new Date().getFullYear();

      console.log('Seeding pengadaan_pr_header...');
      const pr1 = `PR/MTK/${year}/0001`;
      const pr2 = `PR/MTK/${year}/0002`;
      
      await connection.query(`
        INSERT INTO pengadaan_pr_header (nomor_pr, id_vendor, status_pr) VALUES 
        (?, 1, 'Draft'),
        (?, 2, 'Menunggu Persetujuan')
      `, [pr1, pr2]);

      const [headerRows]: any = await connection.query('SELECT id, nomor_pr FROM pengadaan_pr_header');
      const idPr1 = headerRows.find((r: any) => r.nomor_pr === pr1).id;
      const idPr2 = headerRows.find((r: any) => r.nomor_pr === pr2).id;

      console.log('Fetching RM items from inventory_stok...');
      const [items]: any = await connection.query("SELECT kode_barang, satuan FROM inventory_stok WHERE tipe_item = 'RM' LIMIT 4");
      
      if (items.length >= 2) {
        console.log('Seeding pengadaan_pr_detail...');
        await connection.query(`
          INSERT INTO pengadaan_pr_detail (id_pr_header, kode_barang, jumlah, satuan) VALUES 
          (?, ?, 50, ?),
          (?, ?, 100, ?)
        `, [idPr1, items[0].kode_barang, items[0].satuan, idPr1, items[1].kode_barang, items[1].satuan]);

        if (items.length >= 4) {
          await connection.query(`
            INSERT INTO pengadaan_pr_detail (id_pr_header, kode_barang, jumlah, satuan) VALUES 
            (?, ?, 20, ?),
            (?, ?, 200, ?)
          `, [idPr2, items[2].kode_barang, items[2].satuan, idPr2, items[3].kode_barang, items[3].satuan]);
        } else {
          await connection.query(`
            INSERT INTO pengadaan_pr_detail (id_pr_header, kode_barang, jumlah, satuan) VALUES 
            (?, ?, 20, ?),
            (?, ?, 200, ?)
          `, [idPr2, items[0].kode_barang, items[0].satuan, idPr2, items[1].kode_barang, items[1].satuan]);
        }
      } else {
        console.log('Warning: Not enough RM items in inventory_stok to seed PR details completely.');
      }
    } else {
      console.log('Skipping seeder for pengadaan_pr due to NO_SEED flag.');
    }

    await connection.commit();
    console.log('Migration & Seeding successful: Refactored pengadaan_pr to master-detail architecture.');
  } catch (error: any) {
    await connection.rollback();
    console.error('Migration failed:', error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

up();
