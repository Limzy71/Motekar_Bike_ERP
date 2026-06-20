/**
 * gudang.ts — Logic untuk halaman Gudang & Inventori.
 * Memenuhi spesifikasi Motekar Enterprise Design System (MEDS).
 */

import { apiFetch } from '../api.js';
import { initRBAC, showToast } from '../components/rbac.js';

interface InventoryItem {
  id: number;
  kode_barang: string;
  nama_barang: string;
  kategori: string;
  jumlah_stok: number;
  satuan: string;
  last_updated: string;
}

interface GudangResponse {
  success: boolean;
  data: InventoryItem[];
  message?: string;
}

interface ActionResponse {
  success: boolean;
  message: string;
}

// Global memory untuk instan filter & search
let masterStok: InventoryItem[] = [];
let currentFilter: string = 'Semua';
let currentSearch: string = '';

// ============================================================
// DATA FETCHING & RENDERING
// ============================================================

async function loadGudang(): Promise<void> {
  const tbody = document.getElementById('tbody-gudang');
  if (!tbody) return;

  try {
    const response = await apiFetch<GudangResponse>('gudang');

    if (response.success) {
      masterStok = response.data;
      renderTable();
    } else {
      tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-sm text-rose-600">Gagal memuat data: ${response.message}</td></tr>`;
      showToast(response.message || 'Gagal memuat data Gudang', true);
    }
  } catch (err) {
    console.error('loadGudang error:', err);
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-sm text-rose-600">Terjadi kesalahan koneksi jaringan.</td></tr>`;
    showToast('Terjadi kesalahan jaringan.', true);
  }
}

function renderTable(): void {
  const tbody = document.getElementById('tbody-gudang');
  if (!tbody) return;

  tbody.innerHTML = '';

  // Filter & Search Logic
  const filteredData = masterStok.filter(item => {
    // 1. Kategori Filter
    const matchCategory = currentFilter === 'Semua' || item.kategori === currentFilter;
    
    // 2. Search Filter (kode atau nama)
    const searchTerm = currentSearch.toLowerCase();
    const matchSearch = currentSearch === '' || 
                        item.kode_barang.toLowerCase().includes(searchTerm) || 
                        item.nama_barang.toLowerCase().includes(searchTerm);
    
    return matchCategory && matchSearch;
  });

  if (filteredData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-sm text-slate-500">Tidak ada data stok yang sesuai.</td></tr>`;
    return;
  }

  filteredData.forEach(item => {
    // Dynamic Stock Badges (MEDS Kunci UX)
    let statusBadge = '';
    if (item.jumlah_stok <= 10) {
      statusBadge = `<span class="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide border bg-rose-50 text-rose-700 border-rose-200/80">Kritis</span>`;
    } else {
      statusBadge = `<span class="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide border bg-emerald-50 text-emerald-700 border-emerald-200/80">Aman</span>`;
    }

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50/50 transition-colors duration-150 border-b border-slate-100 text-xs font-medium text-slate-600 last:border-b-0 group';
    tr.innerHTML = `
        <td class="px-4 py-3">
            <p class="font-semibold text-slate-900 font-data-mono">${item.kode_barang}</p>
        </td>
        <td class="px-4 py-3">
            <p>${item.nama_barang}</p>
        </td>
        <td class="px-4 py-3">
            <p>${item.kategori}</p>
        </td>
        <td class="px-4 py-3">
            <p class="font-bold text-slate-900">${item.jumlah_stok}</p>
        </td>
        <td class="px-4 py-3">
            <p>${item.satuan}</p>
        </td>
        <td class="px-4 py-3">
            ${statusBadge}
        </td>
        <td class="px-4 py-3 text-center">
            <div class="flex items-center justify-center gap-1 transition-opacity">
                <!-- Stock Opname Action Placeholder -->
                <button class="p-1 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all" title="Stock Opname (Segera Hadir)" onclick="alert('Fitur Opname dalam tahap berikutnya.')">
                    <span class="material-symbols-outlined text-[18px]">edit_square</span>
                </button>
            </div>
        </td>
    `;
    tbody.appendChild(tr);
  });
}

// ============================================================
// FILTER & SEARCH HANDLERS
// ============================================================

function setupFilters(): void {
  // Search Input
  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = (e.target as HTMLInputElement).value;
      renderTable(); // Instan re-render
    });
  }

  // Category Pills
  const categoryPills = document.querySelectorAll('.filter-btn');
  categoryPills.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      const filter = target.getAttribute('data-filter') || 'Semua';
      currentFilter = filter;

      // Update styling
      categoryPills.forEach(p => {
        p.classList.remove('bg-slate-900', 'text-white', 'shadow-2xs');
        p.classList.add('bg-slate-100', 'text-slate-600', 'hover:bg-slate-200/70');
      });

      target.classList.remove('bg-slate-100', 'text-slate-600', 'hover:bg-slate-200/70');
      target.classList.add('bg-slate-900', 'text-white', 'shadow-2xs');

      renderTable(); // Instan re-render
    });
  });
}

