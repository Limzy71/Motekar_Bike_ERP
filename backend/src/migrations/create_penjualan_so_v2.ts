import pool from '../config/database.js';

async function up() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    console.log('Dropping existing penjualan tables...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 0;');
    await connection.query('DROP TABLE IF EXISTS penjualan_so_detail;');
    await connection.query('DROP TABLE IF EXISTS penjualan_so_header;');

    console.log('Creating penjualan_so_header...');
    await connection.query(`
      CREATE TABLE penjualan_so_header (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nomor_so VARCHAR(100) NOT NULL UNIQUE,
        nama_customer VARCHAR(200) NOT NULL,
        alamat_pengiriman TEXT NOT NULL,
        tanggal_target_kirim DATE NOT NULL,
        status_so ENUM('DRAFT', 'RESERVED', 'BACKORDER', 'SHIPPED', 'DELIVERED', 'PAID', 'COMPLETED', 'FAILED_DELIVERY', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
        total_nilai DECIMAL(15,2) NOT NULL DEFAULT 0,
        catatan TEXT,
        biaya_pengiriman DECIMAL(15,2) NOT NULL DEFAULT 0,
        latitude VARCHAR(100),
        longitude VARCHAR(100),
        vendor_3pl VARCHAR(200),
        nomor_resi_3pl VARCHAR(100),
        foto_serah_terima_3pl VARCHAR(500),
        foto_bukti_terima_retailer VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log('Creating penjualan_so_detail...');
    await connection.query(`
      CREATE TABLE penjualan_so_detail (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_so_header INT NOT NULL,
        id_inventory_barang_jadi INT NOT NULL,
        qty INT NOT NULL,
        harga_satuan DECIMAL(15,2) NOT NULL DEFAULT 0,
        subtotal DECIMAL(15,2) NOT NULL DEFAULT 0,
        status_item ENUM('TERSEDIA', 'DEFISIT') NOT NULL DEFAULT 'TERSEDIA',
        hpp_satuan_tercatat DECIMAL(15,2) NOT NULL DEFAULT 0,
        id_wo_terkait INT DEFAULT NULL,
        FOREIGN KEY (id_so_header) REFERENCES penjualan_so_header(id) ON DELETE CASCADE,
        FOREIGN KEY (id_inventory_barang_jadi) REFERENCES inventory_stok(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await connection.query('SET FOREIGN_KEY_CHECKS = 1;');
    
    await connection.commit();
    console.log('Migration create_penjualan_so_v2 SUCCESS');
  } catch (error) {
    await connection.rollback();
    console.error('Migration failed:', error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

up();
