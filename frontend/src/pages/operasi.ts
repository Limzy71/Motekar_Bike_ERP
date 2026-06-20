/**
 * operasi.ts — Logic untuk halaman Operasi Inti (Papan Kanban).
 * Memenuhi spesifikasi Motekar Enterprise Design System (MEDS).
 */

import { apiFetch } from '../api.js';
import { initRBAC, showToast } from '../components/rbac.js';

interface WorkOrder {
    id: number;
    nomor_wo: string;
    kode_sepeda: string;
    jumlah_produksi: number;
    status: string;
    nama_sepeda: string;
    created_at: string;
}

interface WOResponse {
    success: boolean;
    data: WorkOrder[];
    message?: string;
}

interface ActionResponse {
    success: boolean;
    message: string;
}

interface InventoryItem {
    kode_barang: string;
    nama_barang: string;
    kategori: string;
}

interface GudangResponse {
    success: boolean;
    data: InventoryItem[];
}

let masterWO: WorkOrder[] = [];

// ============================================================
// SETUP & FETCHING
// ============================================================

async function loadOptions(): Promise<void> {
    try {
        const response = await apiFetch<GudangResponse>('gudang');
        if (response.success) {
            const sepedaJadi = response.data.filter(item => item.kategori === 'Sepeda Jadi');
            const selectKode = document.getElementById('input-kode-sepeda') as HTMLSelectElement;
            if (selectKode) {
                sepedaJadi.forEach(item => {
                    const opt = document.createElement('option');
                    opt.value = item.kode_barang;
                    opt.textContent = `${item.kode_barang} - ${item.nama_barang}`;
                    selectKode.appendChild(opt);
                });
            }
        }
    } catch (err) {
        console.error('Failed to load options', err);
    }
}

async function loadWO(): Promise<void> {
    try {
        const response = await apiFetch<WOResponse>('operasi/wo');
        if (response.success) {
            masterWO = response.data;
            renderKanban();
        } else {
            showToast(response.message || 'Gagal memuat data Work Order', true);
        }
    } catch (err) {
        showToast('Terjadi kesalahan jaringan.', true);
    }
}

// ============================================================
// RENDER KANBAN
// ============================================================

