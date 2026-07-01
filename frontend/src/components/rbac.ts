/**
 * rbac.ts — Module Role-Based Access Control untuk sidebar dan header.
 * Migrasi dari: Motekar_ERP/frontend/script.js (renderSidebarAndProfile, getAllowedNavIds, dll.)
 *
 * Fitur:
 * - Login guard: redirect ke login page jika belum login
 * - Render sidebar navigation sesuai role user
 * - Render header profile (nama, role, inisial)
 * - Sidebar toggle (hamburger)
 * - Logout handler
 */

import { getUserData, type UserData } from '../api.js';

// ============================================================
// KONFIGURASI ROLE & MENU
// ============================================================

/**
 * Map dari kode divisi_role (persis dari database MySQL) ke label display.
 * Nilai divisi_role di DB: 'Pengadaan', 'Kendali Mutu', 'Penjualan & Penagihan',
 * 'Operasi Inti', 'Pemasaran', 'Gudang', 'Admin', 'Owner'.
 */
const ROLE_LABELS: Record<string, string> = {
  'Pengadaan': 'Pengadaan',
  'Kendali Mutu': 'Kendali Mutu',
  'Pemasaran & Penjualan': 'Pemasaran & Penjualan',
  'Keuangan & Akuntansi': 'Keuangan & Akuntansi',
  'Operasi Inti': 'Operasi Inti',
  'Gudang': 'Gudang',
  'Owner': 'Owner',
  'General Manager': 'General Manager',
  'IT Support': 'IT Support',
  'Legal & Kepatuhan': 'Legal & Kepatuhan',
};

/** Konfigurasi menu sidebar */
interface MenuConfig {
  id: string;
  label: string;
  icon: string;
  href?: string;
  allowedRoles: string[];
}

const MENU_ITEMS: MenuConfig[] = [
  { id: 'nav-pengadaan',  label: 'Pengadaan',              icon: 'shopping_cart',    href: '/pengadaan.html', allowedRoles: ['Owner', 'General Manager', 'Pengadaan'] },
  { id: 'nav-po',         label: 'Purchase Order (PO)',    icon: 'request_quote',    href: '/po.html',        allowedRoles: ['Owner', 'General Manager', 'Pengadaan'] },
  { id: 'nav-mutu',       label: 'Kendali Mutu',           icon: 'fact_check',       href: '/mutu.html',      allowedRoles: ['Owner', 'General Manager', 'Kendali Mutu'] },
  { id: 'nav-penjualan',  label: 'Penjualan & Penagihan',  icon: 'receipt_long',     href: '/penjualan.html', allowedRoles: ['Owner', 'General Manager', 'Pemasaran & Penjualan'] },
  { id: 'nav-keuangan',   label: 'Buku Besar Keuangan',    icon: 'account_balance',  href: '/keuangan.html',  allowedRoles: ['Owner', 'General Manager', 'Keuangan & Akuntansi'] },
  { id: 'nav-operasi',    label: 'Operasi Inti',           icon: 'settings_suggest', href: '/operasi.html',   allowedRoles: ['Owner', 'General Manager', 'Operasi Inti'] },
  { id: 'nav-pemasaran',  label: 'Pemasaran',              icon: 'group',            href: '/pemasaran.html', allowedRoles: ['Owner', 'General Manager', 'Pemasaran & Penjualan'] },
  { id: 'nav-crm',        label: 'CRM & After-Sales',      icon: 'support_agent',    href: '/crm.html',       allowedRoles: ['Owner', 'General Manager', 'Pemasaran & Penjualan'] },
  { id: 'nav-inventori',  label: 'Gudang',                 icon: 'inventory_2',      href: '/gudang.html',    allowedRoles: ['Owner', 'General Manager', 'Gudang'] },
  
  // Menu Khusus IT Support & Owner & General Manager
  { id: 'nav-users',      label: 'Manajemen Pengguna',     icon: 'manage_accounts',  href: '/users.html', allowedRoles: ['Owner', 'General Manager', 'IT Support'] },
  { id: 'nav-profil',     label: 'Profil / Log Sistem',    icon: 'admin_panel_settings', href: '/profil.html',   allowedRoles: ['Owner', 'General Manager', 'IT Support', 'Legal & Kepatuhan'] },
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Konversi kode role ke label yang lebih readable.
 */
export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] || role || 'User';
}

