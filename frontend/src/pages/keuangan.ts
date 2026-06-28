/**
 * keuangan.ts — Logic untuk halaman Keuangan & Akuntansi (HPP / COGS Engine).
 * Modul Read-Only: Executive Dashboard untuk memonitor Buku Besar dan Profitabilitas.
 */

import { apiFetch } from '../api.js';
import { initRBAC, showToast } from '../components/rbac.js';
import { renderPaginationUI } from '../utils/pagination.js';

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
    total_kas_bank: number;
}

interface KPIResponse {
    success: boolean;
    data: KPIData;
    message?: string;
}

let allJurnal: JurnalEntry[] = [];
let currentPage = 1;
const itemsPerPage = 10;

let allPendingReceipts: any[] = [];
let pendingReceiptsCurrentPage = 1;
const apItemsPerPage = 10;

let allInvoices: any[] = [];
let invoicesCurrentPage = 1;

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

            const elKas = document.getElementById('kpi-kas');
            const elAset = document.getElementById('kpi-aset');
            const elPendapatan = document.getElementById('kpi-pendapatan');
            const elLaba = document.getElementById('kpi-laba');

            if (elKas) elKas.textContent = formatRupiah(d.total_kas_bank);
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
            allJurnal = response.data;
            currentPage = 1;
            renderTable();
        } else {
            tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-rose-600">Gagal memuat data: ${response.message}</td></tr>`;
        }
    } catch (err) {
        console.error('loadJurnal error:', err);
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-rose-600">Terjadi kesalahan koneksi jaringan.</td></tr>`;
    }
}

function renderTable(): void {
    const tbody = document.getElementById('tbody-jurnal');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (allJurnal.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-slate-500">Buku Besar masih kosong. Jurnal akan terisi otomatis saat terjadi transaksi QC atau Penjualan.</td></tr>`;
    renderPaginationUI('keuangan-pagination-pagination', 'keuangan-pagination-info', 1, 10, 0, () => {});
        return;
    }

    const totalItems = allJurnal.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    const currentItems = allJurnal.slice(startIndex, endIndex);

    currentItems.forEach(j => {
        const d = new Date(j.tanggal);
        const dateStr = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

        const nominal = typeof j.nominal === 'string' ? parseFloat(j.nominal) : j.nominal;

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

        const debitVal = j.posisi === 'Debit' ? formatRupiah(nominal) : '';
        const kreditVal = j.posisi === 'Kredit' ? formatRupiah(nominal) : '';
        const debitClass = j.posisi === 'Debit' ? 'text-emerald-700 font-bold' : 'text-slate-300';
        const kreditClass = j.posisi === 'Kredit' ? 'text-rose-600 font-bold' : 'text-slate-300';

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-100 transition-colors duration-150 text-xs font-medium text-slate-600 group';
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
    renderPaginationUI('keuangan-pagination-pagination', 'keuangan-pagination-info', currentPage, itemsPerPage, totalItems, (newPage) => { currentPage = newPage; renderTable(); });
}


// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    const user = initRBAC('nav-keuangan');
    if (!user) return;

    // Hard-guard for Keuangan module
    const allowedRoles = ['Owner', 'General Manager', 'Keuangan & Akuntansi'];
    if (!allowedRoles.includes(user.divisi_role)) {
        console.warn('[SECURITY] Akses ditolak untuk role:', user.divisi_role);
        window.location.href = '/dashboard.html';
        return;
    }

    setupTabs();
    setupAPModals();

    const lastTab = localStorage.getItem('keuanganLastTab') as 'dashboard' | 'ap' || 'dashboard';
    switchTab(lastTab);

    // Refresh button
    document.getElementById('btn-refresh')?.addEventListener('click', () => {
        loadKPI();
        loadJurnal();
    });

    const antiFlicker = document.getElementById('anti-flicker');
    if (antiFlicker) antiFlicker.remove();
});

// ============================================================
// TABS & AP LOGIC
// ============================================================

const activeTabClass = "px-6 py-3 border-b-2 border-primary text-primary font-bold text-sm transition-colors";
const inactiveTabClass = "px-6 py-3 border-b-2 border-transparent text-slate-500 hover:text-slate-700 font-medium text-sm transition-colors flex items-center gap-2";

