/**
 * dashboard.ts — Logic untuk halaman Dashboard Utama.
 * Migrasi dari: Motekar_ERP/frontend/script.js → loadDashboard()
 *
 * Fitur:
 * 1. Login guard + RBAC sidebar/header
 * 2. Fetch data dashboard dari API (/api/dashboard)
 * 3. Render 4 KPI cards
 * 4. Render 2 Chart.js charts (Bar + Doughnut)
 * 5. Tombol "Segarkan Data" untuk refresh
 */

import { Chart, BarController, BarElement, CategoryScale, LinearScale, DoughnutController, ArcElement, Tooltip, Legend } from 'chart.js';
import { apiFetch } from '../api.js';
import { initRBAC, showToast } from '../components/rbac.js';

// Register Chart.js components yang diperlukan (tree-shaking friendly)
Chart.register(BarController, BarElement, CategoryScale, LinearScale, DoughnutController, ArcElement, Tooltip, Legend);

// ============================================================
// CHART INSTANCES (agar bisa di-destroy saat refresh)
// ============================================================

let kanbanChartInstance: Chart | null = null;
let stokChartInstance: Chart | null = null;

// ============================================================
// DASHBOARD DATA TYPES
// ============================================================

interface DashboardKPI {
  total_pr: number;
  total_invoice: number;
  job_selesai: number;
  stok_komponen: number;
}

interface ChartItem {
  label: string;
  data: number;
}

interface DashboardCharts {
  kanban_status: ChartItem[];
  stok_kategori: ChartItem[];
}

interface DashboardResponse {
  success: boolean;
  data: {
    kpi: DashboardKPI;
    charts: DashboardCharts;
  };
  message?: string;
}

// ============================================================
// LOAD DASHBOARD DATA
// ============================================================

/**
 * Fetch data dashboard dari backend dan render KPI + Charts.
 */
async function loadDashboard(): Promise<void> {
  try {
    console.log('📊 Fetching dashboard data from /api/dashboard...');
    const response = await apiFetch<DashboardResponse>('dashboard');

    console.log('📊 Dashboard API Response:', response);

    if (!response) {
      console.error('Fetch Dashboard Error: Response is null or undefined');
      showToast('Gagal menghubungi server (response kosong)', true);
      return;
    }

    if (response.success) {
      const kpi = response.data?.kpi;
      const charts = response.data?.charts;

      if (!kpi || !charts) {
        console.error('Fetch Dashboard Error: Missing data structure', { kpi, charts });
        showToast('Data dashboard tidak lengkap', true);
        return;
      }

      console.log('✓ KPI data loaded:', kpi);
      console.log('✓ Chart data loaded:', charts);

      // === Render KPI Cards ===
      renderKPI(kpi);

      // === Render Charts ===
      renderKanbanChart(charts.kanban_status);
      renderStokChart(charts.stok_kategori);

      console.log('✅ Dashboard loaded successfully');
      showToast('Dashboard dimuat berhasil');
    } else {
      console.error('Fetch Dashboard Error: API returned success=false', response);
      showToast('Server error: ' + (response.message || 'Unknown error'), true);
    }
  } catch (err: any) {
    console.error('Fetch Dashboard Error:', err);
    showToast('Gagal menghubungi server — periksa console untuk detail error', true);
  }
}

// ============================================================
// RENDER KPI
// ============================================================

async function loadITDashboard(): Promise<void> {
  try {
    const response = await apiFetch<any>('dashboard/it');
    if (response?.success && response.data) {
      const elUsers = document.getElementById('kpi-it-users');
      if (elUsers) elUsers.innerText = String(response.data.active_users);

      const elSessions = document.getElementById('kpi-it-sessions');
      if (elSessions) elSessions.innerText = String(response.data.login_sessions_24h);
    }
  } catch (err) {
    console.error('Fetch IT Dashboard Error:', err);
  }
}

function renderKPI(kpi: DashboardKPI): void {
  const kpiElements: Record<string, number> = {
    'kpi-pr': kpi.total_pr || 0,
    'kpi-invoice': kpi.total_invoice || 0,
    'kpi-job': kpi.job_selesai || 0,
    'kpi-stok': kpi.stok_komponen || 0,
  };

  Object.entries(kpiElements).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) {
      el.innerText = String(value);
    } else {
      console.warn(`KPI element not found: #${id}`);
    }
  });
}

// ============================================================
// RENDER CHARTS
// ============================================================

function renderKanbanChart(kanbanStatus: ChartItem[]): void {
  const canvas = document.getElementById('kanbanChart') as HTMLCanvasElement | null;
  if (!canvas) {
    console.warn('Kanban chart canvas not found: #kanbanChart');
    return;
  }

  // Destroy previous instance if exists (penting untuk refresh)
  if (kanbanChartInstance) {
    kanbanChartInstance.destroy();
    kanbanChartInstance = null;
  }

  const labels = kanbanStatus.map((item) => item.label);
  const data = kanbanStatus.map((item) => item.data);

  kanbanChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Jumlah Pekerjaan',
          data,
          backgroundColor: '#0f172a',
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
        },
      },
    },
  });

  console.log('✓ Kanban chart rendered');
}

function renderStokChart(stokKategori: ChartItem[]): void {
  const canvas = document.getElementById('stokChart') as HTMLCanvasElement | null;
  if (!canvas) {
    console.warn('Stok chart canvas not found: #stokChart');
    return;
  }

  // Destroy previous instance if exists
  if (stokChartInstance) {
    stokChartInstance.destroy();
    stokChartInstance = null;
  }

  const labels = stokKategori.map((item) => item.label);
  const data = stokKategori.map((item) => item.data);

  stokChartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: ['#1e293b', '#475569', '#94a3b8'],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
      },
    },
  });

  console.log('✓ Stok chart rendered');
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // 1. Login guard + RBAC (sidebar, header, logout, hamburger)
  const user = initRBAC('dashboard');
  if (!user) return; // User belum login, sudah di-redirect

  const dashOps = document.getElementById('dashboard-operasional');
  const dashIT = document.getElementById('dashboard-it-support');

  // 2. Load dashboard data based on role
  if (user.divisi_role === 'IT Support') {
    if (dashOps) dashOps.classList.add('hidden');
    if (dashIT) dashIT.classList.remove('hidden');
    loadITDashboard();
  } else {
    if (dashOps) dashOps.classList.remove('hidden');
    if (dashIT) dashIT.classList.add('hidden');
    loadDashboard();
  }

  // 3. Tombol "Segarkan Data"
  const refreshBtn = document.getElementById('btn-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      if (user.divisi_role === 'IT Support') {
        loadITDashboard();
      } else {
        loadDashboard();
      }
    });
  }
});
