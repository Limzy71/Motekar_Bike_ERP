/**
 * pengadaan.ts — Logic untuk halaman Daftar PR.
 * Migrasi dari: Motekar_ERP/frontend/script.js (tab-pengadaan logic)
 */

import { apiFetch, getUserData } from '../api.js';
import { initRBAC, showToast } from '../components/rbac.js';

interface PRItem {
  id_pr_header: number;
  kode_barang: string;
  jumlah: number;
  satuan: string;
  nama_barang: string;
}

interface PurchaseRequisition {
  id: number;
  nomor_pr: string;
  status_pr: string;
  created_at: string;
  nama_vendor: string;
  items: PRItem[];
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
let allPRData: PurchaseRequisition[] = [];
let confirmMode: 'delete_single' | 'delete_all' | 'approve_all' | null = null;

let currentPage = 1;
const itemsPerPage = 10;
let currentFilterPR = 'All';

const formatRupiah = (number: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
};

// ============================================================
// LOAD DATA
// ============================================================

async function loadPengadaan(): Promise<void> {
  const tbody = document.getElementById('tbody-pengadaan');
  if (!tbody) return;

  const btnApprove = document.getElementById('btn-bulk-approve-pr') as HTMLButtonElement | null;
  const btnDelete = document.getElementById('btn-bulk-delete-pr') as HTMLButtonElement | null;

  const user = getUserData();
  const role = user?.divisi_role;
  const isExecutive = role === 'Owner' || role === 'General Manager';
  const isStrict = role === 'Owner' || role === 'General Manager' || role === 'Pengadaan';

  try {
    const response = await apiFetch<PRResponse>('pengadaan');

    if (response.success) {
      allPRData = response.data;
      const waitingCount = allPRData.filter(pr => pr.status_pr === 'Menunggu Persetujuan').length;
      const totalCount = allPRData.length;

      const deletableCount = allPRData.filter(pr => pr.status_pr !== 'Diproses Vendor' && pr.status_pr !== 'Selesai').length;

      if (btnApprove) {
        if (waitingCount > 0 && isExecutive) {
          btnApprove.innerHTML = `<span class="material-symbols-outlined text-[16px]">done_all</span> Setujui Semua PR (${waitingCount})`;
          btnApprove.classList.remove('hidden');
          btnApprove.classList.add('flex');
        } else {
          btnApprove.classList.add('hidden');
          btnApprove.classList.remove('flex');
        }
      }

      if (btnDelete) {
        if (deletableCount > 0 && isStrict) {
          btnDelete.innerHTML = `<span class="material-symbols-outlined text-[16px]">delete_sweep</span> Hapus Semua PR (${deletableCount})`;
          btnDelete.classList.remove('hidden');
          btnDelete.classList.add('flex');
        } else {
          btnDelete.classList.add('hidden');
          btnDelete.classList.remove('flex');
        }
      }

      currentPage = 1; // Reset to page 1 on load
      renderTable();
    } else {
      if (btnApprove) { btnApprove.classList.add('hidden'); btnApprove.classList.remove('flex'); }
      if (btnDelete) { btnDelete.classList.add('hidden'); btnDelete.classList.remove('flex'); }
      tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-sm text-error">Gagal memuat data: ${response.message}</td></tr>`;
      showToast(response.message || 'Gagal memuat data PR', true);
    }
  } catch (err) {
    if (btnApprove) { btnApprove.classList.add('hidden'); btnApprove.classList.remove('flex'); }
    if (btnDelete) { btnDelete.classList.add('hidden'); btnDelete.classList.remove('flex'); }
    console.error('loadPengadaan error:', err);
    tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-sm text-error">Terjadi kesalahan koneksi jaringan.</td></tr>`;
    showToast('Terjadi kesalahan jaringan.', true);
  }
}

function renderTable() {
  const tbody = document.getElementById('tbody-pengadaan');
  if (!tbody) return;

  tbody.innerHTML = '';

  let filteredData = allPRData;
  if (currentFilterPR !== 'All') {
    filteredData = allPRData.filter(pr => pr.status_pr === currentFilterPR);
  }

  if (filteredData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-sm text-on-surface-variant">Belum ada data PR.</td></tr>`;
    updatePaginationUI();
    return;
  }

  // Calculate pagination indices
  const totalItems = filteredData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  
  // Ensure currentPage is within valid range
  if (currentPage < 1) currentPage = 1;
  if (currentPage > totalPages) currentPage = totalPages;

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const currentItems = filteredData.slice(startIndex, endIndex);

  currentItems.forEach(pr => {
    let statusBadge = '';
    if (pr.status_pr === 'Menunggu Persetujuan') {
      statusBadge = `<span class="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide border bg-amber-50 text-amber-700 border-amber-200/80">Menunggu Persetujuan</span>`;
    } else if (pr.status_pr === 'Diproses Vendor') {
      statusBadge = `<span class="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide border bg-blue-50 text-blue-700 border-blue-200/80">Diproses Vendor</span>`;
    } else if (pr.status_pr === 'Selesai') {
      statusBadge = `<span class="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide border bg-emerald-50 text-emerald-700 border-emerald-200/80">Selesai</span>`;
    } else {
      statusBadge = `<span class="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide border bg-slate-50 text-slate-500 border-slate-200">${pr.status_pr}</span>`;
    }

    const dateStr = pr.created_at ? new Date(pr.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
    
    let materialText = '-';
    let jumlahText = '-';
    let totalNilai = 0;
    
    if (pr.items && pr.items.length > 0) {
        const firstItem = pr.items[0];
        materialText = firstItem.nama_barang;
        jumlahText = `${firstItem.jumlah} ${firstItem.satuan}`;
        
        totalNilai = pr.items.reduce((sum: number, item: any) => {
            const harga = parseFloat(item.harga_standar || 0);
            return sum + (harga * parseInt(item.jumlah));
        }, 0);

        if (pr.items.length > 1) {
            materialText += ` <span class="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded ml-1 font-bold">+${pr.items.length - 1} lain</span>`;
            const totalQty = pr.items.reduce((sum: number, item: any) => sum + parseInt(item.jumlah), 0);
            jumlahText = `<span class="border-b border-dashed border-slate-400 cursor-help" title="Total dari ${pr.items.length} jenis material">${totalQty} items</span>`;
        }
    }

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50/50 transition-colors duration-150 text-xs font-medium text-slate-600 group cursor-pointer';
    tr.onclick = () => window.openRightDrawer(pr.id);
    tr.innerHTML = `
        <td class="px-4 py-3">
            <p class="font-bold text-blue-700 group-hover:underline">${pr.nomor_pr}</p>
        </td>
        <td class="px-4 py-3 text-slate-500 whitespace-nowrap">${dateStr}</td>
        <td class="px-4 py-3">
            <p class="font-semibold text-slate-800">${pr.nama_vendor}</p>
        </td>
        <td class="px-4 py-3">
            <p class="font-semibold text-slate-800">${materialText}</p>
        </td>
        <td class="px-4 py-3 text-right">
            <p class="font-data-mono font-bold text-slate-700">${jumlahText}</p>
        </td>
        <td class="px-4 py-3 text-right">
            <p class="font-data-mono font-bold text-slate-800">${formatRupiah(totalNilai)}</p>
        </td>
        <td class="px-4 py-3 text-center">
            ${statusBadge}
        </td>
    `;
    tbody.appendChild(tr);
  });

  updatePaginationUI(startIndex + 1, endIndex, totalItems, totalPages);
}

function updatePaginationUI(start = 0, end = 0, total = 0, totalPages = 0) {
    const infoText = document.getElementById('pr-pagination-info');
    const btnPrev = document.getElementById('pr-btn-prev') as HTMLButtonElement;
    const btnNext = document.getElementById('pr-btn-next') as HTMLButtonElement;
    const pagesContainer = document.getElementById('pr-pagination-pages');

    if (infoText) {
        if (total === 0) {
            infoText.textContent = `Menampilkan 0-0 dari 0 data`;
        } else {
            infoText.textContent = `Menampilkan ${start}-${end} dari ${total} data`;
        }
    }

    if (btnPrev) {
        btnPrev.disabled = currentPage <= 1;
        btnPrev.onclick = () => {
            if (currentPage > 1) {
                currentPage--;
                renderTable();
            }
        };
    }

    if (btnNext) {
        btnNext.disabled = currentPage >= totalPages;
        btnNext.onclick = () => {
            if (currentPage < totalPages) {
                currentPage++;
                renderTable();
            }
        };
    }

    if (pagesContainer) {
        pagesContainer.innerHTML = '';
        if (totalPages > 1) {
            // Logic to show page numbers
            const maxVisiblePages = 5;
            let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
            let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

            if (endPage - startPage + 1 < maxVisiblePages) {
                startPage = Math.max(1, endPage - maxVisiblePages + 1);
            }

            for (let i = startPage; i <= endPage; i++) {
                const btn = document.createElement('button');
                btn.className = `w-7 h-7 rounded-lg text-xs font-bold transition-colors ${i === currentPage ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`;
                btn.textContent = i.toString();
                btn.onclick = () => {
                    currentPage = i;
                    renderTable();
                };
                pagesContainer.appendChild(btn);
            }
        }
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
    openRightDrawer: (id: number) => void;
  }
}

window.openRightDrawer = (id: number) => {
  const pr = allPRData.find(p => p.id === id);
  if (!pr) return;

  const drawer = document.getElementById('right-drawer');
  const backdrop = document.getElementById('right-drawer-backdrop');
  if (!drawer || !backdrop) return;

  document.getElementById('drawer-pr-id')!.textContent = pr.nomor_pr;
  document.getElementById('drawer-pr-status')!.textContent = pr.status_pr;
  document.getElementById('drawer-vendor-name')!.textContent = pr.nama_vendor;

  const dot = document.getElementById('drawer-status-dot');
  if (dot) {
      dot.className = 'w-2 h-2 rounded-full';
      if (pr.status_pr === 'Menunggu Persetujuan') dot.classList.add('bg-amber-500');
      else if (pr.status_pr === 'Diproses Vendor') dot.classList.add('bg-blue-500');
      else if (pr.status_pr === 'Selesai') dot.classList.add('bg-emerald-500');
      else dot.classList.add('bg-slate-500');
  }

  const tbody = document.getElementById('drawer-items-list');
  const tfootTotal = document.getElementById('drawer-total-nilai');
  if (tbody && pr.items) {
      let totalNilai = 0;
      tbody.innerHTML = pr.items.map((item: any) => {
          const hargaSatuan = parseFloat(item.harga_standar || 0);
          const subtotal = hargaSatuan * item.jumlah;
          totalNilai += subtotal;
          
          return `
          <tr class="hover:bg-slate-50 transition-colors">
              <td class="py-3 px-3">
                  <p class="font-bold text-slate-800">${item.nama_barang}</p>
                  <p class="text-[10px] text-slate-500 font-data-mono mt-0.5">${item.kode_barang}</p>
              </td>
              <td class="py-3 px-3 text-right">
                  <span class="font-bold text-slate-800">${item.jumlah}</span>
                  <span class="text-slate-500 ml-1">${item.satuan}</span>
              </td>
              <td class="py-3 px-3 text-right">
                  <span class="font-data-mono text-slate-700">${formatRupiah(hargaSatuan)}</span>
              </td>
              <td class="py-3 px-3 text-right">
                  <span class="font-data-mono font-bold text-slate-900">${formatRupiah(subtotal)}</span>
              </td>
          </tr>
          `;
      }).join('');
      
      if (tfootTotal) tfootTotal.textContent = formatRupiah(totalNilai);
  } else if (tbody) {
      tbody.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-slate-500 italic">Tidak ada detail material</td></tr>';
      if (tfootTotal) tfootTotal.textContent = 'Rp 0';
  }

  const bay = document.getElementById('drawer-execution-bay');
  if (bay) {
      const user = getUserData();
      const role = user?.divisi_role;
      const isExecutive = role === 'Owner' || role === 'General Manager';

      let html = '';
      if (pr.status_pr === 'Menunggu Persetujuan') {
          if (isExecutive) {
              html = `
                  <button onclick="window.approvePR(${pr.id})" class="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-sm hover:bg-emerald-700 transition-all flex items-center justify-center gap-2">
                      <span class="material-symbols-outlined text-[18px]">check_circle</span> Setujui Permintaan
                  </button>
              `;
          } else {
              html = `
                  <div class="w-full flex items-center gap-3 p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-700">
                      <span class="material-symbols-outlined text-[20px]">info</span>
                      <p class="text-xs font-medium">PR ini sedang menunggu persetujuan dari Executive (Owner/GM) sebelum dapat diteruskan menjadi PO.</p>
                  </div>
              `;
          }
      } else if (pr.status_pr === 'Selesai') {
          html = `
              <div class="w-full flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-700">
                  <span class="material-symbols-outlined text-[20px]">verified</span>
                  <p class="text-xs font-medium">Purchase Requisition telah selesai diproses. Barang sudah diterima secara penuh di Gudang.</p>
              </div>
          `;
      }
      bay.innerHTML = html;
  }

  backdrop.classList.remove('hidden');
  drawer.classList.remove('translate-x-full');
};

document.getElementById('btn-close-drawer')?.addEventListener('click', () => {
  const drawer = document.getElementById('right-drawer');
  const backdrop = document.getElementById('right-drawer-backdrop');
  if (drawer && backdrop) {
      drawer.classList.add('translate-x-full');
      setTimeout(() => backdrop.classList.add('hidden'), 300);
  }
});

document.getElementById('right-drawer-backdrop')?.addEventListener('click', () => {
  const drawer = document.getElementById('right-drawer');
  const backdrop = document.getElementById('right-drawer-backdrop');
  if (drawer && backdrop) {
      drawer.classList.add('translate-x-full');
      setTimeout(() => backdrop.classList.add('hidden'), 300);
  }
});

window.approvePR = async (id: number) => {
  try {
    const response = await apiFetch<ActionResponse>(`pengadaan/${id}/approve`, {
      method: 'PATCH'
    });
    if (response.success) {
      showToast(response.message);
      
      // Close drawer if open
      const drawer = document.getElementById('right-drawer');
      const backdrop = document.getElementById('right-drawer-backdrop');
      if (drawer && backdrop) {
          drawer.classList.add('translate-x-full');
          setTimeout(() => backdrop.classList.add('hidden'), 300);
      }
      
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
  confirmMode = 'delete_single';
  showConfirmModal('Apakah Anda yakin ingin menghapus PR ini? Tindakan ini tidak dapat dibatalkan.', 'delete');
};

function confirmBulkDelete() {
  confirmMode = 'delete_all';
  showConfirmModal('Apakah Anda yakin ingin menghapus semua PR? Semua data PR yang ada akan dihapus permanen.', 'delete');
}

function confirmBulkApprove() {
  confirmMode = 'approve_all';
  showConfirmModal('Apakah Anda yakin ingin menyetujui semua PR yang sedang menunggu persetujuan?', 'approve');
}

function showConfirmModal(text: string, type: 'delete' | 'approve') {
  const modal = document.getElementById('confirm-modal');
  const modalBox = document.getElementById('confirm-modal-box');
  const modalText = document.getElementById('confirm-modal-text');
  const confirmYes = document.getElementById('confirm-yes') as HTMLButtonElement | null;
  const confirmIconContainer = document.querySelector('#confirm-modal .w-12') as HTMLDivElement | null;
  const confirmIcon = document.querySelector('#confirm-modal .material-symbols-outlined') as HTMLSpanElement | null;

  if (modalText) modalText.textContent = text;

  if (confirmIconContainer && confirmIcon) {
    if (type === 'delete') {
      confirmIconContainer.className = 'w-12 h-12 bg-error text-on-error rounded-3xl flex items-center justify-center text-2xl shrink-0';
      confirmIcon.textContent = 'delete';
      if (confirmYes) {
        confirmYes.className = 'px-4 py-2 rounded-lg bg-error text-on-error hover:opacity-90 transition-opacity font-bold text-sm shadow-sm';
        confirmYes.textContent = 'Ya, hapus';
      }
    } else {
      confirmIconContainer.className = 'w-12 h-12 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center text-2xl shrink-0';
      confirmIcon.textContent = 'done_all';
      if (confirmYes) {
        confirmYes.className = 'px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-bold text-sm shadow-sm';
        confirmYes.textContent = 'Ya, setujui';
      }
    }
  }

  if (modal && modalBox) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
      modal.classList.remove('opacity-0');
      modalBox.classList.remove('scale-95');
    }, 10);
  }
}

function closeConfirmModal() {
  deleteId = null;
  confirmMode = null;
  const modal = document.getElementById('confirm-modal');
  const modalBox = document.getElementById('confirm-modal-box');
  if (modal && modalBox) {
    modal.classList.add('opacity-0');
    modalBox.classList.add('scale-95');
    setTimeout(() => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }, 300);
  }
}

