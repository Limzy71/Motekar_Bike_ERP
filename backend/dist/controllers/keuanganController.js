import pool from '../config/database.js';
export async function calculateHPPDetails(connection, kodeSepeda, isTopLevel = true) {
    // 1. Ambil data item dari Master Inventory
    const [itemData] = await connection.query('SELECT tipe_item, harga_standar, biaya_rakit, biaya_antar FROM inventory_stok WHERE kode_barang = ?', [kodeSepeda]);
    if (itemData.length === 0)
        return { materialCost: 0, laborCost: 0, shippingCost: 0, total: 0 };
    const item = itemData[0];
    const hargaStandar = parseFloat(item.harga_standar) || 0;
    const biayaRakit = parseFloat(item.biaya_rakit) || 0;
    const biayaAntar = parseFloat(item.biaya_antar) || 0;
    // 2. Jika Raw Material (RM), kembalikan Harga Dasar (Material Cost) saja
    if (item.tipe_item === 'RM') {
        return { materialCost: hargaStandar, laborCost: 0, shippingCost: 0, total: hargaStandar };
    }
    // 3. Jika SA / FG, cari resep BOM pembentuknya
    const [bomHeader] = await connection.query('SELECT id_bom FROM manufaktur_bom_header WHERE kode_item_parent = ?', [kodeSepeda]);
    let materialCost = 0;
    if (bomHeader.length > 0) {
        const idBom = bomHeader[0].id_bom;
        const [details] = await connection.query('SELECT kode_item_komponen, qty_kebutuhan FROM manufaktur_bom_detail WHERE id_bom = ?', [idBom]);
        // Rekursif (Bottom-Up Rollup) untuk setiap komponen pembentuk
        for (const detail of details) {
            const childHPP = await calculateHPPDetails(connection, detail.kode_item_komponen, false);
            materialCost += childHPP.total * parseFloat(detail.qty_kebutuhan);
        }
    }
    else {
        // Fallback jika SA/FG tidak punya resep BOM, asumsikan material cost = harga_standar master
        materialCost = hargaStandar;
    }
    // 4. Hitung HPP Total
    let totalHPP = materialCost + biayaRakit;
    let finalShippingCost = 0;
    // 5. Modal Distribusi Akhir ditambahkan hanya pada level puncak (FG)
    if (isTopLevel && item.tipe_item === 'FG') {
        totalHPP += biayaAntar;
        finalShippingCost = biayaAntar;
    }
    return {
        materialCost: materialCost,
        laborCost: biayaRakit,
        shippingCost: finalShippingCost,
        total: totalHPP
    };
}
// ============================================================
// HELPER: calculateHPP — Wrapper untuk Kompatibilitas Modul Lain
// ============================================================
export async function calculateHPP(connection, kodeSepeda, isTopLevel = true) {
    const detail = await calculateHPPDetails(connection, kodeSepeda, isTopLevel);
    return detail.total;
}
// ============================================================
// HELPER: insertJurnal — Sisipkan entri jurnal keuangan
// ============================================================
export async function insertJurnal(connection, referensi, keterangan, tipeAkun, posisi, nominal) {
    await connection.query('INSERT INTO keuangan_jurnal (referensi_dokumen, keterangan, tipe_akun, posisi, nominal) VALUES (?, ?, ?, ?, ?)', [referensi, keterangan, tipeAkun, posisi, nominal]);
}
// ============================================================
// [GET] /api/keuangan/jurnal — Ambil seluruh Buku Besar
// ============================================================
export const getAllJurnal = async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id_jurnal, tanggal, referensi_dokumen, keterangan, tipe_akun, posisi, nominal FROM keuangan_jurnal ORDER BY tanggal DESC, id_jurnal DESC');
        res.json({ success: true, data: rows });
    }
    catch (error) {
        console.error('[getAllJurnal] Error:', error);
        res.status(500).json({ success: false, message: `Server error: ${error.message}` });
    }
};
// ============================================================
// [GET] /api/keuangan/kpi — Kalkulasi Metrik Eksekutif
// ============================================================
export const getKPI = async (req, res) => {
    try {
        // 1. Total Aset Persediaan = SUM(Debit Aset_Persediaan) - SUM(Kredit Aset_Persediaan)
        const [asetDebit] = await pool.query("SELECT COALESCE(SUM(nominal), 0) as total FROM keuangan_jurnal WHERE tipe_akun = 'Aset_Persediaan' AND posisi = 'Debit'");
        const [asetKredit] = await pool.query("SELECT COALESCE(SUM(nominal), 0) as total FROM keuangan_jurnal WHERE tipe_akun = 'Aset_Persediaan' AND posisi = 'Kredit'");
        const totalAsetPersediaan = parseFloat(asetDebit[0].total) - parseFloat(asetKredit[0].total);
        // 2. Pendapatan Kotor Bulan Ini = SUM(Kredit Pendapatan) WHERE month = current
        const now = new Date();
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01 00:00:00`;
        const [pendapatan] = await pool.query("SELECT COALESCE(SUM(nominal), 0) as total FROM keuangan_jurnal WHERE tipe_akun = 'Pendapatan' AND posisi = 'Kredit' AND tanggal >= ?", [monthStart]);
        const pendapatanKotor = parseFloat(pendapatan[0].total);
        // 3. Total HPP Bulan Ini = SUM(Debit HPP) WHERE month = current
        const [hpp] = await pool.query("SELECT COALESCE(SUM(nominal), 0) as total FROM keuangan_jurnal WHERE tipe_akun = 'HPP' AND posisi = 'Debit' AND tanggal >= ?", [monthStart]);
        const totalHPP = parseFloat(hpp[0].total);
        // 4. Laba Bersih = Pendapatan - HPP
        const labaBersih = pendapatanKotor - totalHPP;
        res.json({
            success: true,
            data: {
                total_aset_persediaan: totalAsetPersediaan,
                pendapatan_kotor: pendapatanKotor,
                total_hpp: totalHPP,
                laba_bersih: labaBersih
            }
        });
    }
    catch (error) {
        console.error('[getKPI] Error:', error);
        res.status(500).json({ success: false, message: `Server error: ${error.message}` });
    }
};
