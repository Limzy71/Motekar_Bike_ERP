/**
 * keuangan.ts — Logic untuk halaman Keuangan & Akuntansi (HPP / COGS Engine).
 * Modul Read-Only: Executive Dashboard untuk memonitor Buku Besar dan Profitabilitas.
 */

import { apiFetch } from '../api.js';
import { initRBAC, showToast } from '../components/rbac.js';

interface JurnalEntry {
    id_jurnal: number;
    tanggal: string;
    referensi_dokumen: string;
    keterangan: string;
    tipe_akun: 'Aset_Persediaan' | 'Pendapatan' | 'HPP' | 'Kas_Bank';
    posisi: 'Debit' | 'Kredit';
    nominal: string | number;
}

interface JurnalResponse {
    success: boolean;
    data: JurnalEntry[];
    message?: string;
}

interface KPIData {
    total_aset_persediaan: number;
    pendapatan_kotor: number;
    total_hpp: number;
    laba_bersih: number;
}

interface KPIResponse {
    success: boolean;
    data: KPIData;
    message?: string;
}

// ============================================================
// FORMATTERS
// ============================================================

function formatRupiah(angka: number | string): string {
    const num = typeof angka === 'string' ? parseFloat(angka) : angka;
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);
}

// ============================================================
// DATA FETCHING & RENDERING
// ============================================================

async function loadKPI(): Promise<void> {
    try {
        const response = await apiFetch<KPIResponse>('keuangan/kpi');
        if (response.success) {
            const d = response.data;

            const elAset = document.getElementById('kpi-aset');
            const elPendapatan = document.getElementById('kpi-pendapatan');
            const elLaba = document.getElementById('kpi-laba');

            if (elAset) elAset.textContent = formatRupiah(d.total_aset_persediaan);
            if (elPendapatan) elPendapatan.textContent = formatRupiah(d.pendapatan_kotor);
            if (elLaba) {
                elLaba.textContent = formatRupiah(d.laba_bersih);
                // Warna dinamis: hijau jika untung, merah jika rugi
                if (d.laba_bersih >= 0) {
                    elLaba.classList.add('text-emerald-700');
                    elLaba.classList.remove('text-rose-700');
                } else {
                    elLaba.classList.add('text-rose-700');
                    elLaba.classList.remove('text-emerald-700');
                }
            }
        }
    } catch (err) {
        console.error('loadKPI error:', err);
        showToast('Gagal memuat data KPI Keuangan.', true);
    }
}

async function loadJurnal(): Promise<void> {
    const tbody = document.getElementById('tbody-jurnal');
    if (!tbody) return;

    try {
        const response = await apiFetch<JurnalResponse>('keuangan/jurnal');
        if (response.success) {
            tbody.innerHTML = '';

            if (response.data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-slate-500">Buku Besar masih kosong. Jurnal akan terisi otomatis saat terjadi transaksi QC atau Penjualan.</td></tr>`;
                return;
            }

            response.data.forEach(j => {
                const d = new Date(j.tanggal);
                const dateStr = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
                const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

                const nominal = typeof j.nominal === 'string' ? parseFloat(j.nominal) : j.nominal;

                // Tipe akun badge colors
                let akunBadgeClass = '';
                let akunLabel = j.tipe_akun.replace('_', ' ');
                switch (j.tipe_akun) {
                    case 'Aset_Persediaan':
                        akunBadgeClass = 'bg-blue-50 text-blue-700 border-blue-200';
                        akunLabel = 'Aset Persediaan';
                        break;
                    case 'Pendapatan':
                        akunBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                        break;
                    case 'HPP':
                        akunBadgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
                        break;
                    case 'Kas_Bank':
                        akunBadgeClass = 'bg-violet-50 text-violet-700 border-violet-200';
                        akunLabel = 'Kas / Bank';
                        break;
                }

                // Debit = emerald, Kredit = rose
                const debitVal = j.posisi === 'Debit' ? formatRupiah(nominal) : '';
                const kreditVal = j.posisi === 'Kredit' ? formatRupiah(nominal) : '';
                const debitClass = j.posisi === 'Debit' ? 'text-emerald-700 font-bold' : 'text-slate-300';
                const kreditClass = j.posisi === 'Kredit' ? 'text-rose-600 font-bold' : 'text-slate-300';

                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50/50 transition-colors duration-150 text-xs font-medium text-slate-600 group';
                tr.innerHTML = `
                    <td class="px-4 py-3">
                        <p class="font-semibold text-slate-700">${dateStr}</p>
                        <p class="text-[10px] text-slate-400">${timeStr}</p>
                    </td>
                    <td class="px-4 py-3">
                        <span class="font-data-mono font-bold text-primary text-[11px]">${j.referensi_dokumen}</span>
                    </td>
                    <td class="px-4 py-3 max-w-[300px]">
                        <p class="text-slate-700 truncate">${j.keterangan}</p>
                    </td>
                    <td class="px-4 py-3 text-center">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wide border ${akunBadgeClass}">${akunLabel}</span>
                    </td>
                    <td class="px-4 py-3 text-right ${debitClass} font-data-mono">
                        ${debitVal || '-'}
                    </td>
                    <td class="px-4 py-3 text-right ${kreditClass} font-data-mono">
                        ${kreditVal || '-'}
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-rose-600">Gagal memuat data: ${response.message}</td></tr>`;
        }
    } catch (err) {
        console.error('loadJurnal error:', err);
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-rose-600">Terjadi kesalahan koneksi jaringan.</td></tr>`;
    }
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    const user = initRBAC('nav-keuangan');
    if (!user) return;

    loadKPI();
    loadJurnal();

    // Refresh button
    document.getElementById('btn-refresh')?.addEventListener('click', () => {
        loadKPI();
        loadJurnal();
    });
});