/**
 * Login guard: cek apakah user sudah login.
 * Jika belum, redirect ke login page (index.html / root).
 * @returns UserData jika sudah login, null jika di-redirect
 */
export function requireLogin(): UserData | null {
  const user = getUserData();
  if (!user) {
    window.location.href = '/';
    return null;
  }
  return user;
}

// ============================================================
// SIDEBAR RENDERING
// ============================================================

/**
 * Render sidebar navigation berdasarkan role user.
 * Menggunakan window.location.pathname untuk deteksi active state (MEDS-compliant).
 */
export function renderSidebar(currentPage: string = 'dashboard'): void {
  const user = getUserData();
  if (!user) return;

  const navContainer = document.getElementById('sidebar-nav');
  if (!navContainer) return;

  const role = user.divisi_role;
  const currentPath = window.location.pathname;

  // Clear existing nav items
  navContainer.innerHTML = '';

  // === 1. Dashboard button ===
  const isDashboardActive = currentPath.includes('dashboard.html') || currentPath === '/' || currentPath === '/index.html' && user;
  const dashboardBtn = document.createElement('a');
  dashboardBtn.href = '/dashboard.html';
  
  if (isDashboardActive) {
    dashboardBtn.className = 'nav-item flex items-center gap-3 px-3 py-2.5 rounded transition-colors whitespace-nowrap overflow-hidden bg-slate-100 text-slate-900 font-semibold';
    dashboardBtn.innerHTML = `
      <span class="material-symbols-outlined text-slate-900 shrink-0" style="font-variation-settings: 'FILL' 1;">dashboard</span>
      <span class="text-sm menu-text">Dashboard</span>
    `;
  } else {
    dashboardBtn.className = 'nav-item flex items-center gap-3 px-3 py-2.5 rounded transition-colors whitespace-nowrap overflow-hidden text-slate-600 hover:bg-slate-100 hover:text-slate-900';
    dashboardBtn.innerHTML = `
      <span class="material-symbols-outlined shrink-0">dashboard</span>
      <span class="text-sm menu-text font-medium">Dashboard</span>
    `;
  }
  navContainer.appendChild(dashboardBtn);

  // === 2. Menu modul (hanya tampil jika role diizinkan) ===
  MENU_ITEMS.forEach((menu) => {
    if (!menu.allowedRoles.includes(role)) return;

    // Remove leading slash and .html for includes check to support extensionless URLs
    const baseHref = menu.href ? menu.href.replace('/', '').replace('.html', '') : '';
    const isActive = baseHref !== '' && (currentPath.includes(baseHref + '.html') || currentPath.endsWith('/' + baseHref) || currentPath === '/' + baseHref);
    
    const btn = document.createElement('a');
    btn.id = menu.id;
    if (menu.href) {
      btn.href = menu.href;
    }

    if (isActive) {
      btn.className = 'nav-item flex items-center gap-3 px-3 py-2.5 rounded transition-colors whitespace-nowrap overflow-hidden bg-slate-100 text-slate-900 font-semibold';
      btn.innerHTML = `
        <span class="material-symbols-outlined text-slate-900 shrink-0" style="font-variation-settings: 'FILL' 1;">${menu.icon}</span>
        <span class="text-sm menu-text">${menu.label}</span>
      `;
    } else {
      btn.className = 'nav-item flex items-center gap-3 px-3 py-2.5 rounded transition-colors whitespace-nowrap overflow-hidden text-slate-600 hover:bg-slate-100 hover:text-slate-900';
      btn.innerHTML = `
        <span class="material-symbols-outlined shrink-0">${menu.icon}</span>
        <span class="text-sm menu-text font-medium">${menu.label}</span>
      `;
    }

    navContainer.appendChild(btn);
  });
}

