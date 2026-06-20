/**
 * mutu.ts — Logic untuk halaman Kendali Mutu (QC Inspeksi ISO 4210).
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
    catatan_rework?: string;
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

let masterWO: WorkOrder[] = [];

// ============================================================
// DATA FETCHING & RENDERING
// ============================================================

async function loadQCQueue(): Promise<void> {
    const tbody = document.getElementById('tbody-mutu');
    if (!tbody) return;

    try {
        const response = await apiFetch<WOResponse>('operasi/wo');
        
        if (response.success) {
            masterWO = response.data;
            renderData();
        } else {
            tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-rose-600">Gagal memuat data: ${response.message}</td></tr>`;
            showToast(response.message || 'Gagal memuat data', true);
        }
    } catch (err) {
        console.error('loadQC error:', err);
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-rose-600">Terjadi kesalahan koneksi jaringan.</td></tr>`;
        showToast('Terjadi kesalahan jaringan.', true);
    }
}

function renderData(): void {
    const tbody = document.getElementById('tbody-mutu');
    if (!tbody) return;

    // Filter sisi klien sesuai instruksi
    const queueSelesai = masterWO.filter(wo => wo.status === 'Selesai');
    const countPassed = masterWO.filter(wo => wo.status === 'Closed').length;
    
    // Perlu Rework = WO yang memiliki catatan_rework dan statusnya masih belum Closed
    const countFailed = masterWO.filter(wo => wo.catatan_rework && wo.status !== 'Closed').length;

    // Update KPI
    const kpiAntrean = document.getElementById('kpi-antrean');
    const kpiPassed = document.getElementById('kpi-passed');
    const kpiFailed = document.getElementById('kpi-failed');

    if (kpiAntrean) kpiAntrean.textContent = queueSelesai.length.toString();
    if (kpiPassed) kpiPassed.textContent = countPassed.toString();
    if (kpiFailed) kpiFailed.textContent = countFailed.toString();

    tbody.innerHTML = '';

    if (queueSelesai.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-slate-500">Tidak ada antrean Work Order yang menunggu inspeksi QC.</td></tr>`;
        return;
    }

    queueSelesai.forEach(wo => {
        // Tanggal Selesai Rakit (menggunakan updated_at atau dummy jika tidak ada)
        const d = new Date(wo.created_at);
        const dateStr = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/50 transition-colors duration-150 border-b border-slate-100 text-xs font-medium text-slate-600 last:border-b-0 group';
        tr.innerHTML = `
            <td class="px-4 py-3">
                <p class="font-semibold text-slate-900 font-data-mono">${wo.nomor_wo}</p>
            </td>
            <td class="px-4 py-3">
                <p class="font-bold text-slate-700">${wo.nama_sepeda || wo.kode_sepeda}</p>
            </td>
            <td class="px-4 py-3">
                <p class="font-bold text-slate-900">${wo.jumlah_produksi} Unit</p>
            </td>
            <td class="px-4 py-3">
                <p>${dateStr}</p>
            </td>
            <td class="px-4 py-3">
                <span class="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide border bg-amber-50 text-amber-700 border-amber-200/80">Menunggu QC</span>
            </td>
            <td class="px-4 py-3 text-center">
                <button class="btn-inspeksi text-slate-400 hover:text-primary hover:bg-primary-container/30 px-3 py-1.5 rounded-md transition-all font-bold tracking-wide flex items-center justify-center gap-1.5 w-full border border-transparent hover:border-primary/20" data-id="${wo.id}">
                    <span class="material-symbols-outlined text-[16px]">search</span> Inspeksi
                </button>
            </td>
        `;

        const btn = tr.querySelector('.btn-inspeksi');
        btn?.addEventListener('click', () => openQCModal(wo));

        tbody.appendChild(tr);
    });
}

// ============================================================
// MODAL & FORM LOGIC
// ============================================================

function setupModalLogic(): void {
    const modal = document.getElementById('modal-qc');
    const modalContent = document.getElementById('modal-qc-content');
    const btnClose = document.getElementById('btn-close-modal');
    const btnCancel = document.getElementById('btn-cancel-modal');
    const form = document.getElementById('form-qc') as HTMLFormElement;
    
    const radios = document.querySelectorAll('input[type="radio"]');
    const reworkContainer = document.getElementById('rework-container');
    const inputDefect = document.getElementById('input-defect') as HTMLTextAreaElement;

    const closeModal = () => {
        if (modal && modalContent) {
            modal.classList.add('opacity-0');
            modalContent.classList.add('scale-95');
            setTimeout(() => {
                modal.classList.add('hidden');
                form?.reset();
                if (reworkContainer) reworkContainer.classList.add('hidden');
                if (inputDefect) inputDefect.required = false;
            }, 300);
        }
    };

    btnClose?.addEventListener('click', closeModal);
    btnCancel?.addEventListener('click', closeModal);

    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Validasi Checklist Dinamis (Memunculkan form Rework jika ada Fail)
    radios.forEach(radio => {
        radio.addEventListener('change', () => {
            const formData = new FormData(form);
            let hasFail = false;
            for (let i = 1; i <= 5; i++) {
                if (formData.get(`chk_${i}`) === 'Fail') {
                    hasFail = true;
                    break;
                }
            }

            if (hasFail) {
                if (reworkContainer) reworkContainer.classList.remove('hidden');
                if (inputDefect) inputDefect.required = true;
            } else {
                if (reworkContainer) reworkContainer.classList.add('hidden');
                if (inputDefect) inputDefect.required = false;
            }
        });
    });

    // Form Submit (POST /api/mutu/inspeksi)
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btnSubmit = document.getElementById('btn-submit-qc') as HTMLButtonElement;
        const spinner = document.getElementById('spinner-qc');
        const textSubmit = document.getElementById('text-submit-qc');
        
        const formData = new FormData(form);
        const woId = formData.get('wo_id');
        const defectNotes = formData.get('defectNotes')?.toString() || '';

        // Tentukan hasil (Jika ada SATU SAJA yang Fail, maka result = Fail)
        let finalResult = 'Pass';
        for (let i = 1; i <= 5; i++) {
            if (formData.get(`chk_${i}`) === 'Fail') {
                finalResult = 'Fail';
                break;
            }
        }

        // Double cek client-side validation
        if (finalResult === 'Fail' && defectNotes.trim() === '') {
            showToast('Catatan defect wajib diisi karena ada parameter yang Gagal QC!', true);
            return;
        }

        const payload = {
            id: woId,
            result: finalResult,
            defectNotes: defectNotes
        };

        // Loading State
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.classList.add('opacity-80', 'cursor-wait');
        }
        if (spinner) spinner.classList.remove('hidden');
        if (textSubmit) textSubmit.textContent = 'Memproses...';

        try {
            const response = await apiFetch<ActionResponse>('mutu/inspeksi', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (response.success) {
                showToast(response.message);
                closeModal();
                loadQCQueue(); // Re-render tabel
            } else {
                showToast(response.message, true);
            }
        } catch (err) {
            showToast('Terjadi kesalahan saat memproses hasil inspeksi.', true);
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.classList.remove('opacity-80', 'cursor-wait');
            }
            if (spinner) spinner.classList.add('hidden');
            if (textSubmit) textSubmit.textContent = 'Submit Hasil QC';
        }
    });

    // Expose close to window for manual calls if needed
    (window as any).closeQCModal = closeModal;
}

function openQCModal(wo: WorkOrder): void {
    const modal = document.getElementById('modal-qc');
    const modalContent = document.getElementById('modal-qc-content');
    
    // Set Data
    const woNumLabel = document.getElementById('modal-wo-number');
    const summaryLabel = document.getElementById('modal-wo-summary');
    const inputWoId = document.getElementById('input-wo-id') as HTMLInputElement;

    if (woNumLabel) woNumLabel.textContent = wo.nomor_wo;
    if (summaryLabel) summaryLabel.innerHTML = `Mengevaluasi <strong>${wo.jumlah_produksi} Unit</strong> sepeda model <strong>${wo.nama_sepeda || wo.kode_sepeda}</strong>.`;
    if (inputWoId) inputWoId.value = wo.id.toString();

    // Reset UI State
    const form = document.getElementById('form-qc') as HTMLFormElement;
    form?.reset();
    const reworkContainer = document.getElementById('rework-container');
    const inputDefect = document.getElementById('input-defect') as HTMLTextAreaElement;
    if (reworkContainer) reworkContainer.classList.add('hidden');
    if (inputDefect) inputDefect.required = false;

    // Show Modal
    if (modal && modalContent) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modalContent.classList.remove('scale-95');
        }, 10);
    }
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    const user = initRBAC('nav-mutu');
    if (!user) return;

    setupModalLogic();
    loadQCQueue();

    // Setup Refresh Button
    const btnRefresh = document.getElementById('btn-refresh');
    btnRefresh?.addEventListener('click', () => {
        loadQCQueue();
    });
});
