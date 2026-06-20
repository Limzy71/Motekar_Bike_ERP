/**
 * pengadaan.ts — Logic untuk halaman Daftar PR.
 * Migrasi dari: Motekar_ERP/frontend/script.js (tab-pengadaan logic)
 */

import { apiFetch, getUserData } from '../api.js';
import { initRBAC, showToast } from '../components/rbac.js';

interface PurchaseRequisition {
  id: number;
  nomor_pr: string;
  item_barang: string;
  jumlah: number;
  satuan: string;
  vendor: string;
  status_pr: string;
}

interface PRResponse {
  success: boolean;
  data: PurchaseRequisition[];
  message?: string;
}

interface ActionResponse {
  success: boolean;
  message: string;
}

let deleteId: number | null = null;

// ============================================================
// LOAD DATA
// ============================================================

async function loadPengadaan(): Promise<void> {
  const tbody = document.getElementById('tbody-pengadaan');
  if (!tbody) return;

  try {
    const response = await apiFetch<PRResponse>('pengadaan');

    if (response.success) {
      tbody.innerHTML = '';
      if (response.data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-sm text-on-surface-variant">Belum ada data PR.</td></tr>`;
        return;
      }

      response.data.forEach(pr => {
        let statusBadge = '';
        if (pr.status_pr === 'Menunggu Persetujuan') {
          statusBadge = `<span class="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide border bg-amber-50 text-amber-700 border-amber-200/80">Menunggu</span>`;
        } else if (pr.status_pr === 'Diproses Vendor') {
          statusBadge = `<span class="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide border bg-blue-50 text-blue-700 border-blue-200/80">Diproses Vendor</span>`;
        } else if (pr.status_pr === 'Selesai') {
          statusBadge = `<span class="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide border bg-emerald-50 text-emerald-700 border-emerald-200/80">Selesai</span>`;
        } else {
          statusBadge = `<span class="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide border bg-slate-50 text-slate-500 border-slate-200">${pr.status_pr}</span>`;
        }

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/50 transition-colors duration-150 border-b border-slate-100 text-xs font-medium text-slate-600 last:border-b-0 group';
        tr.innerHTML = `
            <td class="px-4 py-3">
                <p class="font-semibold text-slate-900">${pr.nomor_pr}</p>
            </td>
            <td class="px-4 py-3">
                <p>${pr.item_barang}</p>
            </td>
            <td class="px-4 py-3">
                <p>${pr.jumlah} ${pr.satuan}</p>
            </td>
            <td class="px-4 py-3">
                <p>${pr.vendor}</p>
            </td>
            <td class="px-4 py-3">
                ${statusBadge}
            </td>
            <td class="px-4 py-3 text-center">
                <div class="flex items-center justify-center gap-1 transition-opacity">
                    ${pr.status_pr === 'Menunggu Persetujuan' ? `
                        <button class="p-1 text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-all" title="Setujui PR" onclick="window.approvePR(${pr.id})">
                            <span class="material-symbols-outlined text-[18px]">check</span>
                        </button>
                    ` : ''}
                    <button class="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all" title="Hapus PR" onclick="window.confirmDeletePR(${pr.id})">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-sm text-error">Gagal memuat data: ${response.message}</td></tr>`;
      showToast(response.message || 'Gagal memuat data PR', true);
    }
  } catch (err) {
    console.error('loadPengadaan error:', err);
    tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-sm text-error">Terjadi kesalahan koneksi jaringan.</td></tr>`;
    showToast('Terjadi kesalahan jaringan.', true);
  }
}

// ============================================================
// ACTIONS
// ============================================================

// Expose functions to global window object so inline onclick handlers can reach them
declare global {
  interface Window {
    approvePR: (id: number) => void;
    confirmDeletePR: (id: number) => void;
  }
}

window.approvePR = async (id: number) => {
  try {
    const response = await apiFetch<ActionResponse>(`pengadaan/${id}/approve`, {
      method: 'PATCH'
    });
    if (response.success) {
      showToast(response.message);
      loadPengadaan();
    } else {
      showToast(response.message, true);
    }
  } catch (err) {
    showToast('Gagal menyetujui PR.', true);
  }
};

window.confirmDeletePR = (id: number) => {
  deleteId = id;
  const modal = document.getElementById('confirm-modal');
  const modalBox = document.getElementById('confirm-modal-box');
  if (modal && modalBox) {
    modal.classList.remove('hidden');
    // slight delay to allow display:block to apply before animating opacity
    setTimeout(() => {
      modal.classList.remove('opacity-0');
      modalBox.classList.remove('scale-95');
    }, 10);
  }
};

function closeConfirmModal() {
  deleteId = null;
  const modal = document.getElementById('confirm-modal');
  const modalBox = document.getElementById('confirm-modal-box');
  if (modal && modalBox) {
    modal.classList.add('opacity-0');
    modalBox.classList.add('scale-95');
    setTimeout(() => {
      modal.classList.add('hidden');
    }, 300);
  }
}

async function proceedDeletePR() {
  if (deleteId === null) return;
  
  const id = deleteId;
  closeConfirmModal();

  try {
    const response = await apiFetch<ActionResponse>(`pengadaan/${id}`, {
      method: 'DELETE'
    });
    if (response.success) {
      showToast(response.message);
      loadPengadaan();
    } else {
      showToast(response.message, true);
    }
  } catch (err) {
    showToast('Gagal menghapus PR.', true);
  }
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const user = initRBAC('nav-pengadaan');
  if (!user) return;

  loadPengadaan();

  const btnConfirmNo = document.getElementById('confirm-no');
  const btnConfirmYes = document.getElementById('confirm-yes');

  if (btnConfirmNo) btnConfirmNo.addEventListener('click', closeConfirmModal);
  if (btnConfirmYes) btnConfirmYes.addEventListener('click', proceedDeletePR);
});