function setupTabs() {
    const tabDashboard = document.getElementById('tab-dashboard');
    const tabAP = document.getElementById('tab-ap');

    tabDashboard?.addEventListener('click', () => switchTab('dashboard'));
    tabAP?.addEventListener('click', () => switchTab('ap'));
}

function switchTab(tab: 'dashboard' | 'ap') {
    const tabDashboard = document.getElementById('tab-dashboard');
    const tabAP = document.getElementById('tab-ap');
    const sectionDashboard = document.getElementById('section-dashboard');
    const sectionAP = document.getElementById('section-ap');

    if (tabDashboard) tabDashboard.className = inactiveTabClass;
    if (tabAP) tabAP.className = inactiveTabClass;
    sectionDashboard?.classList.add('hidden');
    sectionAP?.classList.add('hidden');

    if (tab === 'dashboard') {
        if (tabDashboard) tabDashboard.className = activeTabClass;
        sectionDashboard?.classList.remove('hidden');
        loadKPI();
        loadJurnal();
    } else {
        if (tabAP) tabAP.className = activeTabClass + ' flex items-center gap-2';
        sectionAP?.classList.remove('hidden');
        loadPendingReceipts();
        loadInvoices();
    }
    localStorage.setItem('keuanganLastTab', tab);
}

// ============================================================
// ACCOUNTS PAYABLE API CALLS
// ============================================================

async function loadPendingReceipts() {
    const tbody = document.getElementById('tbody-pending-receipts');
    if (!tbody) return;
    try {
        const res = await apiFetch<any>('finance/ap/pending-receipts');
        if (res.success) {
            allPendingReceipts = res.data;
            pendingReceiptsCurrentPage = 1;
            renderPendingReceipts();
            const badge = document.getElementById('badge-ap');
            if (badge) {
                if (allPendingReceipts.length > 0) { badge.textContent = allPendingReceipts.length.toString(); badge.classList.remove('hidden'); }
                else { badge.classList.add('hidden'); }
            }
        }
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-sm text-rose-500">Gagal memuat antrean tagihan.</td></tr>`;
    }
}

function renderPendingReceipts() {
    const tbody = document.getElementById('tbody-pending-receipts');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (allPendingReceipts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-sm text-slate-500">Tidak ada antrean tagihan.</td></tr>`;
        renderPaginationUI('ap-pending-pagination-pagination', 'ap-pending-pagination-info', 1, 10, 0, () => {});
        return;
    }
    const totalItems = allPendingReceipts.length;
    const totalPages = Math.ceil(totalItems / apItemsPerPage);
    if (pendingReceiptsCurrentPage < 1) pendingReceiptsCurrentPage = 1;
    if (pendingReceiptsCurrentPage > totalPages) pendingReceiptsCurrentPage = totalPages;
    const startIndex = (pendingReceiptsCurrentPage - 1) * apItemsPerPage;
    const currentItems = allPendingReceipts.slice(startIndex, startIndex + apItemsPerPage);
    currentItems.forEach((item: any) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-rose-50/50 transition-colors cursor-pointer';
        tr.onclick = (e) => {
            // only trigger if not clicking the button directly
            if ((e.target as HTMLElement).tagName !== 'BUTTON') {
                (window as any).openInvoiceModal(item.id_po_header, item.id_penerimaan, item.nomor_po);
            }
        };
        tr.innerHTML = `
            <td class="px-4 py-3 font-semibold text-slate-700">${new Date(item.tanggal_terima).toLocaleDateString('id-ID')}</td>
            <td class="px-4 py-3">
                <p class="font-data-mono font-bold text-primary">${item.nomor_po}</p>
                <p class="text-[10px] text-slate-500 uppercase font-bold">${item.nama_vendor}</p>
            </td>
            <td class="px-4 py-3 text-center font-data-mono font-bold">${item.total_qty_terima} item</td>
            <td class="px-4 py-3 text-center">
                <button class="px-3 py-1 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded text-[11px] font-bold border border-rose-200 transition-colors" onclick="window.openInvoiceModal(${item.id_po_header}, ${item.id_penerimaan}, '${item.nomor_po}')">Buat Tagihan</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    renderPaginationUI('ap-pending-pagination-pagination', 'ap-pending-pagination-info', pendingReceiptsCurrentPage, apItemsPerPage, totalItems, (newPage) => { pendingReceiptsCurrentPage = newPage; renderPendingReceipts(); });
}

async function loadInvoices() {
    const tbody = document.getElementById('tbody-invoices');
    if (!tbody) return;
    try {
        const res = await apiFetch<any>('finance/ap/invoices');
        if (res.success) {
            allInvoices = res.data;
            invoicesCurrentPage = 1;
            renderInvoices();
        }
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-rose-500">Gagal memuat daftar tagihan.</td></tr>`;
    }
}