async function proceedConfirmAction() {
  if (confirmMode === null) return;
  const currentMode = confirmMode;
  const currentDeleteId = deleteId;
  closeConfirmModal();

  try {
    if (currentMode === 'delete_single') {
      if (currentDeleteId === null) return;
      const response = await apiFetch<ActionResponse>(`pengadaan/${currentDeleteId}`, {
        method: 'DELETE'
      });
      if (response.success) {
        showToast(response.message);
        loadPengadaan();
        loadDefisitRadar();
      } else {
        showToast(response.message, true);
      }
    } else if (currentMode === 'delete_all') {
      const response = await apiFetch<ActionResponse>('pengadaan', {
        method: 'DELETE'
      });
      if (response.success) {
        showToast(response.message);
        loadPengadaan();
        loadDefisitRadar();
      } else {
        showToast(response.message, true);
      }
    } else if (currentMode === 'approve_all') {
      const response = await apiFetch<ActionResponse>('pengadaan/pr/bulk-approve', {
        method: 'POST'
      });
      if (response.success) {
        showToast(response.message);
        loadPengadaan();
        loadDefisitRadar();
      } else {
        showToast(response.message, true);
      }
    }
  } catch (err) {
    showToast('Terjadi kesalahan saat memproses tindakan.', true);
  }
}

