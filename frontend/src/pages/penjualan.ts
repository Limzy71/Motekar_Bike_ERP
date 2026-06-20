/**
 * penjualan.ts — Logic untuk halaman Penjualan & Penagihan (O2C & Soft Allocation).
 * Memenuhi spesifikasi Motekar Enterprise Design System (MEDS).
 */

import { apiFetch } from '../api.js';
import { initRBAC, showToast } from '../components/rbac.js';

interface SalesOrder {
    id: number;
    no_so: string;
    nama_customer: string;
    kode_sepeda: string;
    qty: number;
    total_harga: string | number;
    tanggal_order: string;
    status: 'Draft' | 'Confirmed' | 'Shipped';
}

interface SOResponse {
    success: boolean;
    data: SalesOrder[];
    message?: string;
}

interface GudangStok {
    id: number;
    kode_barang: string;
    nama_barang: string;
    stok_available: number;
}

interface StokResponse {
    success: boolean;
    data: GudangStok[];
    message?: string;
}

interface ActionResponse {
    success: boolean;
    message: string;
}

let masterSO: SalesOrder[] = [];
let masterStok: GudangStok[] = [];

// ============================================================
// DATA FETCHING & RENDERING
// ============================================================

async function loadSO(): Promise<void> {
    const tbody = document.getElementById('tbody-penjualan');
    if (!tbody) return;

    try {
        const response = await apiFetch<SOResponse>('penjualan');
        
        if (response.success) {
            masterSO = response.data;
            renderData();
        } else {
            tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-rose-600">Gagal memuat data: ${response.message}</td></tr>`;
            showToast(response.message || 'Gagal memuat data', true);
        }
    } catch (err) {
        console.error('loadSO error:', err);
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-rose-600">Terjadi kesalahan koneksi jaringan.</td></tr>`;
        showToast('Terjadi kesalahan jaringan.', true);
    }
}

async function loadDropdownStok(): Promise<void> {
    const select = document.getElementById('select-sepeda') as HTMLSelectElement;
    if (!select) return;

    try {
        const response = await apiFetch<StokResponse>('gudang');
        if (response.success) {
            masterStok = response.data;
            select.innerHTML = '<option value="">-- Pilih Produk Sepeda --</option>';
            
            masterStok.forEach(stok => {
                const option = document.createElement('option');
                option.value = stok.kode_barang;
                // Hanya disable jika stok benar-benar 0 atau kurang
                if (stok.stok_available <= 0) {
                    option.disabled = true;
                    option.textContent = `[${stok.kode_barang}] ${stok.nama_barang} - (HABIS)`;
                } else {
                    option.textContent = `[${stok.kode_barang}] ${stok.nama_barang} - (Tersedia: ${stok.stok_available} unit)`;
                }
                select.appendChild(option);
            });
        }
    } catch (err) {
        console.error('loadDropdownStok error:', err);
        select.innerHTML = '<option value="">Gagal memuat data gudang</option>';
    }
}

function formatRupiah(angka: number | string): string {
    const num = typeof angka === 'string' ? parseFloat(angka) : angka;
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);
}

function renderData(): void {
    const tbody = document.getElementById('tbody-penjualan');
    if (!tbody) return;

    // Hitung KPI
    const activeSO = masterSO.filter(so => so.status === 'Draft' || so.status === 'Confirmed').length;
    
    let terkunciQty = 0;
    let omsetShipped = 0;

    masterSO.forEach(so => {
        if (so.status === 'Confirmed') {
            terkunciQty += so.qty;
        } else if (so.status === 'Shipped') {
            omsetShipped += (typeof so.total_harga === 'string' ? parseFloat(so.total_harga) : so.total_harga);
        }
    });

    // Update UI KPI
    const kpiAktif = document.getElementById('kpi-aktif');
    const kpiTerkunci = document.getElementById('kpi-terkunci');
    const kpiOmset = document.getElementById('kpi-omset');

    if (kpiAktif) kpiAktif.textContent = activeSO.toString();
    if (kpiTerkunci) kpiTerkunci.textContent = terkunciQty.toString();
    if (kpiOmset) kpiOmset.textContent = formatRupiah(omsetShipped);

    tbody.innerHTML = '';

    if (masterSO.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-slate-500">Belum ada data Sales Order.</td></tr>`;
        return;
    }

    masterSO.forEach(so => {
        const d = new Date(so.tanggal_order);
        const dateStr = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/50 transition-colors duration-150 border-b border-slate-100 text-xs font-medium text-slate-600 last:border-b-0 group';
        
        let badgeHTML = '';
        let actionHTML = '';

        if (so.status === 'Draft') {
            badgeHTML = `<span class="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide border bg-slate-50 text-slate-700 border-slate-200/80">Draft</span>`;
            actionHTML = `
                <button class="btn-action btn-confirm text-amber-600 hover:text-white hover:bg-amber-600 px-3 py-1.5 rounded-md transition-all font-bold tracking-wide flex items-center justify-center gap-1 w-full border border-amber-200 hover:border-amber-600" data-id="${so.id}">
                    <span class="material-symbols-outlined text-[16px] icon-action">lock</span> <span class="text-action">Konfirmasi SO</span>
                </button>
            `;
        } else if (so.status === 'Confirmed') {
            badgeHTML = `<span class="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide border bg-amber-50 text-amber-700 border-amber-200/80">Confirmed</span>`;
            actionHTML = `
                <button class="btn-action btn-ship text-emerald-600 hover:text-white hover:bg-emerald-600 px-3 py-1.5 rounded-md transition-all font-bold tracking-wide flex items-center justify-center gap-1 w-full border border-emerald-200 hover:border-emerald-600" data-id="${so.id}">
                    <span class="material-symbols-outlined text-[16px] icon-action">local_shipping</span> <span class="text-action">Kirim Unit</span>
                </button>
            `;
        } else if (so.status === 'Shipped') {
            badgeHTML = `<span class="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide border bg-emerald-50 text-emerald-700 border-emerald-200/80">Shipped</span>`;
            actionHTML = `<span class="text-slate-400 italic font-semibold">Terdistribusi</span>`;
        }

        tr.innerHTML = `
            <td class="px-4 py-3">
                <p>${dateStr}</p>
            </td>
            <td class="px-4 py-3">
                <p class="font-bold text-slate-900 font-data-mono">${so.no_so}</p>
                <p class="text-[11px] text-slate-500 mt-0.5">${so.nama_customer}</p>
            </td>
            <td class="px-4 py-3">
                <p class="font-bold text-slate-700">${so.kode_sepeda}</p>
                <p class="text-[11px] text-slate-500 mt-0.5">${so.qty} Unit</p>
            </td>
            <td class="px-4 py-3 text-right">
                <p class="font-bold text-slate-900">${formatRupiah(so.total_harga)}</p>
            </td>
            <td class="px-4 py-3 text-center">
                ${badgeHTML}
            </td>
            <td class="px-4 py-3 text-center">
                ${actionHTML}
            </td>
        `;

        // Event Listeners for Actions
        if (so.status === 'Draft') {
            tr.querySelector('.btn-confirm')?.addEventListener('click', (e) => handleAction(e, so.id, 'confirm'));
        } else if (so.status === 'Confirmed') {
            tr.querySelector('.btn-ship')?.addEventListener('click', (e) => handleAction(e, so.id, 'ship'));
        }

        tbody.appendChild(tr);
    });
}

