import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'motekar_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function main() {
    try {
        console.log('Connecting to database...');
        
        // 1. Get first inventory item of type FG (Finished Good)
        const [inventory]: any = await pool.query("SELECT id, kode_barang FROM inventory_stok WHERE tipe_item = 'FG' LIMIT 1");
        if (inventory.length === 0) {
            console.log('No FG inventory item found. Please run npm run db:seed first.');
            await pool.end();
            return;
        }
        const barangId = inventory[0].id;
        const kodeBarang = inventory[0].kode_barang;
        console.log(`Using FG item: ${kodeBarang} (ID: ${barangId})`);

        // Clean up any previously seeded mock exception SOs
        const mockPrefix = 'SO-EXC-';
        const [oldHeaders]: any = await pool.query("SELECT id, nomor_so FROM penjualan_so_header WHERE nomor_so LIKE CONCAT(?, '%')", [mockPrefix]);
        console.log(`Cleaning up ${oldHeaders.length} old exception SOs...`);
        for (const oh of oldHeaders) {
            // Delete associated write-offs
            await pool.query("DELETE FROM exception_writeoff WHERE alasan_hilang LIKE CONCAT('%', ?, '%')", [oh.nomor_so]);
            await pool.query("DELETE FROM penjualan_so_detail WHERE id_so_header = ?", [oh.id]);
            await pool.query("DELETE FROM penjualan_so_header WHERE id = ?", [oh.id]);
        }

        // Also clean up our previous specific mock SO
        const prevSO = 'SO-MTK-2026-8888';
        const [prevHeaders]: any = await pool.query("SELECT id FROM penjualan_so_header WHERE nomor_so = ?", [prevSO]);
        for (const ph of prevHeaders) {
            await pool.query("DELETE FROM exception_writeoff WHERE alasan_hilang LIKE CONCAT('%', ?, '%')", [prevSO]);
            await pool.query("DELETE FROM penjualan_so_detail WHERE id_so_header = ?", [ph.id]);
            await pool.query("DELETE FROM penjualan_so_header WHERE id = ?", [ph.id]);
        }

        // Reset karantina stock to 0 initially for a clean state
        await pool.query("UPDATE inventory_stok SET stok_karantina = 0 WHERE id = ?", [barangId]);

        // ==========================================
        // SEED CASE 1: Shipped SO (Ready to be reported as FAILED_DELIVERY)
        // ==========================================
        const nomor_so1 = 'SO-EXC-0001';
        console.log(`Seeding Case 1: Shipped Order (${nomor_so1})`);
        const [result1]: any = await pool.query(
            `INSERT INTO penjualan_so_header 
             (nomor_so, nama_customer, alamat_pengiriman, tanggal_target_kirim, status_so, total_nilai, catatan, biaya_pengiriman, latitude, longitude, vendor_3pl, nomor_resi_3pl, nama_supir, plat_nomor, no_telepon_supir, created_at, updated_at) 
             VALUES (?, ?, ?, NOW(), 'SHIPPED', ?, ?, 15000, 0, 0, 'JNE Express', 'JN-172836281', 'Asep Kurir', 'D 1234 ABC', '08123456789', NOW(), NOW())`,
            [nomor_so1, 'Toko Sepeda Maju', 'Jl. Sukajadi No. 50, Bandung', 3515000, 'Pesanan reguler toko luar kota']
        );
        await pool.query(
            `INSERT INTO penjualan_so_detail (id_so_header, id_inventory_barang_jadi, qty, harga_satuan, subtotal, status_item, hpp_satuan_tercatat) 
             VALUES (?, ?, ?, ?, ?, 'TERSEDIA', ?)`,
            [result1.insertId, barangId, 1, 3500000, 3500000, 2395000]
        );

        // ==========================================
        // SEED CASE 2: Failed Delivery SO (Ready for Ajukan Kehilangan)
        // ==========================================
        const nomor_so2 = 'SO-EXC-0002';
        console.log(`Seeding Case 2: Failed Delivery (${nomor_so2})`);
        const [result2]: any = await pool.query(
            `INSERT INTO penjualan_so_header 
             (nomor_so, nama_customer, alamat_pengiriman, tanggal_target_kirim, status_so, total_nilai, catatan, biaya_pengiriman, latitude, longitude, vendor_3pl, nomor_resi_3pl, nama_supir, plat_nomor, no_telepon_supir, created_at, updated_at) 
             VALUES (?, ?, ?, NOW(), 'FAILED_DELIVERY', ?, ?, 15000, 0, 0, 'Sicepat', 'SC-99283746', 'Budi Driver', 'B 5678 XYZ', '08198765432', NOW(), NOW())`,
            [nomor_so2, 'Toko Sepeda Bintang', 'Jl. Asia Afrika No. 100, Bandung', 7015000, 'Alamat kosong/retailer pindah']
        );
        await pool.query(
            `INSERT INTO penjualan_so_detail (id_so_header, id_inventory_barang_jadi, qty, harga_satuan, subtotal, status_item, hpp_satuan_tercatat) 
             VALUES (?, ?, ?, ?, ?, 'TERSEDIA', ?)`,
            [result2.insertId, barangId, 2, 3500000, 7000000, 2395000]
        );
        // Add to quarantine stock
        await pool.query("UPDATE inventory_stok SET stok_karantina = stok_karantina + 2 WHERE id = ?", [barangId]);

        // ==========================================
        // SEED CASE 3: Failed Delivery with PENDING Write-Off
        // ==========================================
        const nomor_so3 = 'SO-EXC-0003';
        console.log(`Seeding Case 3: Failed Delivery with Pending Write-Off (${nomor_so3})`);
        const [result3]: any = await pool.query(
            `INSERT INTO penjualan_so_header 
             (nomor_so, nama_customer, alamat_pengiriman, tanggal_target_kirim, status_so, total_nilai, catatan, biaya_pengiriman, latitude, longitude, vendor_3pl, nomor_resi_3pl, nama_supir, plat_nomor, no_telepon_supir, created_at, updated_at) 
             VALUES (?, ?, ?, NOW(), 'FAILED_DELIVERY', ?, ?, 0, 0, 0, 'J&T Express', 'JT-88772211', 'Eko Rider', 'D 9999 DEF', '08771122334', NOW(), NOW())`,
            [nomor_so3, 'Geri Retailer', 'Ruko Kopo Mas, Bandung', 3500000, 'Barang pecah/hilang di jalan']
        );
        await pool.query(
            `INSERT INTO penjualan_so_detail (id_so_header, id_inventory_barang_jadi, qty, harga_satuan, subtotal, status_item, hpp_satuan_tercatat) 
             VALUES (?, ?, ?, ?, ?, 'TERSEDIA', ?)`,
            [result3.insertId, barangId, 1, 3500000, 3500000, 2395000]
        );
        // Add to quarantine stock
        await pool.query("UPDATE inventory_stok SET stok_karantina = stok_karantina + 1 WHERE id = ?", [barangId]);

        // Create Pending Write-Off document
        const wroId3 = `WRO-EXC-0003`;
        await pool.query(
            `INSERT INTO exception_writeoff 
             (id_writeoff, kode_item, qty_hilang, alasan_hilang, bukti_berita_acara, status_approval, created_at) 
             VALUES (?, ?, ?, ?, ?, 'PENDING', NOW())`,
            [wroId3, kodeBarang, 1, `Barang hilang saat pengiriman SO: ${nomor_so3}`, 'mock_berita_acara.png']
        );

        // ==========================================
        // SEED CASE 4: Failed Delivery with APPROVED Write-Off (Resolved)
        // ==========================================
        const nomor_so4 = 'SO-EXC-0004';
        console.log(`Seeding Case 4: Failed Delivery with Approved Write-Off (${nomor_so4})`);
        const [result4]: any = await pool.query(
            `INSERT INTO penjualan_so_header 
             (nomor_so, nama_customer, alamat_pengiriman, tanggal_target_kirim, status_so, total_nilai, catatan, biaya_pengiriman, latitude, longitude, vendor_3pl, nomor_resi_3pl, nama_supir, plat_nomor, no_telepon_supir, created_at, updated_at) 
             VALUES (?, ?, ?, NOW(), 'FAILED_DELIVERY', ?, ?, 0, 0, 0, 'GrabExpress', 'GRB-99882233', 'Dani Driver', 'D 888 GHI', '08998888777', NOW(), NOW() - INTERVAL 1 DAY)`,
            [nomor_so4, 'Toko Sepeda Makmur', 'Jl. Pasteur No. 12, Bandung', 3500000, 'Kecelakaan kurir - barang hancur']
        );
        await pool.query(
            `INSERT INTO penjualan_so_detail (id_so_header, id_inventory_barang_jadi, qty, harga_satuan, subtotal, status_item, hpp_satuan_tercatat) 
             VALUES (?, ?, ?, ?, ?, 'TERSEDIA', ?)`,
            [result4.insertId, barangId, 1, 3500000, 3500000, 2395000]
        );
        // Note: Stok karantina tidak ditambah karena statusnya APPROVED (stok sudah terpotong di inventory)

        // Create Approved Write-Off document
        const wroId4 = `WRO-EXC-0004`;
        await pool.query(
            `INSERT INTO exception_writeoff 
             (id_writeoff, kode_item, qty_hilang, alasan_hilang, bukti_berita_acara, status_approval, created_at) 
             VALUES (?, ?, ?, ?, ?, 'APPROVED', NOW() - INTERVAL 12 HOUR)`,
            [wroId4, kodeBarang, 1, `Barang hilang saat pengiriman SO: ${nomor_so4}`, 'mock_berita_acara.png']
        );

        // ==========================================
        // SEED CASE 5: Failed Delivery with REJECTED Write-Off (Re-adjustable)
        // ==========================================
        const nomor_so5 = 'SO-EXC-0005';
        console.log(`Seeding Case 5: Failed Delivery with Rejected Write-Off (${nomor_so5})`);
        const [result5]: any = await pool.query(
            `INSERT INTO penjualan_so_header 
             (nomor_so, nama_customer, alamat_pengiriman, tanggal_target_kirim, status_so, total_nilai, catatan, biaya_pengiriman, latitude, longitude, vendor_3pl, nomor_resi_3pl, nama_supir, plat_nomor, no_telepon_supir, created_at, updated_at) 
             VALUES (?, ?, ?, NOW(), 'FAILED_DELIVERY', ?, ?, 0, 0, 0, 'JNE Express', 'JN-11223344', 'Eka Kurir', 'D 4567 ABC', '08123499999', NOW(), NOW() - INTERVAL 2 DAY)`,
            [nomor_so5, 'Toko Sepeda Sentosa', 'Jl. Kopo No. 200, Bandung', 3500000, 'Salah lapor kurir - barang aman di karantina']
        );
        await pool.query(
            `INSERT INTO penjualan_so_detail (id_so_header, id_inventory_barang_jadi, qty, harga_satuan, subtotal, status_item, hpp_satuan_tercatat) 
             VALUES (?, ?, ?, ?, ?, 'TERSEDIA', ?)`,
            [result5.insertId, barangId, 1, 3500000, 3500000, 2395000]
        );
        // Add to quarantine stock
        await pool.query("UPDATE inventory_stok SET stok_karantina = stok_karantina + 1 WHERE id = ?", [barangId]);

        // Create Rejected Write-Off document
        const wroId5 = `WRO-EXC-0005`;
        await pool.query(
            `INSERT INTO exception_writeoff 
             (id_writeoff, kode_item, qty_hilang, alasan_hilang, bukti_berita_acara, status_approval, created_at) 
             VALUES (?, ?, ?, ?, ?, 'REJECTED', NOW() - INTERVAL 1 DAY)`,
            [wroId5, kodeBarang, 1, `Barang hilang saat pengiriman SO: ${nomor_so5}`, 'mock_berita_acara.png']
        );

        console.log('Exception flow test data seeded successfully!');
        await pool.end();
    } catch (err) {
        console.error('Error running exception seeder script:', err);
    }
}

main();