function renderInvoices() {
    const tbody = document.getElementById('tbody-invoices');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (allInvoices.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-slate-500">Belum ada invoice/tagihan yang tercatat.</td></tr>`;
        renderPaginationUI('ap-invoice-pagination-pagination', 'ap-invoice-pagination-info', 1, 10, 0, () => {});
        return;
    }
    const totalItems = allInvoices.length;
    const totalPages = Math.ceil(totalItems / apItemsPerPage);
    if (invoicesCurrentPage < 1) invoicesCurrentPage = 1;
    if (invoicesCurrentPage > totalPages) invoicesCurrentPage = totalPages;
    const startIndex = (invoicesCurrentPage - 1) * apItemsPerPage;
    const currentItems = allInvoices.slice(startIndex, startIndex + apItemsPerPage);
    currentItems.forEach((inv: any) => {
        let badgeClass = '';
        if (inv.status === 'UNPAID') badgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
        else if (inv.status === 'PARTIAL') badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
        else if (inv.status === 'PAID') badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        const sisa = parseFloat(inv.total_tagihan) - parseFloat(inv.total_dibayar);
        let btnBayar = '';
        if (inv.status !== 'PAID') {
            btnBayar = `<button class="px-3 py-1 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded text-[11px] font-bold border border-blue-200 transition-colors" onclick="window.openPayModal(${inv.id}, '${inv.no_tagihan_vendor}', ${sisa})">Bayar</button>`;
        } else {
            btnBayar = `<span class="text-[10px] text-emerald-600 font-bold"><span class="material-symbols-outlined text-[14px] align-middle">check_circle</span> Lunas</span>`;
        }
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-blue-50/40 transition-colors';
        tr.innerHTML = `
            <td class="px-4 py-3 font-data-mono font-bold text-slate-800">${inv.no_tagihan_vendor}</td>
            <td class="px-4 py-3 text-slate-700">${inv.nama_vendor}</td>
            <td class="px-4 py-3 text-right font-data-mono font-bold">${formatRupiah(inv.total_tagihan)}</td>
            <td class="px-4 py-3 text-right font-data-mono font-bold text-rose-600">${formatRupiah(sisa)}</td>
            <td class="px-4 py-3 text-center"><span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${badgeClass}">${inv.status}</span></td>
            <td class="px-4 py-3 text-center">${btnBayar}</td>
        `;
        tbody.appendChild(tr);
    });
    renderPaginationUI('ap-invoice-pagination-pagination', 'ap-invoice-pagination-info', invoicesCurrentPage, apItemsPerPage, totalItems, (newPage) => { invoicesCurrentPage = newPage; renderInvoices(); });
}

// ============================================================
// AP MODALS
// ============================================================

(window as any).openInvoiceModal = async (poId: number, receiptId: number, poNo: string) => {
    const modal = document.getElementById('modal-invoice');
    const content = document.getElementById('modal-invoice-content');
    
    (document.getElementById('inv-po-id') as HTMLInputElement).value = poId.toString();
    (document.getElementById('inv-receipt-id') as HTMLInputElement).value = receiptId.toString();
    (document.getElementById('inv-system-calc') as HTMLElement).textContent = 'Menghitung...';
    
    // Simulate calculation logic (in reality backend checks, but UX needs preview)
    // Actually, we don't have direct endpoint for expected total preview.
    // For now we will just instruct user to input the invoice total, backend will strictly reject if 3-way match fails.
    (document.getElementById('inv-system-calc') as HTMLElement).textContent = 'Menunggu Input & Validasi Server';

    if (modal && content) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            content.classList.remove('scale-95');
        }, 10);
    }
};