// ============================================================
// ACTION HANDLER (CONFIRM & SHIP)
// ============================================================

async function handleAction(e: Event, soId: number, action: 'confirm' | 'ship'): Promise<void> {
    const btn = e.currentTarget as HTMLButtonElement;
    
    // Disable button to prevent double-click
    if (btn.disabled) return;
    btn.disabled = true;
    
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span class="material-symbols-outlined text-[16px] animate-spin">sync</span> Memproses...`;
    btn.classList.add('opacity-80', 'cursor-wait');

    try {
        const response = await apiFetch<ActionResponse>(`penjualan/${soId}/${action}`, {
            method: 'PATCH'
        });

        if (response.success) {
            showToast(response.message);
            // Reload SO and Stock silently to update UI
            await Promise.all([loadSO(), loadDropdownStok()]);
        } else {
            showToast(response.message, true);
            // Restore button if failed
            btn.disabled = false;
            btn.innerHTML = originalText;
            btn.classList.remove('opacity-80', 'cursor-wait');
        }
    } catch (err) {
        showToast('Terjadi kesalahan jaringan saat memproses.', true);
        btn.disabled = false;
        btn.innerHTML = originalText;
        btn.classList.remove('opacity-80', 'cursor-wait');
    }
}

// ============================================================
// MODAL & FORM LOGIC
// ============================================================

function setupModalLogic(): void {
    const modal = document.getElementById('modal-so');
    const modalContent = document.getElementById('modal-so-content');
    const btnCreate = document.getElementById('btn-create-so');
    const btnClose = document.getElementById('btn-close-modal');
    const btnCancel = document.getElementById('btn-cancel-modal');
    const form = document.getElementById('form-so') as HTMLFormElement;

    const openModal = () => {
        if (modal && modalContent) {
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                modalContent.classList.remove('scale-95');
            }, 10);
        }
    };

    const closeModal = () => {
        if (modal && modalContent) {
            modal.classList.add('opacity-0');
            modalContent.classList.add('scale-95');
            setTimeout(() => {
                modal.classList.add('hidden');
                form?.reset();
            }, 300);
        }
    };

    btnCreate?.addEventListener('click', openModal);
    btnClose?.addEventListener('click', closeModal);
    btnCancel?.addEventListener('click', closeModal);

    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Form Submit (POST /api/penjualan)
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btnSubmit = document.getElementById('btn-submit-so') as HTMLButtonElement;
        const spinner = document.getElementById('spinner-so');
        const textSubmit = document.getElementById('text-submit-so');
        
        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());

        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.classList.add('opacity-80', 'cursor-wait');
        }
        if (spinner) spinner.classList.remove('hidden');
        if (textSubmit) textSubmit.textContent = 'Menyimpan...';

        try {
            const response = await apiFetch<ActionResponse>('penjualan', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (response.success) {
                showToast(response.message);
                closeModal();
                loadSO(); // Refresh data table
            } else {
                showToast(response.message, true);
            }
        } catch (err) {
            showToast('Terjadi kesalahan saat menyimpan SO.', true);
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.classList.remove('opacity-80', 'cursor-wait');
            }
            if (spinner) spinner.classList.add('hidden');
            if (textSubmit) textSubmit.textContent = 'Simpan Draft SO';
        }
    });
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    const user = initRBAC('nav-penjualan');
    if (!user) return;

    setupModalLogic();
    loadDropdownStok();
    loadSO();

    // Setup Refresh Button
    const btnRefresh = document.getElementById('btn-refresh');
    btnRefresh?.addEventListener('click', () => {
        loadSO();
        loadDropdownStok();
    });
});
