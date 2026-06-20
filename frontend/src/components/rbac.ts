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
  'Penjualan & Penagihan': 'Penjualan & Penagihan',
  'Operasi Inti': 'Operasi Inti',
  'Pemasaran': 'Pemasaran',
  'Gudang': 'Gudang',
  'Owner': 'Owner',
  'Admin': 'Admin',
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
  { id: 'nav-pengadaan',  label: 'Pengadaan',              icon: 'shopping_cart',    href: '/pengadaan.html', allowedRoles: ['Owner', 'Admin', 'Pengadaan'] },
  { id: 'nav-mutu',       label: 'Kendali Mutu',           icon: 'fact_check',       href: '/mutu.html',      allowedRoles: ['Owner', 'Admin', 'Kendali Mutu'] },
  { id: 'nav-penjualan',  label: 'Penjualan & Penagihan',  icon: 'receipt_long',     href: '/penjualan.html', allowedRoles: ['Owner', 'Admin', 'Penjualan & Penagihan'] },
  { id: 'nav-operasi',    label: 'Operasi Inti',           icon: 'settings_suggest', href: '/operasi.html',   allowedRoles: ['Owner', 'Admin', 'Operasi Inti'] },
  { id: 'nav-pemasaran',  label: 'Pemasaran',              icon: 'group',            href: '/pemasaran.html', allowedRoles: ['Owner', 'Admin', 'Pemasaran'] },
  { id: 'nav-inventori',  label: 'Gudang',                 icon: 'inventory_2',      href: '/gudang.html',    allowedRoles: ['Owner', 'Admin', 'Gudang'] },
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
    dashboardBtn.className = 'nav-item flex items-center gap-3 px-3 py-2.5 rounded transition-colors whitespace-nowrap overflow-hidden text-slate-600 hover:bg-slate-50 hover:text-slate-900';
    dashboardBtn.innerHTML = `
      <span class="material-symbols-outlined shrink-0">dashboard</span>
      <span class="text-sm menu-text font-medium">Dashboard</span>
    `;
  }
  navContainer.appendChild(dashboardBtn);

  // === 2. Menu modul (hanya tampil jika role diizinkan) ===
  MENU_ITEMS.forEach((menu) => {
    if (!menu.allowedRoles.includes(role)) return;

    // Remove leading slash for includes check
    const hrefCheck = menu.href ? menu.href.replace('/', '') : '';
    const isActive = hrefCheck !== '' && currentPath.includes(hrefCheck);
    
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
      btn.className = 'nav-item flex items-center gap-3 px-3 py-2.5 rounded transition-colors whitespace-nowrap overflow-hidden text-slate-600 hover:bg-slate-50 hover:text-slate-900';
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
 * Render informasi profil user di header (nama, role, inisial).
 */
export function renderHeaderProfile(): void {
  const user = getUserData();
  if (!user) return;

  const role = user.divisi_role;
  const roleLabel = getRoleLabel(role);

  const headerName = document.getElementById('header-nama');
  const headerRole = document.getElementById('header-role');
  const headerInitial = document.getElementById('header-inisial');

  if (headerName) headerName.innerText = user.nama || user.username || 'Pengguna';
  if (headerRole) headerRole.innerText = `${roleLabel} Division`;
  if (headerInitial) {
    headerInitial.innerText = user.nama
      ? user.nama.charAt(0).toUpperCase()
      : 'U';
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
export function showToast(message: string, isError: boolean = false): void {
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

  toastTimeout = setTimeout(() => {
    toast.classList.remove('show', 'opacity-100');
    toast.classList.add('opacity-0');
  }, 3500);
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

  renderSidebar(currentPage);
  renderHeaderProfile();
  setupSidebarToggle();
  setupLogout();

  return user;
}