// ============================================================
// HEADER PROFILE RENDERING
// ============================================================

/**
 * Menghasilkan inisial profesional dari nama lengkap.
 * Aturan:
 * - Ganti _ dan - dengan spasi
 * - ≥2 kata: huruf pertama kata-1 + huruf pertama kata-2
 * - 1 kata: 2 huruf pertama
 * - Selalu uppercase, max 2 karakter
 */
export function getProfessionalInitials(fullName: string): string {
  if (!fullName || fullName.trim().length === 0) return '??';
  
  // Custom rule khusus untuk divisi IT agar tidak menjadi "I&"
  if (fullName === 'IT & System Administrator' || fullName.toUpperCase().startsWith('IT ')) {
    return 'IT';
  }

  const cleaned = fullName.replace(/[_-]/g, ' ').trim();
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  let initials: string;
  if (words.length >= 2) {
    initials = words[0][0] + words[1][0];
  } else {
    initials = words[0].substring(0, 2);
  }
  return initials.toUpperCase().substring(0, 2);
}

/**
 * Render informasi profil user di header (nama, role, inisial).
 */
export function renderHeaderProfile(): void {
  const user = getUserData();
  if (!user) return;

  const role = user.divisi_role;
  let displayRole = role;
  if (user.username === 'testing') {
    displayRole = 'Testing / Guest';
  } else if (role === 'Owner') {
    displayRole = 'Pemilik Perusahaan';
  } else if (role === 'General Manager') {
    displayRole = 'Manajer Umum';
  } else if (role === 'IT Support' || role === 'Admin') {
    displayRole = 'Administrator Sistem';
  } else {
    displayRole = `Divisi ${role}`;
  }

  const headerName = document.getElementById('header-nama');
  const headerRole = document.getElementById('header-role');
  const headerInitial = document.getElementById('header-inisial');

  if (headerName) headerName.innerText = user.nama || user.username || 'Pengguna';
  if (headerRole) headerRole.innerText = displayRole;
  if (headerInitial) {
    headerInitial.innerText = getProfessionalInitials(user.nama || user.username || 'Pengguna');
    
    // Terapkan styling seragam (Gelap + Amber) untuk semua halaman
    const parentContainer = headerInitial.parentElement;
    if (parentContainer) {
      parentContainer.className = "w-10 h-10 rounded-full border-2 border-amber-400 bg-slate-800 flex items-center justify-center text-amber-400 font-bold shadow-sm overflow-hidden";
    }
  }
}

// ============================================================
// SIDEBAR TOGGLE & LOGOUT
// ============================================================

/**
 * Setup event listener untuk tombol hamburger (sidebar toggle).
 */
export function setupSidebarToggle(): void {
  const hamburgerBtn = document.getElementById('btn-hamburger');
  if (hamburgerBtn) {
    hamburgerBtn.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      if (sidebar) {
        sidebar.classList.toggle('-ml-sidebar-width');
      }
    });
  }
}

/**
 * Setup event listener untuk tombol logout.
 */
export function setupLogout(): void {
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('userData');
      window.location.href = '/';
    });
  }
}

// ============================================================
// TOAST NOTIFICATION
// ============================================================

let toastTimeout: ReturnType<typeof setTimeout>;

/**
 * Tampilkan toast notification.
 *
 * @param message - Pesan yang akan ditampilkan
 * @param isError - Apakah toast ini untuk error (warna merah)
 */
