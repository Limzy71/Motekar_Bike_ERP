/**
 * ============================================================
 *  MOTEKAR ERP — QA RESET SCRIPT
 * ============================================================
 *  Tujuan: Membersihkan semua data transaksi (dummy/dev) agar
 *  database kembali "perawan" untuk E2E QA Testing.
 *
 *  YANG DIPERTAHANKAN (Master Data):
 *    - users              → Akun login tetap ada
 *    - master_bom         → Resep manufaktur tetap ada
 *    - manufaktur_bom_*   → Struktur BOM tetap ada
 *    - master_vendor      → Data vendor tetap ada
 *    - inventory_stok     → Struktur barang tetap, stok di-reset ke 0
 *
 *  YANG DIHAPUS (Transaksional):
 *    - Semua tabel transaksi (PO, PR, SO, WO, Invoice, dll.)
 *    - File upload (avatar, e-POD, foto garansi, dll.)
 *
 *  Jalankan: npx tsx backend/src/scripts/reset_qa.ts
 * ============================================================
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// ── Konfigurasi ──────────────────────────────────────────────
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_BASE_DIR = path.join(__dirname, '../../public/uploads');

const TABLES_TO_TRUNCATE = [
    // === Pengadaan (P2P) ===
    'pengadaan_po_detail',
    'pengadaan_po_header',
    'pengadaan_pr_detail',
    'pengadaan_pr_header',
    'penerimaan_barang',
    'detail_penerimaan',
    'rtv_dokumen',
    'pembayaran_vendor',
    'tagihan_vendor',
    'pengadaan_restock_requests',

    // === Penjualan (O2C) ===
    'sales_order_detail',
    'sales_order',
    'penjualan_so_detail',
    'penjualan_so_header',
    'penjualan_invoice',
    'ar_invoice',
    'logistik_packing_list',

    // === Manufaktur (MES) ===
    'operasi_wo_material_allocation',
    'operasi_wo_header',
    'operasi_kanban',
    'kitting_material',
    'work_order',
    'qc_log',
    'qc_inspeksi',

    // === CRM & Aftersales ===
    'retailer_prospek',
    'crm_prospek',
    'klaim_garansi',
    'aftersales_klaim',
    'pemasaran_aktivitas',
    'pemasaran_leads',
    'pemasaran_campaigns',

    // === Keuangan & Legal ===
    'keuangan_jurnal',
    'legal_mitra',

    // === Sistem ===
    'audit_logs',
    'pengajuan_ganti_email',
];

// ── Helper: ASCII Art Banner ─────────────────────────────────
function printBanner() {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║           🧹  MOTEKAR ERP — QA RESET SCRIPT  🧹         ║
║                                                          ║
║   Membersihkan data transaksi & storage untuk QA Test    ║
╚══════════════════════════════════════════════════════════╝
    `);
}

// ── Helper: Recursive Clean Directory ────────────────────────
function cleanDirectory(dirPath: string, depth: number = 0): number {
    let deletedCount = 0;

    if (!fs.existsSync(dirPath)) {
        console.log(`   ⚠  Direktori tidak ditemukan: ${dirPath}`);
        return 0;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        // Jangan hapus .gitkeep
        if (entry.name === '.gitkeep') continue;

        if (entry.isDirectory()) {
            // Rekursif bersihkan subdirektori
            deletedCount += cleanDirectory(fullPath, depth + 1);
            // Hapus folder kosong (kecuali root uploads)
            if (depth > 0) {
                try {
                    fs.rmdirSync(fullPath);
                } catch { /* folder mungkin tidak kosong, skip */ }
            }
        } else {
            fs.unlinkSync(fullPath);
            deletedCount++;
        }
    }

    return deletedCount;
}

