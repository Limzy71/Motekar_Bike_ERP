/**
 * pengadaan.ts — Logic untuk halaman Daftar PR.
 * Migrasi dari: Motekar_ERP/frontend/script.js (tab-pengadaan logic)
 */

import { apiFetch, getUserData } from '../api.js';
import { initRBAC, showToast } from '../components/rbac.js';
import { renderPaginationUI } from '../utils/pagination.js';
import { openPrintWindow, openReportWindow } from '../utils/printDocument.js';

declare const Swal: any;

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

interface RestockRequest {
  id: number;
  id_inventory_material: number;
  nomor_wo: string;
  jumlah_diminta: number;
  status: string;
  created_at: string;
  kode_barang: string;
  nama_barang: string;
  satuan: string;
}

interface RestockResponse {
  success: boolean;
  data: RestockRequest[];
  message?: string;
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

interface SRMVendor {
  id: number;
  kode_vendor: string;
  nama_vendor: string;
  kategori: string;
  kontak: string;
  alamat: string;
  status_vendor: string;
  alasan_blacklist: string | null;
  skor_rating: number;
}

let deleteId: number | null = null;
let allPRData: PurchaseRequisition[] = [];
let masterVendorsSRM: SRMVendor[] = [];
let confirmMode: 'delete_single' | 'delete_all' | 'approve_all' | null = null;

let currentPage = 1;
const itemsPerPage = 10;
let currentFilterPR = 'All';

let currentSRMPage = 1;
const srmItemsPerPage = 10;

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
    renderPaginationUI('pr-pagination-pagination', 'pr-pagination-info', 1, 10, 0, () => {});
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
    tr.className = 'hover:bg-slate-100 transition-colors duration-150 text-xs font-medium text-slate-600 group cursor-pointer';
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
    renderPaginationUI(
        'pr-pagination-pagination',
        'pr-pagination-info',
        currentPage,
        itemsPerPage,
        totalItems,
        (newPage) => {
            currentPage = newPage;
            renderTable();
        }
    );
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
    printPR: (id: number) => void;
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
          <tr class="hover:bg-slate-100 transition-colors">
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
      // Tombol cetak selalu tersedia di semua status
      html += `
          <button onclick="window.printPR(${pr.id})" class="w-full px-4 py-2.5 bg-slate-800 text-white rounded-xl font-bold text-sm shadow-sm hover:bg-slate-700 transition-all flex items-center justify-center gap-2">
              <span class="material-symbols-outlined text-[18px]">print</span> Cetak Purchase Request
          </button>
      `;
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

window.printPR = (id: number) => {
  const pr = allPRData.find(p => p.id === id);
  if (!pr) return;

  const dateStr = pr.created_at
    ? new Date(pr.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : '-';

  const items = (pr.items || []).map((item: any, idx: number) => ({
    no: idx + 1,
    kode: item.kode_barang,
    nama_barang: item.nama_barang,
    satuan: item.satuan,
    quantity: `${item.jumlah} ${item.satuan}`,
  }));

  openPrintWindow({
    docType: 'Purchase Requisition',
    docNumber: pr.nomor_pr,
    docDate: dateStr,
    status: pr.status_pr,
    headerFields: [
      { label: 'Nomor PR', value: pr.nomor_pr },
      { label: 'Tanggal Permintaan', value: dateStr },
      { label: 'Vendor Rekomendasi', value: pr.nama_vendor || '-' },
      { label: 'Status Approval', value: pr.status_pr },
      { label: 'Alamat Pengiriman (Tujuan)', value: 'Jl. Dr. Setiabudi No.193, Gegerkalong, Kec. Sukasari, Kota Bandung, Jawa Barat 40153' },
    ],
    columns: [
      { label: 'No', key: 'no', align: 'center' },
      { label: 'Kode Barang', key: 'kode', align: 'left' },
      { label: 'Nama Barang', key: 'nama_barang', align: 'left' },
      { label: 'Quantity', key: 'quantity', align: 'right' },
    ],
    items,
    footer: `Dokumen ini diterbitkan oleh Sistem ERP Motekar Bike Assy · ${pr.nomor_pr} · Dicetak: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    signatures: [
      { title: 'Diajukan Oleh', name: 'Departemen Pengadaan' },
      { title: 'Disetujui Oleh', name: 'Owner / General Manager' },
    ],
  });
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
        loadPengadaan();
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
        loadPengadaan();
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
        loadPengadaan();
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
      renderTable();
      await loadPengadaan();
      await loadRestockRequests();
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
// SRM & VENDOR MANAGEMENT
// ============================================================

async function loadVendorsSRM(): Promise<void> {
    const tbody = document.getElementById('tbody-srm');
    if (!tbody) return;

    try {
        const response = await apiFetch<{success: boolean, data: SRMVendor[]}>('vendor');
        if (response.success) {
            masterVendorsSRM = response.data;
            renderVendorsSRM();
        } else {
            tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-rose-600">Gagal memuat data vendor.</td></tr>`;
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-rose-600">Kesalahan jaringan.</td></tr>`;
    }
}

function renderVendorsSRM(): void {
    const tbody = document.getElementById('tbody-srm');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (masterVendorsSRM.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-slate-500">Tidak ada data vendor.</td></tr>`;
    renderPaginationUI('srm-pagination-pagination', 'srm-pagination-info', 1, 10, 0, () => {});
        return;
    }

    const totalItems = masterVendorsSRM.length;
    const totalPages = Math.ceil(totalItems / srmItemsPerPage);
    if (currentSRMPage > totalPages) currentSRMPage = totalPages;

    const startIndex = (currentSRMPage - 1) * srmItemsPerPage;
    const endIndex = Math.min(startIndex + srmItemsPerPage, totalItems);
    const currentItems = masterVendorsSRM.slice(startIndex, endIndex);

    currentItems.forEach(v => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-100 transition-colors duration-150 text-xs font-medium text-slate-600 cursor-pointer group';
        tr.onclick = () => openSRMStatusModal(v);
        
        let statusBadge = '';
        if (v.status_vendor === 'AKTIF') statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">AKTIF</span>`;
        else if (v.status_vendor === 'INAKTIF') statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold border bg-slate-50 text-slate-500 border-slate-200">INAKTIF</span>`;
        else if (v.status_vendor === 'BLACKLIST') statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold border bg-rose-50 text-rose-700 border-rose-200" title="${v.alasan_blacklist || ''}">BLACKLIST</span>`;

        tr.innerHTML = `
            <td class="px-4 py-3 font-data-mono font-bold text-slate-700">${v.kode_vendor || '-'}</td>
            <td class="px-4 py-3">
                <p class="font-bold text-slate-800">${v.nama_vendor}</p>
                <p class="text-[10px] text-slate-500">${v.kontak || '-'}</p>
            </td>
            <td class="px-4 py-3">
                <p class="text-xs text-slate-600 line-clamp-2 max-w-[220px]" title="${v.alamat || '-'}">${v.alamat || '<span class="italic text-slate-400">Belum diisi</span>'}</p>
            </td>
            <td class="px-4 py-3 text-slate-600">${v.kategori || '-'}</td>
            <td class="px-4 py-3 text-center">
                <span class="flex items-center justify-center gap-1 font-bold text-amber-500">
                    <span class="material-symbols-outlined text-[14px]">star</span> ${v.skor_rating}
                </span>
            </td>
            <td class="px-4 py-3 text-center">${statusBadge}</td>
            <td class="px-4 py-3 text-center relative z-10">
                <button class="btn-srm-status text-slate-400 group-hover:text-primary group-hover:bg-primary-container/30 px-2 py-1 rounded transition-colors" data-id="${v.id}" onclick="event.stopPropagation();">Kelola Status</button>
            </td>
        `;

        const btnStatus = tr.querySelector('.btn-srm-status');
        btnStatus?.addEventListener('click', (e) => {
            e.stopPropagation();
            openSRMStatusModal(v);
        });

        tbody.appendChild(tr);
    });
    renderPaginationUI(
        'srm-pagination-pagination',
        'srm-pagination-info',
        currentSRMPage,
        srmItemsPerPage,
        totalItems,
        (newPage) => {
            currentSRMPage = newPage;
            renderVendorsSRM();
        }
    );
}



function openSRMStatusModal(v: SRMVendor): void {
    const modal = document.getElementById('modal-srm-status');
    const content = document.getElementById('modal-srm-status-content');
    
    (document.getElementById('srm-status-vendor-name') as HTMLElement).textContent = v.nama_vendor;
    (document.getElementById('srm-status-vendor-id') as HTMLInputElement).value = v.id.toString();
    
    const inputStatus = document.getElementById('srm-input-status') as HTMLSelectElement;
    inputStatus.value = v.status_vendor;
    
    const inputSkor = document.getElementById('srm-input-skor') as HTMLInputElement;
    inputSkor.value = v.skor_rating.toString();

    const containerAlasan = document.getElementById('srm-alasan-container');
    const inputAlasan = document.getElementById('srm-input-alasan') as HTMLTextAreaElement;
    
    if (v.status_vendor === 'BLACKLIST') {
        containerAlasan?.classList.remove('hidden');
        inputAlasan.value = v.alasan_blacklist || '';
        inputAlasan.required = true;
    } else {
        containerAlasan?.classList.add('hidden');
        inputAlasan.value = '';
        inputAlasan.required = false;
    }

    if (modal && content) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            content.classList.remove('scale-95');
        }, 10);
    }
}