// ============================================================
// DEFISIT RADAR
// ============================================================

async function loadDefisitRadar() {
  const section = document.getElementById('defisit-radar-section');
  const container = document.getElementById('defisit-cards-container');
  const titleEl = document.getElementById('defisit-title');
  
  if (!section || !container || !titleEl) return;

  try {
    const response = await apiFetch<{success: boolean, data: any[]}>('pengadaan/alerts');
    
    if (response.success && response.data.length > 0) {
      section.classList.remove('hidden');
      titleEl.innerHTML = `Peringatan Defisit Operasi <span class="text-xs bg-rose-200/50 text-rose-700 px-2 py-0.5 rounded-md ml-2 border border-rose-200">(${response.data.length} Item)</span>`;
      
      container.innerHTML = '';
      response.data.forEach(item => {
        // qty_saran_pesan = ((reorder_point * 2) - stok_sekarang) * bom_ratio
        const saranPesan = item.qty_saran_pesan || Math.max(1, (item.reorder_point * 2) - item.jumlah_stok_sekarang);
        
        container.innerHTML += `
          <div class="bg-white border border-rose-100 rounded-xl p-3.5 shadow-[0_2px_8px_-3px_rgba(225,29,72,0.1)] relative">
              <div class="absolute top-3.5 right-3.5 text-rose-500">
                  <span class="material-symbols-outlined text-[18px]">warning</span>
              </div>
              <div class="mb-2">
                  <span class="inline-block bg-slate-100 text-slate-500 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest font-data-mono">${item.kode_barang}</span>
              </div>
              <h3 class="font-bold text-slate-800 text-xs leading-snug mb-0.5 truncate pr-6" title="${item.nama_barang}">${item.nama_barang}</h3>
              <p class="text-[9px] text-slate-500 mb-3 truncate" title="${item.nama_vendor}">Vendor: <span class="font-semibold text-slate-700">${item.nama_vendor}</span></p>
              
              <div class="flex items-center gap-2 mt-auto border-t border-slate-100 pt-2.5">
                  <div class="flex-1">
                      <p class="text-[9px] text-slate-400">Stok:</p>
                      <p class="text-sm font-black text-rose-600 leading-none mt-0.5">${item.jumlah_stok_sekarang}</p>
                  </div>
                  <div class="w-px h-6 bg-slate-200"></div>
                  <div class="flex-1 text-center">
                      <p class="text-[9px] text-slate-400">ROP:</p>
                      <p class="text-[11px] font-bold text-slate-600 leading-none mt-1">${item.reorder_point}</p>
                  </div>
                  <div class="w-px h-6 bg-slate-200"></div>
                  <div class="flex-1 text-right">
                      <p class="text-[9px] text-slate-400">Butuh:</p>
                      <p class="text-sm font-black text-emerald-600 leading-none mt-0.5">${saranPesan} <span class="text-[9px] font-normal text-slate-500">${item.satuan}</span></p>
                  </div>
              </div>
          </div>
        `;
      });
    } else {
      section.classList.add('hidden');
    }
  } catch (error) {
    console.error('Failed to load deficit radar:', error);
  }
}