// ── Main Execution ───────────────────────────────────────────
async function main() {
    printBanner();

    const startTime = Date.now();

    // Koneksi ke database
    console.log('🔌 Menghubungkan ke database...');
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'motekar_erp',
    });
    console.log('   ✔ Terhubung ke database:', process.env.DB_NAME || 'motekar_erp');

    try {
        // ─── FASE 1: Matikan FK Checks ───────────────────────
        console.log('\n━━━ FASE 1: Menonaktifkan Foreign Key Checks ━━━');
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');
        console.log('   ✔ FOREIGN_KEY_CHECKS = 0');

        // ─── FASE 2: Truncate Tabel Transaksional ────────────
        console.log('\n━━━ FASE 2: Membersihkan Tabel Transaksional ━━━');
        let truncatedCount = 0;
        let skippedCount = 0;

        for (const table of TABLES_TO_TRUNCATE) {
            try {
                await connection.query(`TRUNCATE TABLE \`${table}\``);
                console.log(`   ✔ TRUNCATE → ${table}`);
                truncatedCount++;
            } catch (err: any) {
                // Tabel mungkin tidak ada (belum di-migrate), skip saja
                if (err.code === 'ER_NO_SUCH_TABLE') {
                    console.log(`   ⏭  SKIP (tabel tidak ada) → ${table}`);
                    skippedCount++;
                } else {
                    console.error(`   ✖ ERROR pada ${table}: ${err.message}`);
                }
            }
        }
        console.log(`\n   📊 Hasil: ${truncatedCount} tabel dibersihkan, ${skippedCount} dilewati`);

        // ─── FASE 3: Reset Stok Inventory ────────────────────
        console.log('\n━━━ FASE 3: Reset Stok Inventory ke 0 ━━━');
        const [updateResult] = await connection.query(`
            UPDATE inventory_stok 
            SET jumlah_stok = 0, 
                stok_committed = 0, 
                stok_karantina = 0
        `) as any;
        console.log(`   ✔ ${updateResult.affectedRows} baris inventory_stok di-reset ke 0`);
        console.log('   ℹ  Master barang (nama, kode, tipe) TETAP dipertahankan');

        // ─── FASE 4: Injeksi Modal Awal ──────────────────────
        console.log('\n━━━ FASE 4: Menginjeksi Modal Awal QA ━━━');
        await connection.query(`
            INSERT INTO keuangan_jurnal (tanggal, referensi_dokumen, keterangan, tipe_akun, posisi, nominal)
            VALUES (NOW(), 'MODAL-QA-001', 'Injeksi Modal Awal (Sistem QA)', 'Kas_Bank', 'Debit', 1000000000)
        `);
        console.log('   ✔ Saldo Kas & Bank di-reset menjadi Rp 1.000.000.000');

        // ─── FASE 5: Nyalakan Kembali FK Checks ─────────────
        console.log('\n━━━ FASE 5: Mengaktifkan Kembali Foreign Key Checks ━━━');
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        console.log('   ✔ FOREIGN_KEY_CHECKS = 1');

        // ─── FASE 6: Bersihkan Storage ───────────────────────
        console.log('\n━━━ FASE 6: Membersihkan Storage (Uploads) ━━━');
        console.log(`   📂 Target: ${UPLOAD_BASE_DIR}`);

        const uploadDirs = ['avatars', 'epod'];
        let totalFilesDeleted = 0;

        for (const subDir of uploadDirs) {
            const dirPath = path.join(UPLOAD_BASE_DIR, subDir);
            const count = cleanDirectory(dirPath);
            totalFilesDeleted += count;
            console.log(`   ✔ /${subDir}/ → ${count} file dihapus`);
        }

        // Bersihkan juga file langsung di root uploads (jika ada)
        if (fs.existsSync(UPLOAD_BASE_DIR)) {
            const rootEntries = fs.readdirSync(UPLOAD_BASE_DIR, { withFileTypes: true });
            for (const entry of rootEntries) {
                if (!entry.isDirectory() && entry.name !== '.gitkeep') {
                    fs.unlinkSync(path.join(UPLOAD_BASE_DIR, entry.name));
                    totalFilesDeleted++;
                }
            }
        }

        console.log(`\n   📊 Total file dihapus dari storage: ${totalFilesDeleted}`);

        // ─── RINGKASAN AKHIR ─────────────────────────────────
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`
╔══════════════════════════════════════════════════════════╗
║              ✅  QA RESET SELESAI!                       ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║   🗃️  Tabel dibersihkan  : ${String(truncatedCount).padStart(3)} tabel                    ║
║   📦  Inventory di-reset : ${String(updateResult.affectedRows).padStart(3)} baris                    ║
║   🗑️  File dihapus       : ${String(totalFilesDeleted).padStart(3)} file                     ║
║   ⏱️  Waktu eksekusi     : ${elapsed.padStart(6)}s                      ║
║                                                          ║
║   🛡️  YANG AMAN (tidak disentuh):                        ║
║       • users, master_bom, manufaktur_bom_*              ║
║       • master_vendor, inventory_stok (struktur)         ║
║                                                          ║
║   Database siap untuk E2E QA Testing! 🚀                ║
╚══════════════════════════════════════════════════════════╝
        `);

    } catch (error) {
        console.error('\n❌ FATAL ERROR:', error);
        // Pastikan FK checks tetap diaktifkan kembali
        await connection.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
        process.exit(1);
    } finally {
        await connection.end();
    }
}

main().catch((err) => {
    console.error('❌ Script gagal dijalankan:', err.message);
    process.exit(1);
});