function setupSRMModals(): void {
    // 1. Status Modal
    const modalStatus = document.getElementById('modal-srm-status');
    const contentStatus = document.getElementById('modal-srm-status-content');
    const inputStatus = document.getElementById('srm-input-status') as HTMLSelectElement;
    const containerAlasan = document.getElementById('srm-alasan-container');
    const inputAlasan = document.getElementById('srm-input-alasan') as HTMLTextAreaElement;

    inputStatus?.addEventListener('change', () => {
        if (inputStatus.value === 'BLACKLIST') {
            containerAlasan?.classList.remove('hidden');
            inputAlasan.required = true;
        } else {
            containerAlasan?.classList.add('hidden');
            inputAlasan.required = false;
        }
    });

    const closeStatusModal = () => {
        if (modalStatus && contentStatus) {
            modalStatus.classList.add('opacity-0');
            contentStatus.classList.add('scale-95');
            setTimeout(() => {
                modalStatus.classList.add('hidden');
                modalStatus.classList.remove('flex');
            }, 300);
        }
    };

    document.getElementById('btn-close-srm-status')?.addEventListener('click', closeStatusModal);
    document.getElementById('btn-cancel-srm-status')?.addEventListener('click', closeStatusModal);

    document.getElementById('form-srm-status')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = (document.getElementById('srm-status-vendor-id') as HTMLInputElement).value;
        const status = inputStatus.value;
        const alasan = inputAlasan.value;
        const skor = (document.getElementById('srm-input-skor') as HTMLInputElement).value;

        try {
            const response = await apiFetch<ActionResponse>(`vendor/${id}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status_vendor: status, alasan_blacklist: alasan, skor_rating: skor })
            });

            if (response.success) {
                showToast(response.message);
                closeStatusModal();
                loadVendorsSRM();
                loadDropdownData(); // Refresh dropdown
            } else {
                showToast(response.message, true);
            }
        } catch (err) {
            showToast('Gagal mengubah status vendor', true);
        }
    });

    // 2. Vendor Form Modal
    const modalVendor = document.getElementById('modal-srm-vendor');
    const contentVendor = document.getElementById('modal-srm-vendor-content');
    
    const closeVendorModal = () => {
        if (modalVendor && contentVendor) {
            modalVendor.classList.add('opacity-0');
            contentVendor.classList.add('scale-95');
            setTimeout(() => {
                modalVendor.classList.add('hidden');
                modalVendor.classList.remove('flex');
                (document.getElementById('form-srm-vendor') as HTMLFormElement)?.reset();
            }, 300);
        }
    };

    let mapVendor: any = null;
    let markerVendor: any = null;
    let autocompleteVendor: any = null;

    const initMap = () => {
        if (typeof (window as any).google === 'undefined' || !(window as any).google.maps) return;
        
        const mapElement = document.getElementById('srm-map-vendor');
        const inputElement = document.getElementById('srm-input-alamat') as HTMLTextAreaElement;
        
        if (mapElement && inputElement && !mapVendor) {
            const defaultLoc = { lat: -6.2088, lng: 106.8456 }; // Jakarta
            
            mapVendor = new (window as any).google.maps.Map(mapElement, {
                center: defaultLoc,
                zoom: 13,
                mapTypeControl: false,
                streetViewControl: false,
            });

            markerVendor = new (window as any).google.maps.Marker({
                map: mapVendor,
                position: defaultLoc,
                draggable: true
            });

            autocompleteVendor = new (window as any).google.maps.places.Autocomplete(inputElement, {
                fields: ["formatted_address", "geometry", "name"]
            });
            
            autocompleteVendor.bindTo("bounds", mapVendor);

            autocompleteVendor.addListener("place_changed", () => {
                const place = autocompleteVendor.getPlace();
                if (!place.geometry || !place.geometry.location) return;

                if (place.geometry.viewport) {
                    mapVendor.fitBounds(place.geometry.viewport);
                } else {
                    mapVendor.setCenter(place.geometry.location);
                    mapVendor.setZoom(17);
                }
                markerVendor.setPosition(place.geometry.location);
                if (place.formatted_address) inputElement.value = place.formatted_address;
            });

            markerVendor.addListener("dragend", () => {
                const pos = markerVendor.getPosition();
                if (pos) {
                    mapVendor.panTo(pos);
                    const geocoder = new (window as any).google.maps.Geocoder();
                    geocoder.geocode({ location: pos }, (results: any, status: any) => {
                        if (status === "OK" && results && results[0]) {
                            inputElement.value = results[0].formatted_address;
                        }
                    });
                }
            });
        }
    };

    document.getElementById('btn-create-vendor')?.addEventListener('click', () => {
        (document.getElementById('srm-vendor-modal-title') as HTMLElement).innerHTML = `<span class="material-symbols-outlined text-primary">domain_add</span> Tambah Vendor Baru`;
        (document.getElementById('srm-input-id-vendor') as HTMLInputElement).value = '';
        (document.getElementById('form-srm-vendor') as HTMLFormElement)?.reset();
        
        if (modalVendor && contentVendor) {
            modalVendor.classList.remove('hidden');
            modalVendor.classList.add('flex');
            
            // Trigger resize after modal becomes visible so map renders correctly
            setTimeout(() => {
                initMap();
                if (mapVendor) {
                    (window as any).google.maps.event.trigger(mapVendor, 'resize');
                    if (markerVendor && markerVendor.getPosition()) {
                        mapVendor.setCenter(markerVendor.getPosition());
                    }
                }
                modalVendor.classList.remove('opacity-0');
                contentVendor.classList.remove('scale-95');
            }, 50);
        }
    });

    document.getElementById('btn-close-srm-vendor')?.addEventListener('click', closeVendorModal);
    document.getElementById('btn-cancel-srm-vendor')?.addEventListener('click', closeVendorModal);

    document.getElementById('form-srm-vendor')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = (document.getElementById('srm-input-id-vendor') as HTMLInputElement).value;
        const payload = {
            kode_vendor: (document.getElementById('srm-input-kode') as HTMLInputElement).value,
            nama_vendor: (document.getElementById('srm-input-nama') as HTMLInputElement).value,
            kategori: (document.getElementById('srm-input-kategori') as HTMLInputElement).value,
            kontak: (document.getElementById('srm-input-kontak') as HTMLInputElement).value,
            alamat: (document.getElementById('srm-input-alamat') as HTMLTextAreaElement).value
        };

        try {
            const url = id ? `vendor/${id}` : 'vendor';
            const method = id ? 'PUT' : 'POST';
            
            const response = await apiFetch<ActionResponse>(url, {
                method,
                body: JSON.stringify(payload)
            });

            if (response.success) {
                showToast(response.message);
                closeVendorModal();
                loadVendorsSRM();
                loadDropdownData();
            } else {
                showToast(response.message, true);
            }
        } catch (err) {
            showToast('Gagal menyimpan data vendor', true);
        }
    });
}

// ============================================================
// TABS & INIT
// ============================================================

function setupTabs(): void {
    const tabPr = document.getElementById('tab-pr');
    const tabSrm = document.getElementById('tab-srm');
    const viewPr = document.getElementById('view-pr');
    const viewSrm = document.getElementById('view-srm');
    
    const activeClass = 'pb-3 px-2 text-sm font-bold text-primary border-b-2 border-primary transition-colors';
    const inactiveClass = 'pb-3 px-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors';

    const switchTab = (tabName: 'pr' | 'srm') => {
        if (tabName === 'pr') {
            tabPr!.className = activeClass;
            tabSrm!.className = inactiveClass;
            viewPr?.classList.remove('hidden');
            viewSrm?.classList.add('hidden');
            localStorage.setItem('pengadaanLastTab', 'pr');
        } else {
            tabSrm!.className = activeClass;
            tabPr!.className = inactiveClass;
            viewSrm?.classList.remove('hidden');
            viewPr?.classList.add('hidden');
            localStorage.setItem('pengadaanLastTab', 'srm');
            loadVendorsSRM();
        }
    };

    tabPr?.addEventListener('click', () => switchTab('pr'));
    tabSrm?.addEventListener('click', () => switchTab('srm'));

    // Restore last active tab
    const lastTab = localStorage.getItem('pengadaanLastTab');
    if (lastTab === 'srm') {
        switchTab('srm');
    } else {
        switchTab('pr');
    }

    // Remove anti-flicker style once tabs are properly initialized
    const antiFlicker = document.getElementById('anti-flicker');
    if (antiFlicker) antiFlicker.remove();
}

// ============================================================
// MRP MATERIAL REQUESTS INBOX
// ============================================================
async function loadRestockRequests(): Promise<void> {
    const listContainer = document.getElementById('mrp-requests-list');
    const emptyState = document.getElementById('mrp-empty-state');
    const container = document.getElementById('mrp-requests-container');
    
    if (!listContainer || !emptyState || !container) return;

    try {
        const res = await apiFetch<RestockResponse>('pengadaan/requests');
        if (res.success && res.data.length > 0) {
            emptyState.classList.add('hidden');
            container.classList.remove('hidden');
            const btnAutoGeneratePR = document.getElementById('btn-auto-generate-pr');
            if (btnAutoGeneratePR) {
                if (res.data.length > 0) {
                    btnAutoGeneratePR.classList.remove('hidden');
                } else {
                    btnAutoGeneratePR.classList.add('hidden');
                }
            }

            listContainer.innerHTML = res.data.map(req => {
                const dateStr = req.created_at ? new Date(req.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
                return `
                <div class="bg-white rounded-lg p-3.5 shadow-sm border border-rose-100 flex flex-col justify-between gap-3 relative overflow-hidden group hover:border-rose-300 hover:shadow-md transition-all">
                    <div class="absolute left-0 top-0 bottom-0 w-1 bg-rose-500"></div>
                    <div class="pl-1">
                        <div class="flex items-center justify-between gap-2 mb-1.5">
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">WO: ${req.nomor_wo}</span>
                            <span class="text-[9px] text-slate-400 font-medium">${dateStr}</span>
                        </div>
                        <h4 class="text-xs font-bold text-slate-800 leading-snug line-clamp-2" title="${req.kode_barang} - ${req.nama_barang}">${req.kode_barang} - ${req.nama_barang}</h4>
                        <p class="text-[11px] text-rose-600 font-bold mt-1 bg-rose-50 w-fit px-1.5 py-0.5 rounded border border-rose-100">Kurang: ${req.jumlah_diminta} ${req.satuan}</p>
                    </div>
                    <div class="pl-1 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 mt-auto">
                        <button onclick="window.openCreatePRModal('${req.kode_barang}', ${req.jumlah_diminta})" class="bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold px-3 py-1.5 rounded-md shadow-sm flex items-center gap-1.5 transition-all flex-1 justify-center">
                            <span class="material-symbols-outlined text-[14px]">add_shopping_cart</span>
                            Buat PR Baru
                        </button>
                        <button onclick="window.markRequestSelesai(${req.id})" class="bg-white hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 border border-slate-200 hover:border-emerald-200 text-[10px] font-bold px-2 py-1.5 rounded-md shadow-sm transition-all shrink-0" title="Tandai Selesai / Hapus">
                            <span class="material-symbols-outlined text-[16px]">check</span>
                        </button>
                    </div>
                </div>
                `;
            }).join('');
        } else {
            const btnAutoGeneratePR = document.getElementById('btn-auto-generate-pr');
            if (btnAutoGeneratePR) btnAutoGeneratePR.classList.add('hidden');

            emptyState.classList.remove('hidden');
            container.classList.add('hidden');
            listContainer.innerHTML = '';
        }
    } catch (error) {
        console.error('Failed to load restock requests', error);
    }
}

(window as any).openCreatePRModal = (kodeBarang: string, qtyDiminta: number) => {
    openBuatPrModal();
};

(window as any).markRequestSelesai = async (id: number) => {
    // Jika ID negatif, itu adalah alarm otomatis MRP
    if (id < 0) {
        Swal.fire({
            title: 'Alarm Otomatis',
            text: 'Ini adalah alarm otomatis dari sistem MRP. Alarm ini tidak bisa ditutup secara manual dan akan hilang dengan sendirinya ketika stok fisik di gudang telah ditambah (di atas batas minimal).',
            icon: 'info',
            confirmButtonText: 'Mengerti',
            confirmButtonColor: '#00288e'
        });
        return;
    }

    const result = await Swal.fire({
        title: 'Tandai Selesai?',
        text: 'Anda yakin permintaan material ini sudah ditangani (PR/PO sudah dibuat)?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Ya, Selesai',
        cancelButtonText: 'Batal'
    });

    if (result.isConfirmed) {
        try {
            const response = await apiFetch<ActionResponse>(`pengadaan/requests/${id}/selesai`, {
                method: 'PATCH'
            });
            if (response.success) {
                Swal.fire('Berhasil!', 'Permintaan Material diselesaikan.', 'success');
                await loadRestockRequests();
            } else {
                Swal.fire('Gagal', response.message || 'Gagal menandai selesai', 'error');
            }
        } catch (e) {
            Swal.fire('Error', 'Terjadi kesalahan jaringan', 'error');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
  const user = initRBAC('nav-pengadaan');
  if (!user) return;

  loadPengadaan();
  loadRestockRequests();
  loadDropdownData();

  const btnConfirmNo = document.getElementById('confirm-no');
  const btnConfirmYes = document.getElementById('confirm-yes');

  if (btnConfirmNo) btnConfirmNo.addEventListener('click', closeConfirmModal);
  if (btnConfirmYes) btnConfirmYes.addEventListener('click', proceedConfirmAction);

  const btnApprove = document.getElementById('btn-bulk-approve-pr');
  const btnDelete = document.getElementById('btn-bulk-delete-pr');

  if (btnApprove) btnApprove.addEventListener('click', confirmBulkApprove);
  if (btnDelete) btnDelete.addEventListener('click', confirmBulkDelete);



  const btnCreatePR = document.getElementById('btn-create-pr');
  if (btnCreatePR) btnCreatePR.addEventListener('click', openBuatPrModal);

  const btnAutoGeneratePR = document.getElementById('btn-auto-generate-pr');
  if (btnAutoGeneratePR) {
      btnAutoGeneratePR.addEventListener('click', async () => {
          const result = await Swal.fire({
              title: 'Auto-Generate PR?',
              text: 'Sistem akan secara otomatis membuatkan dokumen Permintaan Pembelian (PR) untuk seluruh barang di gudang yang sedang mengalami defisit (di bawah batas minimal).',
              icon: 'question',
              showCancelButton: true,
              confirmButtonText: 'Ya, Buat Otomatis',
              cancelButtonText: 'Batal',
              confirmButtonColor: '#4f46e5'
          });

          if (result.isConfirmed) {
              try {
                  const response = await apiFetch<ActionResponse>('pengadaan/pr/auto-generate', { method: 'POST' });
                  if (response.success) {
                      Swal.fire('Berhasil!', response.message, 'success');
                      loadPengadaan();
                      loadRestockRequests();
                  } else {
                      Swal.fire('Gagal', response.message, 'error');
                  }
              } catch (err) {
                  Swal.fire('Error', 'Kesalahan jaringan', 'error');
              }
          }
      });
  }

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

  const btnPrintReportPr = document.getElementById('btn-print-report-pr');
  if (btnPrintReportPr) {
      btnPrintReportPr.addEventListener('click', () => {
          let filteredData = allPRData;
          if (currentFilterPR !== 'All') {
              filteredData = allPRData.filter(pr => pr.status_pr === currentFilterPR);
          }
          if (filteredData.length === 0) {
              // @ts-ignore
              Swal.fire('Info', 'Tidak ada data PR untuk dicetak.', 'info');
              return;
          }
          openReportWindow({
              title: 'Laporan Rekapitulasi Purchase Requisition (PR)',
              subtitle: `Filter: Status ${currentFilterPR}`,
              columns: [
                  { label: 'Nomor PR', key: 'nomor_pr' },
                  { label: 'Tanggal', key: 'created_at', format: (val) => new Date(val).toLocaleDateString('id-ID') },
                  { label: 'Nama Vendor', key: 'nama_vendor' },
                  { label: 'Status PR', key: 'status_pr', align: 'center' }
              ],
              data: filteredData
          });
      });
  }

  const selectVendor = document.getElementById('select-vendor');
  const selectItemBarang = document.getElementById('select-item-barang');
  if (selectVendor) selectVendor.addEventListener('change', handleVendorChange);
  if (selectItemBarang) selectItemBarang.addEventListener('change', handleItemChange);

  setupTabs();
  setupSRMModals();

  // Polling for Real-Time Experience (Every 30 seconds)
  setInterval(() => {
      const tab = localStorage.getItem('pengadaanLastTab') || 'pr';
      if (tab === 'pr') loadPengadaan();
      else if (tab === 'srm') loadVendorsSRM();
  }, 30000);
});