function renderKanban(): void {
    const colMenunggu = document.getElementById('col-menunggu');
    const colPerakitan = document.getElementById('col-perakitan-frame');
    const colSetup = document.getElementById('col-setup-drivetrain');
    const colSelesai = document.getElementById('col-selesai');

    const countMenunggu = document.getElementById('count-menunggu');
    const countPerakitan = document.getElementById('count-perakitan-frame');
    const countSetup = document.getElementById('count-setup-drivetrain');
    const countSelesai = document.getElementById('count-selesai');

    if (!colMenunggu || !colPerakitan || !colSetup || !colSelesai) return;

    // Reset Columns
    colMenunggu.innerHTML = '';
    colPerakitan.innerHTML = '';
    colSetup.innerHTML = '';
    colSelesai.innerHTML = '';

    const categorized = {
        'Menunggu': [] as WorkOrder[],
        'Perakitan Frame': [] as WorkOrder[],
        'Setup Drivetrain': [] as WorkOrder[],
        'Selesai': [] as WorkOrder[]
    };

    masterWO.forEach(wo => {
        if (categorized[wo.status as keyof typeof categorized]) {
            categorized[wo.status as keyof typeof categorized].push(wo);
        }
    });

    if (countMenunggu) countMenunggu.textContent = categorized['Menunggu'].length.toString();
    if (countPerakitan) countPerakitan.textContent = categorized['Perakitan Frame'].length.toString();
    if (countSetup) countSetup.textContent = categorized['Setup Drivetrain'].length.toString();
    if (countSelesai) countSelesai.textContent = categorized['Selesai'].length.toString();

    const emptyStateHTML = `
        <div class="h-full flex items-center justify-center py-6">
            <p class="text-[11px] font-medium text-slate-400 italic">Tidak ada antrean di tahap ini</p>
        </div>
    `;

    const nextStatusMap: Record<string, string> = {
        'Menunggu': 'Perakitan Frame',
        'Perakitan Frame': 'Setup Drivetrain',
        'Setup Drivetrain': 'Selesai'
    };

    const createCard = (wo: WorkOrder) => {
        const card = document.createElement('div');
        card.className = 'bg-white border border-slate-200 shadow-sm rounded-lg p-4 shrink-0 hover:shadow-md transition-shadow group flex flex-col mb-3';
        
        let actionHTML = '';
        if (wo.status !== 'Selesai') {
            const nextStatus = nextStatusMap[wo.status];
            actionHTML = `
                <div class="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                    <button class="btn-lanjut flex items-center gap-1.5 text-[11px] font-bold text-primary hover:text-primary-container transition-colors" data-id="${wo.id}" data-next="${nextStatus}">
                        Lanjut ke ${nextStatus} <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
                    </button>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="flex justify-between items-start mb-1">
                <span class="font-bold text-slate-900 text-xs font-data-mono">${wo.nomor_wo}</span>
            </div>
            <h4 class="text-sm font-semibold text-slate-700 leading-tight">${wo.nama_sepeda || wo.kode_sepeda}</h4>
            <p class="text-xs text-slate-500 mt-1">Target Produksi: <span class="font-bold text-slate-700">${wo.jumlah_produksi} Unit</span></p>
            ${actionHTML}
        `;

        if (wo.status !== 'Selesai') {
            const btn = card.querySelector('.btn-lanjut') as HTMLButtonElement;
            btn.addEventListener('click', async (e) => {
                const target = e.currentTarget as HTMLButtonElement;
                const id = target.getAttribute('data-id');
                const nextStatus = target.getAttribute('data-next');

                if (!id || !nextStatus) return;

                // Proteksi Double Click
                target.disabled = true;
                target.classList.add('opacity-50', 'cursor-not-allowed');
                target.innerHTML = `Memproses... <span class="material-symbols-outlined text-[14px] animate-spin">sync</span>`;

                try {
                    const response = await apiFetch<ActionResponse>(`operasi/wo/${id}/move`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: nextStatus })
                    });

                    if (response.success) {
                        showToast(response.message);
                        // Update locally and re-render
                        const index = masterWO.findIndex(w => w.id === parseInt(id));
                        if (index !== -1) {
                            masterWO[index].status = nextStatus;
                            renderKanban();
                        }
                    } else {
                        showToast(response.message, true);
                        target.disabled = false;
                        target.classList.remove('opacity-50', 'cursor-not-allowed');
                        target.innerHTML = `Lanjut ke ${nextStatus} <span class="material-symbols-outlined text-[14px]">arrow_forward</span>`;
                    }
                } catch (err) {
                    showToast('Gagal memindahkan Work Order.', true);
                    target.disabled = false;
                    target.classList.remove('opacity-50', 'cursor-not-allowed');
                    target.innerHTML = `Lanjut ke ${nextStatus} <span class="material-symbols-outlined text-[14px]">arrow_forward</span>`;
                }
            });
        }

        return card;
    };

    if (categorized['Menunggu'].length === 0) colMenunggu.innerHTML = emptyStateHTML;
    else categorized['Menunggu'].forEach(wo => colMenunggu.appendChild(createCard(wo)));

    if (categorized['Perakitan Frame'].length === 0) colPerakitan.innerHTML = emptyStateHTML;
    else categorized['Perakitan Frame'].forEach(wo => colPerakitan.appendChild(createCard(wo)));

    if (categorized['Setup Drivetrain'].length === 0) colSetup.innerHTML = emptyStateHTML;
    else categorized['Setup Drivetrain'].forEach(wo => colSetup.appendChild(createCard(wo)));

    if (categorized['Selesai'].length === 0) colSelesai.innerHTML = emptyStateHTML;
    else categorized['Selesai'].forEach(wo => colSelesai.appendChild(createCard(wo)));
}

// ============================================================
// MODAL & FORM HANDLERS
// ============================================================

function setupModal(): void {
    const modal = document.getElementById('modal-wo');
    const modalContent = document.getElementById('modal-wo-content');
    const btnOpen = document.getElementById('btn-open-modal-wo');
    const btnClose = document.getElementById('btn-close-modal');
    const btnCancel = document.getElementById('btn-cancel-modal');
    const form = document.getElementById('form-wo') as HTMLFormElement;

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

    btnOpen?.addEventListener('click', () => {
        if (modal && modalContent) {
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                modalContent.classList.remove('scale-95');
            }, 10);
        }
    });

    btnClose?.addEventListener('click', closeModal);
    btnCancel?.addEventListener('click', closeModal);

    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btnSubmit = document.getElementById('btn-submit-wo') as HTMLButtonElement;
        const spinner = document.getElementById('spinner-wo');

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.classList.add('opacity-80', 'cursor-wait');
        }
        if (spinner) {
            spinner.classList.remove('hidden');
            spinner.classList.add('animate-spin');
        }

        try {
            const response = await apiFetch<ActionResponse>('operasi/wo', {
                method: 'POST',
                body: JSON.stringify(data)
            });

            if (response.success) {
                showToast(response.message);
                closeModal();
                loadWO(); // re-fetch the latest
            } else {
                showToast(response.message, true);
            }
        } catch (err) {
            showToast('Terjadi kesalahan saat membuat WO', true);
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.classList.remove('opacity-80', 'cursor-wait');
            }
            if (spinner) {
                spinner.classList.add('hidden');
                spinner.classList.remove('animate-spin');
            }
        }
    });
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    const user = initRBAC('nav-operasi');
    if (!user) return;

    loadOptions();
    loadWO();
    setupModal();
});