export function showToast(message: string, isError: boolean = false, customDuration?: number): void {
  const toast = document.getElementById('toast');
  if (!toast) return;

  const msgSpan = document.getElementById('toast-message');
  const iconSpan = document.getElementById('toast-icon');

  clearTimeout(toastTimeout);

  if (msgSpan) msgSpan.innerText = message;

  if (isError) {
    toast.classList.remove('bg-inverse-surface', 'text-inverse-on-surface');
    toast.classList.add('bg-error', 'text-on-error');
    if (iconSpan) {
      iconSpan.innerText = 'error';
      iconSpan.classList.remove('text-tertiary-fixed');
      iconSpan.classList.add('text-on-error');
    }
  } else {
    toast.classList.remove('bg-error', 'text-on-error');
    toast.classList.add('bg-inverse-surface', 'text-inverse-on-surface');
    if (iconSpan) {
      iconSpan.innerText = 'check_circle';
      iconSpan.classList.remove('text-on-error');
      iconSpan.classList.add('text-tertiary-fixed');
    }
  }

  toast.classList.add('show');
  toast.classList.remove('opacity-0');
  toast.classList.add('opacity-100');

  const duration = customDuration || 3500;
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show', 'opacity-100');
    toast.classList.add('opacity-0');
  }, duration);
}

// ============================================================
// CUSTOM CONFIRM MODAL (GLOBAL)
// ============================================================

/**
 * Menampilkan Custom Confirm Dialog secara global.
 * @param title Judul modal
 * @param message Pesan konfirmasi
 * @param onConfirm Callback jika tombol Konfirmasi diklik
 */