// ============================================================
// MODAL (BARANG MASUK) HANDLERS
// ============================================================

function setupModalInbound(): void {
  const modal = document.getElementById('modal-inbound');
  const modalContent = document.getElementById('modal-inbound-content');
  const btnOpen = document.getElementById('btn-open-modal-masuk');
  const btnClose = document.getElementById('btn-close-modal');
  const btnCancel = document.getElementById('btn-cancel-modal');
  const form = document.getElementById('form-barang-masuk') as HTMLFormElement;

  const modeRadios = document.querySelectorAll('input[name="mode_barang"]');
  const inputNama = document.getElementById('input-nama') as HTMLInputElement;
  const inputKategori = document.getElementById('input-kategori') as HTMLSelectElement;
  const inputSatuan = document.getElementById('input-satuan') as HTMLSelectElement;
  const inputKode = document.getElementById('input-kode') as HTMLInputElement;

  // Open Modal
  btnOpen?.addEventListener('click', () => {
    if (modal && modalContent) {
      modal.classList.remove('hidden');
      setTimeout(() => {
        modal.classList.remove('opacity-0');
        modalContent.classList.remove('scale-95');
      }, 10);
    }
  });

  // Close Modal
  const closeModal = () => {
    if (modal && modalContent) {
      modal.classList.add('opacity-0');
      modalContent.classList.add('scale-95');
      setTimeout(() => {
        modal.classList.add('hidden');
        form?.reset();
        resetMode();
      }, 300);
    }
  };

  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);

  // Close on outside click
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Mode Switch Logic
  const resetMode = () => {
    // Default is Existing: nama, kategori, satuan disabled. User only inputs kode and jumlah
    inputNama.disabled = true;
    inputNama.classList.add('bg-slate-50', 'text-slate-400');
    inputKategori.disabled = true;
    inputKategori.classList.add('bg-slate-50', 'text-slate-400');
    inputSatuan.disabled = true;
    inputSatuan.classList.add('bg-slate-50', 'text-slate-400');
    
    // Auto-fill trigger from kode
    inputKode.addEventListener('blur', handleAutoFill);
  };

  const handleAutoFill = () => {
    const isExisting = (document.querySelector('input[name="mode_barang"]:checked') as HTMLInputElement).value === 'existing';
    if (!isExisting) return;

    const kode = inputKode.value.trim().toUpperCase();
    const found = masterStok.find(s => s.kode_barang.toUpperCase() === kode);
    
    if (found) {
      inputNama.value = found.nama_barang;
      inputKategori.value = found.kategori;
      inputSatuan.value = found.satuan;
    } else {
      inputNama.value = '';
    }
  };

  modeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const mode = (e.target as HTMLInputElement).value;
      if (mode === 'baru') {
        inputNama.disabled = false;
        inputNama.classList.remove('bg-slate-50', 'text-slate-400');
        inputNama.value = '';
        inputKategori.disabled = false;
        inputKategori.classList.remove('bg-slate-50', 'text-slate-400');
        inputSatuan.disabled = false;
        inputSatuan.classList.remove('bg-slate-50', 'text-slate-400');
        inputKode.removeEventListener('blur', handleAutoFill);
      } else {
        resetMode();
      }
    });
  });

  // Init mode state
  resetMode();

  // Form Submit
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const spinner = document.getElementById('spinner-masuk');
    const btnSubmit = document.getElementById('btn-submit-masuk') as HTMLButtonElement;

    // Kumpulkan data. Disabled inputs not included in FormData, so we build it manually or enable them temporarily.
    inputNama.disabled = false;
    inputKategori.disabled = false;
    inputSatuan.disabled = false;

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    // Restore disabled state if needed
    if ((document.querySelector('input[name="mode_barang"]:checked') as HTMLInputElement).value === 'existing') {
      inputNama.disabled = true;
      inputKategori.disabled = true;
      inputSatuan.disabled = true;
    }

    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.classList.add('opacity-80', 'cursor-wait');
    }
    if (spinner) {
      spinner.classList.remove('hidden');
      spinner.classList.add('animate-spin');
    }

    try {
      const response = await apiFetch<ActionResponse>('gudang/masuk', {
        method: 'POST',
        body: JSON.stringify(data)
      });

      if (response.success) {
        showToast(response.message);
        closeModal();
        // Seamless background re-fetch
        loadGudang();
      } else {
        showToast(response.message, true);
      }
    } catch (err) {
      showToast('Gagal memproses barang masuk.', true);
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
  const user = initRBAC('nav-gudang');
  if (!user) return;

  loadGudang();
  setupFilters();
  setupModalInbound();
});