(window as any).openPayModal = (id_tagihan: number, no_tagihan: string, sisa: number) => {
    const modal = document.getElementById('modal-pay');
    const content = document.getElementById('modal-pay-content');
    
    (document.getElementById('pay-inv-id') as HTMLInputElement).value = id_tagihan.toString();
    (document.getElementById('pay-inv-no') as HTMLElement).textContent = no_tagihan;
    (document.getElementById('pay-sisa') as HTMLElement).textContent = formatRupiah(sisa);
    (document.getElementById('pay-nominal') as HTMLInputElement).value = sisa.toString();

    if (modal && content) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            content.classList.remove('scale-95');
        }, 10);
    }
};

function setupAPModals() {
    const closeModal = (modalId: string) => {
        const modal = document.getElementById(modalId);
        const content = document.getElementById(`${modalId}-content`);
        if (modal && content) {
            modal.classList.add('opacity-0');
            content.classList.add('scale-95');
            setTimeout(() => {
                modal.classList.add('hidden');
                (document.getElementById(modalId.replace('modal-', 'form-')) as HTMLFormElement)?.reset();
            }, 300);
        }
    };

    document.getElementById('btn-close-invoice')?.addEventListener('click', () => closeModal('modal-invoice'));
    document.getElementById('btn-cancel-invoice')?.addEventListener('click', () => closeModal('modal-invoice'));
    
    document.getElementById('btn-close-pay')?.addEventListener('click', () => closeModal('modal-pay'));
    document.getElementById('btn-cancel-pay')?.addEventListener('click', () => closeModal('modal-pay'));

    // Invoice Form Submit
    document.getElementById('form-invoice')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target as HTMLFormElement);
        const payload = Object.fromEntries(fd.entries());
        payload.id_po_header = parseInt(payload.id_po_header as string, 10) as any;
        payload.id_penerimaan = parseInt(payload.id_penerimaan as string, 10) as any;
        payload.total_tagihan = parseFloat(payload.total_tagihan as string) as any;

        const btn = document.getElementById('btn-submit-invoice') as HTMLButtonElement;
        const spinner = document.getElementById('spinner-invoice');
        if(btn) btn.disabled = true;
        if(spinner) spinner.classList.remove('hidden');

        try {
            const res = await apiFetch<any>('finance/ap/invoice', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            if (res.success) {
                showToast(res.message);
                closeModal('modal-invoice');
                loadPendingReceipts();
                loadInvoices();
            } else {
                showToast(res.message, true);
            }
        } catch (err) {
            showToast('Gagal memproses pembuatan tagihan.', true);
        } finally {
            if(btn) btn.disabled = false;
            if(spinner) spinner.classList.add('hidden');
        }
    });

    // Pay Form Submit
    document.getElementById('form-pay')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target as HTMLFormElement);
        const payload = Object.fromEntries(fd.entries());
        payload.id_tagihan = parseInt(payload.id_tagihan as string, 10) as any;
        payload.nominal_bayar = parseFloat(payload.nominal_bayar as string) as any;

        const btn = document.getElementById('btn-submit-pay') as HTMLButtonElement;
        const spinner = document.getElementById('spinner-pay');
        if(btn) btn.disabled = true;
        if(spinner) spinner.classList.remove('hidden');

        try {
            const res = await apiFetch<any>('finance/ap/pay', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            if (res.success) {
                showToast(res.message);
                closeModal('modal-pay');
                loadInvoices();
                loadJurnal(); // Jurnal Kas might update
            } else {
                showToast(res.message, true);
            }
        } catch (err) {
            showToast('Gagal memproses pembayaran.', true);
        } finally {
            if(btn) btn.disabled = false;
            if(spinner) spinner.classList.add('hidden');
        }
    });
}

