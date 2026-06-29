/**
 * api.ts — Utility module untuk berkomunikasi dengan backend API.
 * Migrasi dari: Motekar_ERP/frontend/api.js
 *
 * Fitur:
 * - Auto-attach Authorization Bearer token ke setiap request
 * - Auto-redirect ke login page saat mendapat 401
 * - Type-safe getUserData helper
 */

const API_BASE = import.meta.env.VITE_API_URL || 
  (import.meta.env.MODE === 'production' ? '/api' : 'http://127.0.0.1:5050/api');

/** Struktur data user yang disimpan di localStorage setelah login */
export interface UserData {
  id: number;
  username: string;
  nama: string;
  divisi_role: string;
  api_token: string;
  refresh_token?: string;
}

/**
 * Ambil data user dari localStorage.
 * Return null jika belum login atau data corrupt.
 */
export function getUserData(): UserData | null {
  const raw = localStorage.getItem('userData');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserData;
  } catch {
    localStorage.removeItem('userData');
    return null;
  }
}

/**
 * Ambil api_token dari localStorage.
 */
export function getToken(): string | null {
  const user = getUserData();
  return user?.api_token || null;
}

/**
 * Fetch wrapper yang otomatis menambahkan Authorization header
 * dan menghandle 401 Unauthorized.
 *
 * @param endpoint - Path relatif setelah /api/ (contoh: 'dashboard')
 * @param options - Opsi fetch standard (method, body, headers, dll)
 * @returns Parsed JSON response
 */
export async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  // Siapkan headers
  const headers = new Headers(options.headers as HeadersInit | undefined);

  // Jika bukan FormData, set Content-Type ke JSON
  if (!(options.body instanceof FormData)) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  // Tambahkan Bearer token jika tersedia
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  try {
    let response = await fetch(`${API_BASE}/${endpoint}`, {
      ...options,
      headers,
    });

    // Handle 401: Token expired, coba silent refresh
    if (response.status === 401 && endpoint !== 'auth/refresh') {
      const user = getUserData();
      if (user && user.username === 'testing') {
        // Bypass force logout for testing account, return fake data
        return { success: true, data: [], message: 'Data dilindungi (Mode Guest)' } as any;
      }
      
      if (user && user.refresh_token) {
        try {
          const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: user.refresh_token })
          });

          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            // Update token baru di localStorage
            user.api_token = refreshData.data.api_token;
            localStorage.setItem('userData', JSON.stringify(user));

            // Ulangi request asli dengan token baru
            headers.set('Authorization', `Bearer ${user.api_token}`);
            response = await fetch(`${API_BASE}/${endpoint}`, {
              ...options,
              headers,
            });
          } else {
            return forceLogout();
          }
        } catch (error) {
          return forceLogout();
        }
      } else {
        return forceLogout();
      }
    } else if (response.status === 401) {
       const user = getUserData();
       if (user && user.username === 'testing') {
           return { success: true, data: [], message: 'Data dilindungi (Mode Guest)' } as any;
       }
       // Gagal pada saat refresh token itu sendiri
       return forceLogout();
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error('[apiFetch] Error:', error);
    throw error;
  }
}

async function forceLogout(): Promise<never> {
  localStorage.removeItem('userData');
  if (typeof (window as any).Swal !== 'undefined') {
    await (window as any).Swal.fire({
      icon: 'warning',
      title: 'Sesi Berakhir',
      text: 'Sesi Anda telah berakhir atau tidak valid. Silakan login kembali.',
      confirmButtonColor: '#00288e',
      confirmButtonText: 'Login Ulang',
      allowOutsideClick: false
    });
  }
  window.location.href = '/';
  throw new Error('Unauthorized (401)');
}
export interface ReorderAlertItem {
  id: number;
  kode_barang: string;
  nama_barang: string;
  id_vendor?: number;
  nama_vendor?: string;
  jumlah_stok_sekarang: number;
  reorder_point: number;
  minimum_stock: number;
  qty_saran_pesan?: number; 
  satuan: string;
}

export async function getReorderAlerts(): Promise<ReorderAlertItem[]> {
  const response = await apiFetch<{success: boolean, data: ReorderAlertItem[]}>('pengadaan/alerts');
  return response.data;
}

// Global listener to close modals when clicking backdrop
document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('fixed') && target.classList.contains('inset-0') && target.classList.contains('z-50')) {
        const closeBtn = target.querySelector('button[id^="btn-close"]') as HTMLButtonElement;
        if (closeBtn) closeBtn.click();
    }
});