export function showConfirm(title: string, message: string, onConfirm: () => void, type: 'danger' | 'success' | 'warning' = 'danger'): void {
  // Buat element container
  const container = document.createElement('div');
  container.id = 'custom-confirm-modal';
  container.className = 'fixed inset-0 z-[100] flex items-center justify-center';
  
  let icon = 'warning';
  let iconBg = 'bg-rose-50 text-rose-500';
  let btnColor = 'bg-rose-600 hover:bg-rose-700';

  if (type === 'success') {
      icon = 'check_circle';
      iconBg = 'bg-emerald-50 text-emerald-500';
      btnColor = 'bg-emerald-600 hover:bg-emerald-700';
  } else if (type === 'warning') {
      icon = 'info';
      iconBg = 'bg-amber-50 text-amber-500';
      btnColor = 'bg-amber-600 hover:bg-amber-700';
  }

  container.innerHTML = `
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity opacity-0" id="cc-backdrop"></div>
    
    <!-- Modal Dialog -->
    <div class="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 flex flex-col items-center transform scale-95 opacity-0 transition-all duration-300" id="cc-dialog">
      <div class="w-12 h-12 rounded-full ${iconBg} flex items-center justify-center mb-4">
        <span class="material-symbols-outlined text-[28px]">${icon}</span>
      </div>
      <h3 class="text-lg font-bold text-slate-800 mb-2 text-center">${title}</h3>
      <p class="text-sm text-slate-500 text-center mb-6">${message}</p>
      
      <div class="flex gap-3 w-full">
        <button id="cc-btn-cancel" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg font-bold text-sm transition-colors">
          Batal
        </button>
        <button id="cc-btn-confirm" class="flex-1 ${btnColor} text-white px-4 py-2.5 rounded-lg font-bold text-sm shadow-sm transition-colors">
          Ya, Lanjutkan
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(container);

  const backdrop = container.querySelector('#cc-backdrop') as HTMLElement;
  const dialog = container.querySelector('#cc-dialog') as HTMLElement;
  const btnCancel = container.querySelector('#cc-btn-cancel') as HTMLButtonElement;
  const btnConfirm = container.querySelector('#cc-btn-confirm') as HTMLButtonElement;

  // Trigger anim in next frame
  requestAnimationFrame(() => {
    backdrop.classList.remove('opacity-0');
    dialog.classList.remove('scale-95', 'opacity-0');
  });

  const closeDialog = () => {
    backdrop.classList.add('opacity-0');
    dialog.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
    }, 300);
  };

  btnCancel.addEventListener('click', closeDialog);
  backdrop.addEventListener('click', closeDialog);
  
  btnConfirm.addEventListener('click', () => {
    closeDialog();
    onConfirm();
  });
}

// ============================================================
// INIT ALL (convenience function)
// ============================================================

/**
 * Inisialisasi semua komponen RBAC sekaligus.
 * Panggil ini di DOMContentLoaded pada setiap halaman yang memerlukan autentikasi.
 *
 * @param currentPage - Identifier halaman aktif ('dashboard', 'inventory', dll.)
 * @returns UserData jika login valid, null jika di-redirect ke login
 */
export function initRBAC(currentPage: string = 'dashboard'): UserData | null {
  const user = requireLogin();
  if (!user) return null;

  // ============================================================
  // HARD-GUARD: URL Address Bar Interceptor
  // ============================================================
  const currentPath = window.location.pathname;
  
  // IT Support Blinder Check
  if (user.divisi_role === 'IT Support') {
    // IT Support HANYA boleh mengakses /profil.html, /dashboard.html, /index.html (atau root /), dan /users.html
    const allowedITPaths = ['/profil.html', '/dashboard.html', '/index.html', '/', '/users.html'];
    
    const isAllowed = allowedITPaths.some(p => currentPath === p || currentPath.endsWith(p));
    
    if (!isAllowed) {
      console.warn('[SECURITY] IT Support mencoba mengakses halaman operasional:', currentPath);
      // HARD-REDIRECT: Lempar kembali ke halaman Profil
      window.location.href = '/profil.html';
      return null;
    }
  }

  // Jika Owner/Divisi lain iseng masuk halaman yang tak diizinkan dari MENU_ITEMS (Opsional)
  // Untuk saat ini hanya fokus hard-guard IT Support.

  renderSidebar(currentPage);
  renderHeaderProfile();
  setupSidebarToggle();
  setupLogout();

  // ============================================================
  // TESTING ACCOUNT INTERCEPTOR
  // ============================================================
  if (user.username === 'testing') {
      document.body.classList.add('is-testing-account');
      
      const style = document.createElement('style');
      style.innerHTML = `
          .is-testing-account button:not([id*="btn-hamburger"]):not([id*="btn-logout"]):not([onclick*="print"]):not([onclick*="openPrintWindow"]):not([onclick*="Cetak"]):not([id^="tab-"]):not(.filter-btn):not([onclick*="Page"]):not(.nav-item):not(.btn-pagination):not([id*="cancel"]):not([id*="close"]):not([id*="batal"]):not([onclick*="close"]):not([class*="close"]),
          .is-testing-account input[type="submit"]:not([id*="cancel"]):not([id*="close"]):not([id*="batal"]),
          .is-testing-account input[type="button"]:not([id*="cancel"]):not([id*="close"]):not([id*="batal"]) {
              cursor: not-allowed !important;
          }
      `;
      document.head.appendChild(style);

      document.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          const button = target.closest('button, input[type="submit"], input[type="button"]');
          
          if (button) {
              const htmlStr = button.outerHTML;
              const isAllowed = 
                htmlStr.includes('btn-hamburger') || 
                htmlStr.includes('btn-logout') || 
                htmlStr.includes('print') || 
                htmlStr.includes('openPrintWindow') || 
                htmlStr.includes('Cetak') ||
                htmlStr.includes('filter-btn') ||
                button.hasAttribute('data-filter') ||
                (button.id && button.id.startsWith('tab-')) ||
                htmlStr.includes('Page') ||
                htmlStr.includes('nav-item') ||
                htmlStr.includes('btn-pagination') ||
                htmlStr.toLowerCase().includes('cancel') ||
                htmlStr.toLowerCase().includes('close') ||
                htmlStr.toLowerCase().includes('batal');
              
              if (!isAllowed) {
                  e.preventDefault();
                  e.stopPropagation();
                  showToast('Akun Testing (Guest) tidak memiliki izin untuk melakukan aksi ini.', true);
              }
          }
      }, true); // Gunakan capture phase agar dijalankan sebelum event listener lainnya
  }

  return user;
}