async function proceedAutoGeneratePR() {
  const btn = document.getElementById('btn-auto-generate-pr') as HTMLButtonElement;
  if (!btn) return;

  try {
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined text-[16px] animate-spin">sync</span> Generating...`;

    const response = await apiFetch<ActionResponse>('pengadaan/pr/auto-generate', {
      method: 'POST'
    });

    if (response.success) {
      showToast(response.message);
      loadDefisitRadar();
      loadPengadaan();
    } else {
      showToast(response.message, true);
    }
  } catch (error: any) {
    showToast('Gagal melakukan auto-generate PR.', true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span class="material-symbols-outlined text-[16px]">auto_awesome</span> Auto-Generate PR`;
  }
}

// ============================================================
// BUAT PR MODAL & DROPDOWNS
// ============================================================

let allVendors: any[] = [];
let allItems: any[] = [];

async function loadDropdownData() {
  try {
    const [resVendor, resItem] = await Promise.all([
      apiFetch<{success: boolean, data: any[]}>('pengadaan/vendors'),
      apiFetch<{success: boolean, data: any[]}>('pengadaan/items')
    ]);

    if (resVendor.success) allVendors = resVendor.data;
    if (resItem.success) allItems = resItem.data;

    populateVendorDropdown();
    populateItemDropdown();
  } catch (error) {
    console.error('Failed to load dropdown data:', error);
  }
}

function populateVendorDropdown() {
  const selectVendor = document.getElementById('select-vendor') as HTMLSelectElement;
  if (!selectVendor) return;

  let html = '<option value="" disabled selected>-- Pilih Vendor --</option>';
  allVendors.forEach(v => {
    html += `<option value="${v.id}">${v.nama_vendor}</option>`;
  });
  selectVendor.innerHTML = html;
}

function populateItemDropdown() {
  const selectItem = document.getElementById('select-item-barang') as HTMLSelectElement;
  if (!selectItem) return;

  // Save currently selected item if any
  const currentVal = selectItem.value;

  let html = '<option value="" disabled selected>-- Pilih Material / Barang --</option>';

  allItems.forEach(item => {
    const isSelected = (item.kode_barang === currentVal) ? 'selected' : '';
    html += `<option value="${item.kode_barang}" data-vendor="${item.id_vendor}" data-satuan="${item.satuan}" data-harga="${item.harga_standar || 0}" ${isSelected}>${item.kode_barang} - ${item.nama_barang}</option>`;
  });

  selectItem.innerHTML = html;
}

function handleVendorChange(e: Event) {
  const selectVendor = e.target as HTMLSelectElement;
  const selectItem = document.getElementById('select-item-barang') as HTMLSelectElement;
  const vendorId = selectVendor.value;
  
  if (!selectItem || !vendorId) return;

  // Find first item for this vendor
  const firstItem = allItems.find(item => item.id_vendor == vendorId);
  
  if (firstItem) {
    selectItem.value = firstItem.kode_barang;
    // Trigger change event to update the price automatically
    selectItem.dispatchEvent(new Event('change'));
  }
}

function handleItemChange(e: Event) {
  const selectItem = e.target as HTMLSelectElement;
  const selectVendor = document.getElementById('select-vendor') as HTMLSelectElement;
  const inputHarga = document.querySelector('.item-harga') as HTMLInputElement;
  
  const selectedOption = selectItem.options[selectItem.selectedIndex];
  if (!selectedOption) return;

  const vendorId = selectedOption.getAttribute('data-vendor');
  const hargaRaw = selectedOption.getAttribute('data-harga');
  
  if (inputHarga && hargaRaw) {
    const hargaNum = parseFloat(hargaRaw);
    inputHarga.value = hargaNum.toLocaleString('id-ID');
  }
  
  // Auto select vendor if an item is chosen
  if (vendorId && selectVendor) {
    selectVendor.value = vendorId;
  }
}

function openBuatPrModal() {
  const modal = document.getElementById('buat-pr-modal');
  const modalBox = document.getElementById('buat-pr-modal-box');
  const form = document.getElementById('form-buat-pr') as HTMLFormElement;
  const inputNomorPr = document.getElementById('input-nomor-pr') as HTMLInputElement;

  if (!modal || !modalBox) return;

  if (form) form.reset();
  
  if (inputNomorPr) {
    const tahun = new Date().getFullYear();
    const randomID = Math.floor(1000 + Math.random() * 9000);
    inputNomorPr.value = `PR/MTK/${tahun}/${randomID}`;
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    modalBox.classList.remove('scale-95');
  }, 10);
}

function closeBuatPrModal() {
  const modal = document.getElementById('buat-pr-modal');
  const modalBox = document.getElementById('buat-pr-modal-box');

  if (!modal || !modalBox) return;

  modal.classList.add('opacity-0');
  modalBox.classList.add('scale-95');

  setTimeout(() => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }, 300);
}

async function submitBuatPr(e: Event) {
  e.preventDefault();
  
  const form = document.getElementById('form-buat-pr') as HTMLFormElement;
  const btnSubmit = document.getElementById('btn-submit-pr') as HTMLButtonElement;
  const btnIcon = document.getElementById('btn-submit-pr-icon');
  const btnText = document.getElementById('btn-submit-pr-text');

  if (!form) return;

  const formData = new FormData(form);
  
  const vendorIdStr = formData.get('vendor') as string;
  const kodeBarang = formData.get('item_barang') as string;
  const jumlahStr = formData.get('jumlah') as string;

  if (!vendorIdStr || !kodeBarang || !jumlahStr) {
    showToast('Harap lengkapi semua isian.', true);
    return;
  }

  // Get satuan from selected item
  const selectItem = document.getElementById('select-item-barang') as HTMLSelectElement;
  const selectedOption = selectItem.options[selectItem.selectedIndex];
  const satuan = selectedOption.getAttribute('data-satuan') || 'pcs';

  const payload = {
    nomor_pr: formData.get('nomor_pr'),
    id_vendor: parseInt(vendorIdStr, 10),
    pr_items: [
      {
        kode_barang: kodeBarang,
        jumlah: parseInt(jumlahStr, 10),
        satuan: satuan
      }
    ]
  };

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.classList.add('opacity-80', 'cursor-wait');
  }
  if (btnIcon) {
    btnIcon.innerText = 'sync';
    btnIcon.classList.add('animate-spin');
  }
  if (btnText) {
    btnText.innerText = 'Menyimpan...';
  }

  try {
    const response = await apiFetch<{success: boolean, message: string}>('pengadaan', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (response.success) {
      showToast('Purchase Request berhasil diajukan!');
      closeBuatPrModal();
      loadPengadaan();
      loadDefisitRadar();
    } else {
      showToast(response.message || 'Gagal membuat PR', true);
    }
  } catch (err: any) {
    console.error('Submit PR Error:', err);
    showToast('Terjadi kesalahan jaringan.', true);
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.classList.remove('opacity-80', 'cursor-wait');
    }
    if (btnIcon) {
      btnIcon.classList.remove('animate-spin');
      btnIcon.innerText = 'save';
    }
    if (btnText) {
      btnText.innerText = 'Simpan & Ajukan';
    }
  }
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const user = initRBAC('nav-pengadaan');
  if (!user) return;

  loadPengadaan();
  loadDefisitRadar();
  loadDropdownData();

  const btnConfirmNo = document.getElementById('confirm-no');
  const btnConfirmYes = document.getElementById('confirm-yes');

  if (btnConfirmNo) btnConfirmNo.addEventListener('click', closeConfirmModal);
  if (btnConfirmYes) btnConfirmYes.addEventListener('click', proceedConfirmAction);

  const btnApprove = document.getElementById('btn-bulk-approve-pr');
  const btnDelete = document.getElementById('btn-bulk-delete-pr');

  if (btnApprove) btnApprove.addEventListener('click', confirmBulkApprove);
  if (btnDelete) btnDelete.addEventListener('click', confirmBulkDelete);

  // RBAC: Show bulk buttons for Executives
  if (user.divisi_role === 'Owner' || user.divisi_role === 'General Manager') {
      btnApprove?.classList.remove('hidden');
      btnDelete?.classList.remove('hidden');
  } else if (user.divisi_role === 'Pengadaan') {
      // Pengadaan can delete but not approve
      btnDelete?.classList.remove('hidden');
  }

  const btnAutoGenerate = document.getElementById('btn-auto-generate-pr');
  if (btnAutoGenerate) btnAutoGenerate.addEventListener('click', proceedAutoGeneratePR);

  const btnCreatePR = document.getElementById('btn-create-pr');
  if (btnCreatePR) btnCreatePR.addEventListener('click', openBuatPrModal);

  const btnClosePrModal = document.getElementById('btn-close-pr-modal');
  const btnCancelPr = document.getElementById('btn-cancel-pr');
  if (btnClosePrModal) btnClosePrModal.addEventListener('click', closeBuatPrModal);
  if (btnCancelPr) btnCancelPr.addEventListener('click', closeBuatPrModal);

  const formBuatPr = document.getElementById('form-buat-pr');
  if (formBuatPr) formBuatPr.addEventListener('submit', submitBuatPr);

  const filterStatusPr = document.getElementById('filter-status-pr') as HTMLSelectElement;
  if (filterStatusPr) {
      filterStatusPr.addEventListener('change', (e) => {
          currentFilterPR = (e.target as HTMLSelectElement).value;
          currentPage = 1;
          renderTable();
      });
  }

  const selectVendor = document.getElementById('select-vendor');
  const selectItemBarang = document.getElementById('select-item-barang');
  if (selectVendor) selectVendor.addEventListener('change', handleVendorChange);
  if (selectItemBarang) selectItemBarang.addEventListener('change', handleItemChange);
});
