import { initRBAC } from '../components/rbac.js';
import { apiFetch, getUserData } from '../api.js';
import { renderPaginationUI } from '../utils/pagination.js';

interface SODetail {
    id: number;
    id_inventory_barang_jadi: number;
    qty: number;
    harga_satuan: string;
    subtotal: string;
    status_item: 'TERSEDIA' | 'DEFISIT';
    id_wo_terkait: number | null;
    hpp_satuan_tercatat: string | null;
    nama_barang: string;
    kode_barang: string;
    satuan: string;
}

interface SOHeader {
    id: number;
    nomor_so: string;
    nama_customer: string;
    alamat_pengiriman: string;
    tanggal_target_kirim: string;
    status_so: 'DRAFT' | 'RESERVED' | 'UNPAID' | 'SHIPPED' | 'DELIVERED' | 'PAID' | 'COMPLETED' | 'BACKORDER' | 'FAILED_DELIVERY';
    total_nilai: string;
    biaya_pengiriman: string;
    catatan: string;
    created_at: string;
    items: SODetail[];
}

let allSOs: SOHeader[] = [];
let currentOpenedSO: SOHeader | null = null;
let fgItems: any[] = []; // Finished Goods from inventory

let currentPage = 1;
const itemsPerPage = 10;

declare namespace google {
    export namespace maps {
        export namespace places {
            export class Autocomplete {
                constructor(inputField: HTMLInputElement, opts?: any);
                addListener(eventName: string, handler: Function): void;
                getPlace(): any;
            }
        }
    }
}

// Global callback for Google Maps authentication failure
(window as any).gm_authFailure = () => {
    console.error('Google Maps Auth Failure');
    showToast('API Key Google Maps ditolak. Tunggu propagasi 5-15 menit atau pastikan Places API telah di-Enable di Google Cloud Console.', 'error');
};

function showToast(message: string, type: 'success' | 'error' = 'success') {
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toast-icon');
    const toastMessage = document.getElementById('toast-message');
    
    if (!toast || !toastIcon || !toastMessage) return;

    toastMessage.textContent = message;
    
    if (type === 'success') {
        toastIcon.textContent = 'check_circle';
        toastIcon.className = 'material-symbols-outlined text-emerald-400';
    } else {
        toastIcon.textContent = 'error';
        toastIcon.className = 'material-symbols-outlined text-rose-400';
    }

    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

const formatRupiah = (number: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
};

const formatIndoNumber = (numStr: string | number) => {
    const num = Math.round(parseFloat(String(numStr)));
    if (isNaN(num)) return '';
    return new Intl.NumberFormat('id-ID').format(num);
};


function fillPrintSO(so: any) {
    const elMitra = document.getElementById('pdf-so-mitra');
    const elAlamat = document.getElementById('pdf-so-alamat');
    const elNo = document.getElementById('pdf-so-no');
    const elTgl = document.getElementById('pdf-so-tgl');
    const elStatus = document.getElementById('pdf-so-status');
    const elTbody = document.getElementById('pdf-so-tbody');
    const elGrandTotal = document.getElementById('pdf-so-grand-total');

    if (elMitra) elMitra.textContent = so.nama_customer || '-';
    if (elAlamat) elAlamat.textContent = so.alamat_pengiriman || '-';
    if (elNo) elNo.textContent = so.nomor_so;
    if (elTgl) elTgl.textContent = new Date(so.created_at).toLocaleDateString('id-ID');
    if (elStatus) elStatus.textContent = so.status_so;
    if (elGrandTotal) elGrandTotal.textContent = formatRupiah(parseFloat(so.total_nilai));

    if (elTbody && so.items) {
        elTbody.innerHTML = '';
        so.items.forEach((item: any, idx: number) => {
            elTbody.innerHTML += `
                <tr>
                    <td class="py-4 px-2 font-medium">${idx + 1}</td>
                    <td class="py-4 px-2 font-bold text-slate-900">${item.nama_barang}</td>
                    <td class="py-4 px-2 text-center font-bold">${item.qty} ${item.satuan}</td>
                    <td class="py-4 px-2 text-right font-data-mono">${formatRupiah(parseFloat(item.harga_satuan))}</td>
                    <td class="py-4 px-2 text-right font-data-mono font-bold text-slate-900">${formatRupiah(parseFloat(item.total_harga))}</td>
                </tr>
            `;
        });
    }
}

// ============================================================
// 1. DATA TABLE & DISPENSER
// ============================================================
async function loadSOs() {
    try {
        const response = await apiFetch<{ success: boolean; data: SOHeader[] }>('penjualan/so');
        if (!response.success) throw new Error('Gagal mengambil data SO');
        
        allSOs = response.data;
        renderTable();
        updateKPIs();
    } catch (error) {
        // Mock fallback if API not ready
        console.warn('API not ready, using empty state');
        allSOs = [];
        renderTable();
        updateKPIs();
    }
}

function updateKPIs() {
    const totalAktif = allSOs.filter(s => s.status_so !== 'COMPLETED' && s.status_so !== 'DRAFT').length;
    const unpaid = allSOs.filter(s => s.status_so === 'UNPAID').length;
    const selesai = allSOs.filter(s => s.status_so === 'COMPLETED').length;

    document.getElementById('kpi-total')!.textContent = totalAktif.toString();
    document.getElementById('kpi-unpaid')!.textContent = unpaid.toString();
    document.getElementById('kpi-selesai')!.textContent = selesai.toString();

    // Failed Delivery Banner Logic
    const failedDeliveries = allSOs.filter(s => s.status_so === 'FAILED_DELIVERY');
    const alertBanner = document.getElementById('alert-failed-delivery');
    const alertCount = document.getElementById('count-failed-delivery');
    if (alertBanner && alertCount) {
        if (failedDeliveries.length > 0) {
            alertCount.textContent = failedDeliveries.length.toString();
            alertBanner.classList.remove('hidden');
        } else {
            alertBanner.classList.add('hidden');
        }
    }
}

function renderTable() {
    const tbody = document.getElementById('so-table-body')!;
    tbody.innerHTML = '';

    if (allSOs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400 italic font-medium">Belum ada Sales Order</td></tr>`;
    renderPaginationUI('penjualan-pagination-pagination', 'penjualan-pagination-info', 1, 10, 0, () => {});
        return;
    }

    const totalItems = allSOs.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    const currentItems = allSOs.slice(startIndex, endIndex);

    currentItems.forEach(so => {
        const dateStr = new Date(so.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-100 transition-colors duration-150 text-xs font-medium text-slate-600 group cursor-pointer';
        tr.onclick = () => openRightDrawerSO(so);

        let badgeClass = 'bg-slate-100 text-slate-600';
        let statusLabel: string = so.status_so;
        
        if (so.status_so === 'RESERVED') { badgeClass = 'bg-indigo-100 text-indigo-700'; statusLabel = 'Reserved'; }
        if (so.status_so === 'UNPAID') { badgeClass = 'bg-amber-100 text-amber-700'; statusLabel = 'Menunggu Pembayaran'; }
        if (so.status_so === 'PAID') { badgeClass = 'bg-blue-100 text-blue-700'; statusLabel = 'Lunas'; }
        if (so.status_so === 'COMPLETED') { badgeClass = 'bg-emerald-100 text-emerald-700 border border-emerald-200/80'; statusLabel = 'Selesai'; }
        if (so.status_so === 'BACKORDER') { badgeClass = 'bg-rose-100 text-rose-700'; statusLabel = 'Backorder (Defisit)'; }
        if (so.status_so === 'DRAFT') { statusLabel = 'Draf'; }
        if (so.status_so === 'FAILED_DELIVERY') { badgeClass = 'bg-rose-100 text-rose-700 border border-rose-300 font-black'; statusLabel = 'Gagal Kirim'; }

        let materialText = '-';
        let jumlahText = '-';
        
        if (so.items && so.items.length > 0) {
            const firstItem = so.items[0];
            materialText = firstItem.nama_barang;
            jumlahText = `${firstItem.qty} ${firstItem.satuan}`;
            
            if (so.items.length > 1) {
                materialText += ` <span class="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded ml-1 font-bold">+${so.items.length - 1} lain</span>`;
                const totalQty = so.items.reduce((sum: number, item: any) => sum + parseInt(item.qty), 0);
                jumlahText = `<span class="border-b border-dashed border-slate-400 cursor-help" title="Total dari ${so.items.length} jenis material">${totalQty} items</span>`;
            }
        }

        tr.innerHTML = `
            <td class="px-4 py-3 whitespace-nowrap">
                <p class="font-bold text-blue-700 group-hover:underline">${so.nomor_so}</p>
            </td>
            <td class="px-4 py-3 text-slate-500 whitespace-nowrap">${dateStr}</td>
            <td class="px-4 py-3">
                <p class="font-semibold text-slate-800">${so.nama_customer}</p>
            </td>
            <td class="px-4 py-3">
                <p class="font-semibold text-slate-800">${materialText}</p>
            </td>
            <td class="px-4 py-3 text-right">
                <p class="font-data-mono font-bold text-slate-700">${jumlahText}</p>
            </td>
            <td class="px-4 py-3 text-right">
                <p class="font-data-mono font-bold text-slate-800">${formatRupiah(parseFloat(so.total_nilai))}</p>
            </td>
            <td class="px-4 py-3 text-center">
                <span class="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide ${badgeClass}">${statusLabel}</span>
            </td>
        `;
        tbody.appendChild(tr);
    });
    renderPaginationUI(
        'penjualan-pagination-pagination',
        'penjualan-pagination-info',
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
// 2. RIGHT DRAWER (DEEP DIVE INSPECTOR)
// ============================================================
function openRightDrawerSO(so: SOHeader) {
    currentOpenedSO = so;
    const drawer = document.getElementById('right-drawer')!;
    const backdrop = document.getElementById('right-drawer-backdrop');
    if (!drawer || !backdrop) return;

    // Set Header Info
    document.getElementById('drawer-so-id')!.textContent = so.nomor_so;
    
    let statusLabelDrawer: string = so.status_so;
    let badgeColorClass = 'bg-slate-500';
    if (so.status_so === 'RESERVED') { statusLabelDrawer = 'Reserved'; badgeColorClass = 'bg-indigo-500'; }
    if (so.status_so === 'UNPAID') { statusLabelDrawer = 'Menunggu Pembayaran'; badgeColorClass = 'bg-amber-500'; }
    if (so.status_so === 'PAID') { statusLabelDrawer = 'Lunas'; badgeColorClass = 'bg-blue-500'; }
    if (so.status_so === 'COMPLETED') { statusLabelDrawer = 'Selesai'; badgeColorClass = 'bg-emerald-500'; }
    if (so.status_so === 'BACKORDER') { statusLabelDrawer = 'Backorder (Defisit)'; badgeColorClass = 'bg-rose-500'; }
    if (so.status_so === 'FAILED_DELIVERY') { statusLabelDrawer = 'Gagal Kirim'; badgeColorClass = 'bg-rose-600'; }

    document.getElementById('drawer-so-status')!.textContent = statusLabelDrawer;
    document.getElementById('drawer-status-dot')!.className = `w-2 h-2 rounded-full ${badgeColorClass}`;

    document.getElementById('drawer-customer-name')!.textContent = so.nama_customer;
    document.getElementById('drawer-customer-address')!.textContent = so.alamat_pengiriman;
    
    const targetDate = new Date(so.tanggal_target_kirim);
    document.getElementById('drawer-target-date')!.textContent = targetDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    
    const catNode = document.getElementById('drawer-catatan')!;
    if (so.catatan) {
        catNode.textContent = so.catatan;
        catNode.classList.remove('italic', 'text-slate-400');
    } else {
        catNode.textContent = 'Tidak ada catatan';
        catNode.classList.add('italic', 'text-slate-400');
    }

    const tbody = document.getElementById('drawer-items-list')!;
    const tfootTotal = document.getElementById('drawer-total-nilai')!;
    
    let hasDefisit = false;
    let totalHpp = 0;

    if (so.items && so.items.length > 0) {
        let totalNilai = 0;
        tbody.innerHTML = so.items.map((item: any) => {
            const subtotal = parseFloat(item.subtotal || 0);
            totalNilai += subtotal;
            totalHpp += (parseInt(item.qty) * parseFloat(item.hpp_satuan_tercatat || '0'));
            
            const isDefisit = item.status_item === 'DEFISIT';
            if (isDefisit) hasDefisit = true;

            const statusBadge = isDefisit 
                ? '<span class="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold ml-2">DEFISIT</span>'
                : '<span class="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold ml-2">TERSEDIA</span>';

            return `
            <tr class="hover:bg-slate-100 transition-colors">
                <td class="py-3 px-3">
                    <p class="font-bold text-slate-800">${item.nama_barang} ${statusBadge}</p>
                    <p class="text-[10px] text-slate-500 font-data-mono mt-0.5">${item.kode_barang}</p>
                </td>
                <td class="py-3 px-3 text-right">
                    <span class="font-bold text-slate-800">${item.qty}</span>
                    <span class="text-slate-500 ml-1">${item.satuan}</span>
                </td>
                <td class="py-3 px-3 text-right">
                    <span class="font-data-mono font-bold text-slate-900">${formatRupiah(subtotal)}</span>
                </td>
            </tr>
            `;
        }).join('');
        
        const ongkir = parseFloat(so.biaya_pengiriman || '0');
        document.getElementById('drawer-subtotal')!.textContent = formatRupiah(totalNilai);
        document.getElementById('drawer-ongkir')!.textContent = formatRupiah(ongkir);
        tfootTotal.textContent = formatRupiah(parseFloat(so.total_nilai));

        const user = getUserData();
        const profitBadge = document.getElementById('drawer-profit-badge')!;
        if (user && (user.divisi_role === 'Owner' || user.divisi_role === 'General Manager')) {
            profitBadge.classList.remove('hidden');
            document.getElementById('drawer-profit-value')!.textContent = formatRupiah(totalNilai - totalHpp);
        } else {
            profitBadge.classList.add('hidden');
        }

    } else {
        tbody.innerHTML = '<tr><td colspan="3" class="py-4 text-center text-slate-500 italic">Tidak ada rincian pesanan</td></tr>';
        document.getElementById('drawer-subtotal')!.textContent = 'Rp 0';
        document.getElementById('drawer-ongkir')!.textContent = 'Rp 0';
        tfootTotal.textContent = 'Rp 0';
        document.getElementById('drawer-profit-badge')!.classList.add('hidden');
    }

    // Toggle Defisit Alert
    const alertDefisit = document.getElementById('drawer-defisit-alert')!;
    if (so.status_so === 'BACKORDER' || hasDefisit) {
        alertDefisit.classList.remove('hidden');
    } else {
        alertDefisit.classList.add('hidden');
    }

    // Execution Bay Actions & Logistics Bay Visibility
    const bay = document.getElementById('drawer-execution-bay')!;
    const bayPod = document.getElementById('bay-pod')!;
    
    // Reset Visibility
    bayPod.classList.add('hidden');
    bay.innerHTML = '';

    // "All-or-Nothing Fulfillment" Check
    const canFulfill = !hasDefisit;

    if (so.status_so === 'RESERVED') {
        if (canFulfill) {
            bay.innerHTML = `
                <button disabled class="flex-1 px-4 py-2.5 bg-slate-200 text-slate-500 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-not-allowed">
                    <span class="material-symbols-outlined text-[18px]">local_shipping</span> Menunggu Pengiriman oleh Tim Gudang
                </button>
            `;
        } else {
             bay.innerHTML = `
                <button disabled class="flex-1 px-4 py-2.5 bg-slate-200 text-slate-500 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-not-allowed" title="Masih ada item defisit.">
                    <span class="material-symbols-outlined text-[18px]">lock</span> Dispatch Terkunci (Defisit)
                </button>
            `;
        }
    } else if (so.status_so === 'SHIPPED') {
        bayPod.classList.remove('hidden');
        bay.innerHTML = `
            <button onclick="window.confirmDelivered(${so.id})" class="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-sm hover:bg-emerald-700 transition-all flex items-center justify-center gap-2">
                <span class="material-symbols-outlined text-[18px]">check_circle</span> Konfirmasi Diterima (DELIVERED)
            </button>
            <button onclick="window.reportFailed(${so.id})" class="flex-none px-4 py-2.5 bg-rose-100 text-rose-700 rounded-xl font-bold text-sm shadow-sm hover:bg-rose-200 transition-all flex items-center justify-center gap-2" title="Lapor Gagal Kirim">
                <span class="material-symbols-outlined text-[18px]">warning</span>
            </button>
        `;
    } else if (so.status_so === 'DELIVERED') {
        bay.innerHTML = `
            <button onclick="window.payAndShip(${so.id})" class="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-sm hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                <span class="material-symbols-outlined text-[18px]">payments</span> Terima Pembayaran & Hard Consume Stok
            </button>
        `;
    } else if (so.status_so === 'BACKORDER') {
        // Find the detail id that is defisit
        const defisitItem = so.items.find(i => i.status_item === 'DEFISIT' && !i.id_wo_terkait);
        if (defisitItem) {
            bay.innerHTML = `
                <button onclick="window.triggerWO(${defisitItem.id})" class="flex-1 px-4 py-2.5 bg-amber-600 text-white rounded-xl font-bold text-sm shadow-sm hover:bg-amber-700 transition-all flex items-center justify-center gap-2">
                    <span class="material-symbols-outlined text-[18px]">build</span> Terbitkan WO Perakitan (MES)
                </button>
            `;
        } else if (hasDefisit) {
             bay.innerHTML = `
                <button disabled class="flex-1 px-4 py-2.5 bg-slate-200 text-slate-500 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-not-allowed" title="WO sudah diterbitkan.">
                    <span class="material-symbols-outlined text-[18px]">hourglass_empty</span> Menunggu MES Selesai...
                </button>
            `;
        }
    } else if (so.status_so === 'FAILED_DELIVERY') {
        bay.innerHTML = `
            <button onclick="window.rescheduleDelivery(${so.id})" class="flex-1 px-4 py-2.5 bg-rose-600 text-white rounded-xl font-bold text-sm shadow-sm hover:bg-rose-700 transition-all flex items-center justify-center gap-2">
                <span class="material-symbols-outlined text-[18px]">autorenew</span> Jadwalkan Ulang Pengiriman
            </button>
        `;
    }

    backdrop.classList.remove('hidden');
    drawer.classList.remove('translate-x-full');
}

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

// Window Attachments for inline onclick
declare global {
    interface Window {
        openRightDrawerSO: (so: SOHeader) => void;
        payAndShip: (id: number) => void;
        triggerWO: (id: number) => void;
        confirmDelivered: (id: number) => void;
        reportFailed: (id: number) => void;
        rescheduleDelivery: (id: number) => void;
    }
}
window.openRightDrawerSO = openRightDrawerSO;



window.confirmDelivered = async (id: number) => {
    const fileInput = document.getElementById('file-foto-retailer') as HTMLInputElement;
    if (!fileInput.files || fileInput.files.length === 0) {
        showToast('Validasi Gagal: Bukti Foto Terima (POD) wajib dilampirkan!', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('foto_bukti_terima', fileInput.files[0]);

    try {
        const res = await apiFetch<{success: boolean, message: string}>(`penjualan/so/${id}/deliver`, {
            method: 'PATCH',
            body: formData
        });
        if (res.success) { 
            showToast(res.message); 
            loadSOs(); 
            document.getElementById('right-drawer')?.classList.add('translate-x-full'); 
        } else { 
            showToast(res.message, 'error'); 
        }
    } catch (e: any) { 
        showToast(e.message || 'Error Sistem', 'error'); 
    }
};

window.reportFailed = async (id: number) => {
    // @ts-ignore
    const result = await Swal.fire({
        title: 'Peringatan',
        text: 'Laporkan Gagal Kirim? Barang akan dikarantina.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e11d48',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Ya, Laporkan',
        cancelButtonText: 'Batal'
    });
    if (!result.isConfirmed) return;

    try {
        const res = await apiFetch<{success: boolean, message: string}>(`exception/so/${id}/failed-delivery`, {
            method: 'PATCH'
        });
        if (res.success) { 
            showToast(res.message); 
            loadSOs(); 
            document.getElementById('right-drawer')?.classList.add('translate-x-full'); 
        } else { 
            showToast(res.message, 'error'); 
        }
    } catch (e: any) { 
        showToast(e.message || 'Error Sistem', 'error'); 
    }
};

window.payAndShip = async (id: number) => {
    try {
        const res = await apiFetch<{success: boolean, message: string}>(`penjualan/so/${id}/fulfill`, {
            method: 'PATCH',
            body: JSON.stringify({ action: 'pay' })
        });
        if (res.success) { showToast('Pembayaran Diterima & Stok Dipotong!', 'success'); loadSOs(); document.getElementById('right-drawer')?.classList.add('translate-x-full'); }
        else { showToast(res.message || 'Gagal', 'error'); }
    } catch (e: any) { showToast(e.message || 'Error Sistem', 'error'); }
};

window.triggerWO = async (idDetail: number) => {
    try {
        const res = await apiFetch<{success: boolean, message: string}>(`penjualan/so/detail/${idDetail}/trigger-wo`, {
            method: 'POST'
        });
        if (res.success) { showToast('Work Order Berhasil Diterbitkan ke MES!', 'success'); loadSOs(); document.getElementById('right-drawer')?.classList.add('translate-x-full'); }
        else { showToast(res.message || 'Gagal menerbitkan WO', 'error'); }
    } catch (e: any) { showToast(e.message || 'Error Sistem', 'error'); }
};

window.rescheduleDelivery = async (id: number) => {
    const result = await (window as any).Swal.fire({
        title: 'Jadwalkan Ulang Pengiriman?',
        text: "Status akan dikembalikan ke RESERVED dan siap dikirim ulang.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#0ea5e9',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Ya, Jadwalkan!',
        cancelButtonText: 'Batal'
    });
    if (!result.isConfirmed) return;

    try {
        const res = await apiFetch<{success: boolean, message: string}>(`exception/so/${id}/reschedule`, {
            method: 'PATCH'
        });
        if (res.success) { 
            showToast('Penjadwalan Ulang Berhasil!', 'success'); 
            loadSOs(); 
            document.getElementById('right-drawer')?.classList.add('translate-x-full'); 
        }
        else { showToast(res.message || 'Gagal jadwalkan ulang', 'error'); }
    } catch (e: any) { showToast(e.message || 'Error Sistem', 'error'); }
};

// ============================================================
// 3. CREATE SO MODAL
// ============================================================
async function initCreateModal() {
    const btnNewSO = document.getElementById('btn-new-so')!;
    const modal = document.getElementById('modal-create-so')!;
    const btnClose = document.getElementById('btn-close-modal')!;
    const btnCancel = document.getElementById('btn-cancel-modal')!;
    const btnSubmit = document.getElementById('btn-submit-so')!;
    const container = document.getElementById('so-items-container')!;

    const closeModal = () => modal.classList.add('hidden');
    btnClose.onclick = closeModal;
    btnCancel.onclick = closeModal;

    // Klik di luar form (backdrop) untuk menutup modal otomatis
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    let mapPreview: any = null;
    let mapMarker: any = null;

    btnNewSO.onclick = () => {
        resetModal();
        modal.classList.remove('hidden');

        // Initialize Map Preview lazily
        const mapContainer = document.getElementById('map-preview');
        if (typeof (window as any).google !== 'undefined' && (window as any).google.maps && mapContainer && !mapPreview) {
            mapPreview = new (window as any).google.maps.Map(mapContainer, {
                center: { lat: -6.200000, lng: 106.816666 },
                zoom: 15,
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: false
            });
            mapMarker = new (window as any).google.maps.Marker({
                map: mapPreview,
                animation: (window as any).google.maps.Animation.DROP
            });
        }
    };

    // Fetch Finished Goods
    try {
        const itemRes = await apiFetch<{success: boolean, data: any[]}>('penjualan/products');
        if (itemRes.success) {
            fgItems = itemRes.data;
        } else {
            fgItems = [];
        }
    } catch (e) {
        console.error('Failed to load items', e);
    }

    function renderItemOptions() {
        let options = '<option value="">-- Pilih Sepeda --</option>';
        fgItems.forEach(i => {
            options += `<option value="${i.id}">[${i.kode_barang}] ${i.nama_barang} (Stok: ${i.jumlah_stok || 0})</option>`;
        });
        return options;
    }

    // Google Maps Autocomplete Setup
    const inputAlamat = document.getElementById('input-alamat') as HTMLInputElement;
    const inputLat = document.getElementById('input-latitude') as HTMLInputElement;
    const inputLng = document.getElementById('input-longitude') as HTMLInputElement;
    const inputOngkir = document.getElementById('input-biaya-pengiriman') as HTMLInputElement;

    // Mencegah form submit default saat menekan Enter
    inputAlamat.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') e.preventDefault();
    });

    // Hack Google Maps: Auto-select opsi pertama saat user menekan Enter
    const _addEventListener = inputAlamat.addEventListener;
    inputAlamat.addEventListener = function(type: string, listener: any, options?: any) {
        if (type === "keydown") {
            const orig_listener = listener;
            listener = function(event: KeyboardEvent) {
                const suggestion_selected = document.querySelector('.pac-item-selected');
                if (event.key === 'Enter' && !suggestion_selected) {
                    const simulated_downarrow = new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true, cancelable: true });
                    orig_listener.apply(inputAlamat, [simulated_downarrow]);
                }
                orig_listener.apply(inputAlamat, [event]);
            };
        }
        _addEventListener.apply(inputAlamat, [type, listener, options]);
    } as any;

    // Reset ongkir & sembunyikan elemen terkait jika alamat dihapus manual
    inputAlamat.addEventListener('input', () => {
        if (inputAlamat.value.trim() === '') {
            inputLat.value = '';
            inputLng.value = '';
            inputOngkir.value = '0';
            const mapContainer = document.getElementById('map-preview');
            if (mapContainer) mapContainer.classList.add('hidden');
            const teksOngkir = document.getElementById('teks-keterangan-ongkir');
            if (teksOngkir) teksOngkir.classList.add('hidden');
        }
    });

    const calculateShippingCost = async () => {
        const lat = inputLat.value;
        const lng = inputLng.value;
        const alamat = inputAlamat.value;
        
        if (!alamat.trim()) return;

        let total_qty = 0;
        document.querySelectorAll('.item-qty').forEach(el => {
            total_qty += parseInt((el as HTMLInputElement).value) || 0;
        });

        showToast('Menghitung ongkos kirim dari Pabrik...', 'success');
        
        try {
            const mapRes = await apiFetch<{success: boolean, ongkir: number, jarak_km: number, keterangan_ongkir?: string, message?: string}>('maps/calculate-shipping', {
                method: 'POST',
                body: JSON.stringify({ latitude: lat || null, longitude: lng || null, alamat, total_qty })
            });
            
            const teksOngkir = document.getElementById('teks-keterangan-ongkir') as HTMLParagraphElement;
            
            if (mapRes.success) {
                inputOngkir.value = mapRes.ongkir.toLocaleString('id-ID');
                if (mapRes.keterangan_ongkir) {
                    teksOngkir.textContent = mapRes.keterangan_ongkir;
                    teksOngkir.classList.remove('hidden');
                } else {
                    teksOngkir.classList.add('hidden');
                }
                showToast(`Jarak: ${mapRes.jarak_km} KM. Ongkir 3PL otomatis diperbarui!`, 'success');
            } else {
                inputOngkir.value = '0';
                if (teksOngkir) teksOngkir.classList.add('hidden');
                showToast(mapRes.message || 'Gagal hitung ongkir.', 'error');
            }
        } catch (e) {
            inputOngkir.value = '0';
            const teksOngkir = document.getElementById('teks-keterangan-ongkir');
            if (teksOngkir) teksOngkir.classList.add('hidden');
            showToast('Gagal terhubung ke kalkulator ongkir.', 'error');
        }
        
        updateAllTotalHarga();
    };

    const updateAllTotalHarga = () => {
        const inputOngkir = document.getElementById('input-biaya-pengiriman') as HTMLInputElement;
        const ongkir = parseInt(inputOngkir.value.replace(/\D/g, ''), 10) || 0;
        
        document.querySelectorAll('.so-item-row').forEach(row => {
            const hargaInput = row.querySelector('.item-harga') as HTMLInputElement;
            const qtyInput = row.querySelector('.item-qty') as HTMLInputElement;
            const totalHargaInput = row.querySelector('.item-total-harga') as HTMLInputElement;
            
            const rawHarga = parseInt(hargaInput.value.replace(/\D/g, ''), 10) || 0;
            const qty = parseInt(qtyInput.value, 10) || 0;
            
            const total = (rawHarga * qty) + ongkir;
            if (totalHargaInput) totalHargaInput.value = formatIndoNumber(total);
        });
    };

    try {
        if (typeof google !== 'undefined' && google.maps && google.maps.places) {
            const autocomplete = new google.maps.places.Autocomplete(inputAlamat, {
                componentRestrictions: { country: 'id' },
                fields: ['geometry', 'name', 'formatted_address']
            });

            autocomplete.addListener('place_changed', async () => {
                const place = autocomplete.getPlace();
                const mapContainer = document.getElementById('map-preview');
                
                if (!place.geometry || !place.geometry.location) {
                    inputLat.value = '0';
                    inputLng.value = '0';
                    if (mapContainer) mapContainer.classList.add('hidden');
                } else {
                    inputLat.value = place.geometry.location.lat().toString();
                    inputLng.value = place.geometry.location.lng().toString();
                    inputAlamat.value = place.formatted_address || place.name;
                    
                    if (mapContainer && mapPreview && mapMarker) {
                        mapContainer.classList.remove('hidden');
                        (window as any).google.maps.event.trigger(mapPreview, 'resize');
                        mapPreview.setCenter(place.geometry.location);
                        mapPreview.setZoom(16);
                        mapMarker.setPosition(place.geometry.location);
                    }
                }
                await calculateShippingCost();
            });
        }
    } catch (e) {
        console.warn('Google Maps script is not loaded or key is invalid.');
    }

    // Event listeners untuk dynamic rows

    function generateRowHTML() {
        const options = renderItemOptions();

        return `
            <div class="flex items-end gap-3 so-item-row group">
                <div class="flex-1">
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 opacity-0 group-first:opacity-100 transition-opacity h-4">Produk</label>
                    <select class="item-select w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none">${options}</select>
                </div>
                <div class="w-20">
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 opacity-0 group-first:opacity-100 transition-opacity h-4">Jumlah</label>
                    <input type="number" min="1" value="1" class="item-qty w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-data-mono focus:ring-1 focus:ring-primary outline-none" placeholder="1">
                </div>
                <div class="w-32">
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 opacity-0 group-first:opacity-100 transition-opacity h-4">Harga Satuan</label>
                    <input type="text" readonly class="item-harga w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-data-mono outline-none cursor-not-allowed text-slate-500" placeholder="0">
                </div>
                <div class="w-32">
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 opacity-0 group-first:opacity-100 transition-opacity h-4">Total Harga</label>
                    <div class="relative">
                        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">Rp</span>
                        <input type="text" readonly class="item-total-harga w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm font-data-mono outline-none cursor-not-allowed text-primary font-bold" placeholder="0">
                    </div>
                </div>
            </div>
        `;
    }

    function attachRowEvents(row: HTMLElement) {
        const select = row.querySelector('.item-select') as HTMLSelectElement;
        const hargaInput = row.querySelector('.item-harga') as HTMLInputElement;
        const qtyInput = row.querySelector('.item-qty') as HTMLInputElement;

        const checkStock = () => {
            const selectedItem = fgItems.find(i => i.id == select.value);
            if (selectedItem) {
                const qty = parseInt(qtyInput.value) || 1;
                const stok = parseInt(selectedItem.jumlah_stok || 0);
                if (qty > stok) {
                    if (typeof (window as any).Swal !== 'undefined') {
                        (window as any).Swal.fire({
                            title: 'Peringatan Defisit Stok!',
                            text: `Jumlah permintaan (${qty}) melebihi stok fisik di gudang (${stok}). Jika dilanjutkan, status pesanan akan menjadi BACKORDER dan sistem akan meminta penerbitan Work Order perakitan.`,
                            icon: 'warning',
                            confirmButtonColor: '#f59e0b',
                            confirmButtonText: 'Mengerti'
                        });
                    } else {
                        showToast(`Peringatan: Stok hanya tersedia ${stok}. Pesanan akan masuk Backorder.`, 'error');
                    }
                }
            }
        };

        select.addEventListener('change', () => {
            const selectedItem = fgItems.find(i => i.id == select.value);
            if (selectedItem) {
                hargaInput.value = formatIndoNumber(selectedItem.harga_standar || 0);
                checkStock(); // Cek stok saat ganti produk
            } else {
                hargaInput.value = '';
                qtyInput.value = '1';
            }
            updateAllTotalHarga();
        });

        let qtyTimeout: any;
        qtyInput.addEventListener('input', () => {
            clearTimeout(qtyTimeout);
            qtyTimeout = setTimeout(() => {
                if (qtyInput.value === '' || parseInt(qtyInput.value) < 1 || isNaN(parseInt(qtyInput.value))) {
                    qtyInput.value = '1';
                }

                checkStock(); // Cek stok saat ketik qty

                if (inputAlamat.value.trim() !== '') {
                    calculateShippingCost();
                } else {
                    updateAllTotalHarga();
                }
            }, 600); // 600ms debounce untuk real-time tanpa spam API
        });
    }

    function resetModal() {
        (document.getElementById('input-customer') as HTMLInputElement).value = '';
        (document.getElementById('input-alamat') as HTMLTextAreaElement).value = '';
        const targetDateInput = document.getElementById('input-target-date') as HTMLInputElement;
        targetDateInput.value = '';
        
        // Disable past dates
        const today = new Date().toISOString().split('T')[0];
        targetDateInput.min = today;

        (document.getElementById('input-catatan') as HTMLInputElement).value = '';
        const inputOngkir = document.getElementById('input-biaya-pengiriman') as HTMLInputElement;
        inputOngkir.value = '0';
        const inputLat = document.getElementById('input-latitude') as HTMLInputElement;
        if (inputLat) inputLat.value = '';
        const inputLng = document.getElementById('input-longitude') as HTMLInputElement;
        if (inputLng) inputLng.value = '';
        
        const mapContainer = document.getElementById('map-preview');
        if (mapContainer) mapContainer.classList.add('hidden');
        if (mapMarker) mapMarker.setPosition(null);
        
        container.innerHTML = generateRowHTML();
        attachRowEvents(container.firstElementChild as HTMLElement);
    }

    // Submit Action (Real API)
    btnSubmit.onclick = async () => {
        const customer = (document.getElementById('input-customer') as HTMLInputElement).value;
        const targetDate = (document.getElementById('input-target-date') as HTMLInputElement).value;
        const alamat = (document.getElementById('input-alamat') as HTMLTextAreaElement).value;
        const catatan = (document.getElementById('input-catatan') as HTMLInputElement).value;
        const biayaPengiriman = (document.getElementById('input-biaya-pengiriman') as HTMLInputElement).value;
        
        const row = container.firstElementChild as HTMLElement;
        const select = row.querySelector('.item-select') as HTMLSelectElement;
        const qtyInput = row.querySelector('.item-qty') as HTMLInputElement;
        const hargaInput = row.querySelector('.item-harga') as HTMLInputElement;

        if (!customer || !targetDate || !alamat || !select.value || parseInt(qtyInput.value) < 1) {
            showToast('Lengkapi semua data formulir dan pilih produk!', 'error');
            return;
        }

        const hargaRaw = hargaInput.value.replace(/\D/g, ''); // bersihkan titik
        const lat = (document.getElementById('input-latitude') as HTMLInputElement)?.value;
        const lng = (document.getElementById('input-longitude') as HTMLInputElement)?.value;

        const payload: any = {
            nama_customer: customer,
            tanggal_target_kirim: targetDate,
            alamat_pengiriman: alamat,
            catatan: catatan,
            biaya_pengiriman: parseFloat(biayaPengiriman.replace(/\D/g, '')) || 0,
            latitude: lat || null,
            longitude: lng || null,
            items: [{
                id_inventory_barang_jadi: parseInt(select.value),
                qty: parseInt(qtyInput.value),
                harga_satuan: parseFloat(hargaRaw)
            }]
        };

        try {
            const res = await apiFetch<{success: boolean, message: string}>('penjualan/so', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (res.success) {
                showToast(res.message, 'success');
                closeModal();
                loadSOs();
            } else {
                showToast(res.message || 'Gagal membuat SO', 'error');
            }
        } catch (e: any) {
            showToast(e.message || 'Error Sistem', 'error');
        }
    };
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    initRBAC('Penjualan'); 
    loadSOs();
    initCreateModal();

    // Polling for Real-Time Experience (Every 30 seconds)
    setInterval(() => {
        loadSOs();
    }, 30000);
});
