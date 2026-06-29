import { initRBAC } from '../components/rbac.js';
import { apiFetch, getUserData } from '../api.js';
import { renderPaginationUI } from '../utils/pagination.js';
import { openPrintWindow, openReportWindow, formatRupiahPrint } from '../utils/printDocument.js';

interface PODetail {
    id: number;
    id_inventory_material: number;
    qty: number;
    harga_satuan: string;
    nama_barang: string;
    kode_barang: string;
    satuan: string;
}

interface POHeader {
    id: number;
    nomor_po: string;
    id_vendor: number;
    status: string;
    total_nilai: string;
    catatan: string;
    created_at: string;
    nama_vendor: string;
    alamat_vendor?: string;
    kontak_vendor?: string;
    term_of_payment?: number;
    items: PODetail[];
}

let allPOs: POHeader[] = [];
let currentOpenedPO: POHeader | null = null;
let inventoryItems: any[] = [];

let currentPage = 1;
const itemsPerPage = 10;
let currentFilterPO = 'All';
let currentFilterMonthPO = '';

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


function fillPrintPO(po: any) {
    const elMitra = document.getElementById('pdf-po-mitra');
    const elAlamat = document.getElementById('pdf-po-alamat');
    const elNo = document.getElementById('pdf-po-no');
    const elTgl = document.getElementById('pdf-po-tgl');
    const elApproval = document.getElementById('pdf-po-approval');
    const elPengiriman = document.getElementById('pdf-po-pengiriman');
    const elPaymentTerms = document.getElementById('pdf-po-payment-terms');
    const elTbody = document.getElementById('pdf-po-tbody');
    const elGrandTotal = document.getElementById('pdf-po-grand-total');
    const elSubtotal = document.getElementById('pdf-po-subtotal');
    const elCatatan = document.getElementById('pdf-po-catatan');
    const elPrintedAt = document.getElementById('pdf-po-printed-at');

    if (elMitra) elMitra.textContent = po.nama_vendor || '-';
    if (elAlamat) elAlamat.textContent = po.alamat_vendor || '-';
    if (elNo) elNo.textContent = po.nomor_po;
    if (elTgl) {
        const d = po.created_at ? new Date(po.created_at) : new Date();
        elTgl.textContent = isNaN(d.getTime()) ? '-' : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    // Status Approval
    let approvalLabel = 'Menunggu Persetujuan';
    let approvalColor = '#d97706'; // amber
    if (po.status === 'DRAFT') {
        approvalLabel = 'Draf / Belum Diajukan';
        approvalColor = '#64748b';
    } else if (po.status === 'ISSUED') {
        approvalLabel = 'Menunggu Persetujuan Executive';
        approvalColor = '#d97706';
    } else if (po.status === 'REJECTED') {
        approvalLabel = 'Ditolak';
        approvalColor = '#e11d48';
    } else if (['APPROVED', 'SENT_TO_VENDOR', 'COMPLETED'].includes(po.status)) {
        approvalLabel = 'Disetujui ✓';
        approvalColor = '#059669';
    }
    if (elApproval) {
        elApproval.textContent = approvalLabel;
        (elApproval as HTMLElement).style.color = approvalColor;
    }

    // Status Pengiriman
    let pengirimanLabel = 'Belum Dikirim';
    let pengirimanColor = '#64748b';
    if (po.status === 'SENT_TO_VENDOR') {
        pengirimanLabel = 'Dalam Perjalanan';
        pengirimanColor = '#4f46e5';
    } else if (po.status === 'COMPLETED') {
        pengirimanLabel = 'Telah Diterima (GRN Selesai) ✓';
        pengirimanColor = '#059669';
    }
    if (elPengiriman) {
        elPengiriman.textContent = pengirimanLabel;
        (elPengiriman as HTMLElement).style.color = pengirimanColor;
    }

    // Payment Terms
    let paymentTerms = po.term_of_payment ? `Net ${po.term_of_payment} Hari (Transfer Bank)` : 'Net 30 Hari (Transfer Bank)';
    if (po.catatan && po.catatan.toLowerCase().includes('termin')) {
        paymentTerms = po.catatan;
    }
    if (elPaymentTerms) elPaymentTerms.textContent = paymentTerms;

    // Catatan
    if (elCatatan) elCatatan.textContent = po.catatan || 'Tidak ada catatan khusus.';

    // Timestamp cetak
    if (elPrintedAt) {
        const now = new Date();
        elPrintedAt.textContent = `Dicetak: ${now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} pukul ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`;
    }

    const totalNilai = parseFloat(po.total_nilai) || 0;
    if (elGrandTotal) elGrandTotal.textContent = formatRupiah(totalNilai);
    if (elSubtotal) elSubtotal.textContent = formatRupiah(totalNilai);

    if (elTbody && po.items) {
        elTbody.innerHTML = '';
        po.items.forEach((item: any, idx: number) => {
            const harga = parseFloat(item.harga_satuan) || 0;
            const subtotal = harga * item.qty;
            elTbody.innerHTML += `
                <tr>
                    <td style="border-bottom:1px solid #e2e8f0; padding:10px 6px; text-align:center; color:#64748b; font-size:11px;">${idx + 1}</td>
                    <td style="border-bottom:1px solid #e2e8f0; padding:10px 8px;">
                        <div style="font-weight:700; color:#0f172a; font-size:12px;">${item.nama_barang}</div>
                        <div style="font-size:9px; color:#94a3b8; margin-top:2px; font-family:'JetBrains Mono',monospace;">${item.kode_barang || ''}</div>
                    </td>
                    <td style="border-bottom:1px solid #e2e8f0; padding:10px 6px; text-align:center; font-weight:700; font-size:12px;">${item.qty} <span style="font-size:9px; color:#94a3b8;">${item.satuan || 'pcs'}</span></td>
                    <td style="border-bottom:1px solid #e2e8f0; padding:10px 8px; text-align:right; font-family:'JetBrains Mono',monospace; font-size:11px; color:#475569;">${formatRupiah(harga)}</td>
                    <td style="border-bottom:1px solid #e2e8f0; padding:10px 8px; text-align:right; font-family:'JetBrains Mono',monospace; font-weight:700; font-size:12px; color:#0f172a;">${formatRupiah(subtotal)}</td>
                </tr>
            `;
        });
    }
}

// ============================================================
// 1. DATA TABLE & DISPENSER
// ============================================================
async function loadPOs() {
    try {
        const response = await apiFetch<{ success: boolean; data: POHeader[] }>('pengadaan/po');
        if (!response.success) throw new Error('Gagal mengambil data PO');
        
        allPOs = response.data;

        // Sort order: DITERBITKAN (ISSUED) -> DIKIRIM (SENT_TO_VENDOR) -> BARANG DITERIMA (COMPLETED) -> Lainnya
        const statusWeight: Record<string, number> = {
            'ISSUED': 1,
            'SENT_TO_VENDOR': 2,
            'COMPLETED': 3
        };

        allPOs.sort((a, b) => {
            const weightA = statusWeight[a.status] || 99;
            const weightB = statusWeight[b.status] || 99;
            if (weightA !== weightB) return weightA - weightB;
            // secondary sort by date descending
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        currentPage = 1;
        renderTable();
        updateKPIs();
        
        // Handle Bulk Actions Visibility
        const btnBulkReceive = document.getElementById('btn-bulk-receive-po');
        const btnBulkApprove = document.getElementById('btn-bulk-approve-po');
        const btnBulkIssue = document.getElementById('btn-bulk-issue-po');
        const user = getUserData();
        if (user) {
            const role = user.divisi_role;
            const canReceive = role === 'Owner' || role === 'General Manager' || role === 'Pengadaan' || role === 'Gudang';
            const canApprove = role === 'Owner' || role === 'General Manager';
            const canIssue = role === 'Owner' || role === 'General Manager' || role === 'Pengadaan';
            
            const hasSentToVendor = allPOs.some(p => p.status === 'SENT_TO_VENDOR');
            const hasIssued = allPOs.some(p => p.status === 'ISSUED');
            const hasDraft = allPOs.some(p => p.status === 'DRAFT');
            
            if (btnBulkReceive) {
                if (canReceive && hasSentToVendor) btnBulkReceive.classList.remove('hidden');
                else btnBulkReceive.classList.add('hidden');
            }

            if (btnBulkApprove) {
                if (canApprove && hasIssued) btnBulkApprove.classList.remove('hidden');
                else btnBulkApprove.classList.add('hidden');
            }

            if (btnBulkIssue) {
                if (canIssue && hasDraft) btnBulkIssue.classList.remove('hidden');
                else btnBulkIssue.classList.add('hidden');
            }
        }
    } catch (error) {
        showToast('Gagal memuat Purchase Orders', 'error');
        console.error(error);
    }
}

function updateKPIs() {
    const total = allPOs.length;
    const approval = allPOs.filter(p => p.status === 'ISSUED').length;
    const selesai = allPOs.filter(p => p.status === 'COMPLETED').length;

    document.getElementById('kpi-total')!.textContent = total.toString();
    document.getElementById('kpi-approval')!.textContent = approval.toString();
    document.getElementById('kpi-selesai')!.textContent = selesai.toString();
}

function renderTable() {
    const tbody = document.getElementById('po-table-body')!;
    tbody.innerHTML = '';

    let filteredData = allPOs;
    if (currentFilterPO !== 'All') {
        const statusMap: Record<string, string> = {
            'Diterbitkan': 'ISSUED',
            'Dikirim ke Vendor': 'SENT_TO_VENDOR',
            'Barang Diterima': 'COMPLETED'
        };
        filteredData = allPOs.filter(po => po.status === statusMap[currentFilterPO]);
    }
    if (currentFilterMonthPO) {
        filteredData = filteredData.filter(po => {
            if (!po.created_at) return false;
            const date = new Date(po.created_at);
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${year}-${month}` === currentFilterMonthPO;
        });
    }

    if (filteredData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400 italic font-medium">Belum ada Purchase Order</td></tr>`;
    renderPaginationUI('po-pagination-pagination', 'po-pagination-info', 1, 10, 0, () => {});
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

    currentItems.forEach(po => {
        const dateStr = new Date(po.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-100 transition-colors duration-150 text-xs font-medium text-slate-600 group cursor-pointer';
        tr.onclick = () => openRightDrawer(po);

        let badgeClass = 'bg-slate-100 text-slate-600';
        let statusLabel = po.status;
        if (po.status === 'ISSUED') { badgeClass = 'bg-amber-100 text-amber-700'; statusLabel = 'Diterbitkan'; }
        if (po.status === 'APPROVED') { badgeClass = 'bg-blue-100 text-blue-700'; statusLabel = 'Disetujui'; }
        if (po.status === 'SENT_TO_VENDOR') { badgeClass = 'bg-indigo-100 text-indigo-700'; statusLabel = 'Dikirim ke Vendor'; }
        if (po.status === 'COMPLETED') { badgeClass = 'bg-emerald-100 text-emerald-700 border border-emerald-200/80'; statusLabel = 'Barang Diterima'; }
        if (po.status === 'REJECTED') { badgeClass = 'bg-rose-100 text-rose-700'; statusLabel = 'Ditolak'; }
        if (po.status === 'DRAFT') { statusLabel = 'Draf'; }

        let materialText = '-';
        let jumlahText = '-';
        
        if (po.items && po.items.length > 0) {
            const firstItem = po.items[0];
            materialText = firstItem.nama_barang;
            jumlahText = `${firstItem.qty} ${firstItem.satuan}`;
            
            if (po.items.length > 1) {
                materialText += ` <span class="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded ml-1 font-bold">+${po.items.length - 1} lain</span>`;
                const totalQty = po.items.reduce((sum: number, item: any) => sum + parseInt(item.qty), 0);
                jumlahText = `<span class="border-b border-dashed border-slate-400 cursor-help" title="Total dari ${po.items.length} jenis material">${totalQty} items</span>`;
            }
        }

        tr.innerHTML = `
            <td class="px-4 py-3 whitespace-nowrap">
                <p class="font-bold text-blue-700 group-hover:underline">${po.nomor_po}</p>
            </td>
            <td class="px-4 py-3 text-slate-500 whitespace-nowrap">${dateStr}</td>
            <td class="px-4 py-3">
                <p class="font-semibold text-slate-800">${po.nama_vendor || '<span class="italic text-rose-500 font-normal">Belum ditentukan</span>'}</p>
            </td>
            <td class="px-4 py-3">
                <p class="font-semibold text-slate-800">${materialText}</p>
            </td>
            <td class="px-4 py-3 text-right">
                <p class="font-data-mono font-bold text-slate-700">${jumlahText}</p>
            </td>
            <td class="px-4 py-3 text-right">
                <p class="font-data-mono font-bold text-slate-800">${formatRupiah(parseFloat(po.total_nilai))}</p>
            </td>
            <td class="px-4 py-3 text-center">
                <span class="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide ${badgeClass}">${statusLabel}</span>
            </td>
        `;
        tbody.appendChild(tr);
    });
    renderPaginationUI(
        'po-pagination-pagination',
        'po-pagination-info',
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
// 2. DEEP-DIVE TRIGGER & STATE SHIFTER (Drawer)
// ============================================================
function openRightDrawer(po: POHeader) {
    currentOpenedPO = po;
    const drawer = document.getElementById('right-drawer');
    const backdrop = document.getElementById('right-drawer-backdrop');
    if (!drawer || !backdrop) return;

    // Set Header Info
    document.getElementById('drawer-po-id')!.textContent = po.nomor_po;
    
    let statusLabelDrawer = po.status;
    if (po.status === 'ISSUED') statusLabelDrawer = 'Diterbitkan';
    if (po.status === 'APPROVED') statusLabelDrawer = 'Disetujui';
    if (po.status === 'SENT_TO_VENDOR') statusLabelDrawer = 'Dikirim ke Vendor';
    if (po.status === 'COMPLETED') statusLabelDrawer = 'Barang Diterima';
    if (po.status === 'REJECTED') statusLabelDrawer = 'Ditolak';
    if (po.status === 'DRAFT') statusLabelDrawer = 'Draf';

    document.getElementById('drawer-po-status')!.textContent = statusLabelDrawer;
    document.getElementById('drawer-vendor-name')!.innerHTML = po.nama_vendor || '<span class="italic text-rose-500">Belum ditentukan (Harap Edit)</span>';
    
    const catNode = document.getElementById('drawer-catatan')!;
    if (po.catatan) {
        catNode.textContent = po.catatan;
        catNode.classList.remove('italic', 'text-slate-400');
    } else {
        catNode.textContent = 'Tidak ada catatan';
        catNode.classList.add('italic', 'text-slate-400');
    }

    // Render Items
    const itemsList = document.getElementById('drawer-items-list')!;
    itemsList.innerHTML = '';
    
    po.items.forEach(item => {
        const subtotal = parseFloat(item.harga_satuan) * item.qty;
        itemsList.innerHTML += `
            <tr class="group hover:bg-white transition-colors">
                <td class="py-3 px-3">
                    <p class="font-bold text-slate-700">${item.nama_barang}</p>
                    <p class="text-[9px] font-data-mono text-slate-400">${item.kode_barang}</p>
                </td>
                <td class="py-3 px-3 text-right font-data-mono text-slate-700">${item.qty} ${item.satuan || 'pcs'}</td>
                <td class="py-3 px-3 text-right font-data-mono text-slate-500">${formatRupiah(parseFloat(item.harga_satuan))}</td>
                <td class="py-3 px-3 text-right font-data-mono font-bold text-slate-800">${formatRupiah(subtotal)}</td>
            </tr>
        `;
    });

    document.getElementById('drawer-total-nilai')!.textContent = formatRupiah(parseFloat(po.total_nilai));

    // ==========================================================
    // RBAC: CONDITIONAL NODE RENDERING FOR STATE SHIFTER
    // ==========================================================
    const execBay = document.getElementById('drawer-execution-bay')!;
    execBay.innerHTML = '';

    const user = getUserData();
    const role = user?.divisi_role;

    if (po.status === 'DRAFT' && (role === 'Pengadaan' || role === 'Owner' || role === 'General Manager')) {
        const btnDelete = document.createElement('button');
        btnDelete.className = 'flex-1 py-3 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl font-bold text-sm transition-colors flex justify-center items-center gap-2';
        btnDelete.innerHTML = `<span class="material-symbols-outlined text-[18px]">delete</span> Hapus PO`;
        btnDelete.onclick = () => confirmDeletePO(po.id);

        const btnIssue = document.createElement('button');
        btnIssue.className = 'flex-1 py-3 bg-amber-500 text-white hover:bg-amber-600 shadow-sm rounded-xl font-bold text-sm transition-colors flex justify-center items-center gap-2';
        btnIssue.innerHTML = `<span class="material-symbols-outlined text-[18px]">send</span> Ajukan PO (ISSUED)`;
        btnIssue.onclick = () => handleStateShift(po.id, 'ISSUED');

        execBay.appendChild(btnDelete);
        execBay.appendChild(btnIssue);
    } 
    else if (po.status === 'ISSUED' && (role === 'General Manager' || role === 'Owner')) {
        const btnReject = document.createElement('button');
        btnReject.className = 'flex-1 py-3 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl font-bold text-sm transition-colors flex justify-center items-center gap-2';
        btnReject.innerHTML = `<span class="material-symbols-outlined text-[18px]">close</span> Tolak PO`;
        btnReject.onclick = () => handleStateShift(po.id, 'REJECTED');

        const btnApprove = document.createElement('button');
        btnApprove.className = 'flex-1 py-3 bg-blue-600 text-white hover:bg-blue-700 shadow-sm rounded-xl font-bold text-sm transition-colors flex justify-center items-center gap-2';
        btnApprove.innerHTML = `<span class="material-symbols-outlined text-[18px]">check_circle</span> Setujui & Kirim ke Vendor`;
        btnApprove.onclick = () => handleStateShift(po.id, 'SENT_TO_VENDOR');

        execBay.appendChild(btnReject);
        execBay.appendChild(btnApprove);
    }
    else if (po.status === 'APPROVED' && (role === 'Pengadaan' || role === 'Owner' || role === 'General Manager')) {
        const btnSend = document.createElement('button');
        btnSend.className = 'w-full py-3 bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm rounded-xl font-bold text-sm transition-colors flex justify-center items-center gap-2';
        btnSend.innerHTML = `<span class="material-symbols-outlined text-[18px]">forward_to_inbox</span> Kirim ke Vendor`;
        btnSend.onclick = () => handleStateShift(po.id, 'SENT_TO_VENDOR');
        execBay.appendChild(btnSend);
    }
    else {
        let msg = 'Menunggu tindak lanjut dari divisi lain.';
        if (po.status === 'COMPLETED') msg = 'PO Selesai & Barang Diterima (GRN)';
        if (po.status === 'REJECTED') msg = 'PO Ditolak';
        if (po.status === 'SENT_TO_VENDOR') msg = 'Menunggu pihak Gudang melakukan penerimaan barang (GRN).';
        if (role !== 'Owner' && role !== 'General Manager' && role !== 'Pengadaan' && po.status === 'DRAFT') msg = 'Draft PO sedang disusun Pengadaan.';
        if (role !== 'Owner' && role !== 'General Manager' && po.status === 'ISSUED') msg = 'Menunggu Approval Executive.';

        execBay.innerHTML = `<div class="w-full text-center py-2 text-slate-500 font-bold text-sm flex items-center justify-center gap-2"><span class="material-symbols-outlined">info</span> ${msg}</div>`;
    }

    // Selalu tambahkan tombol Cetak Purchase Order di paling bawah drawer
    const btnPrint = document.createElement('button');
    btnPrint.className = 'w-full py-3 bg-slate-800 text-white hover:bg-slate-900 shadow-sm rounded-xl font-bold text-sm transition-colors flex justify-center items-center gap-2 mt-2';
    btnPrint.innerHTML = `<span class="material-symbols-outlined text-[18px]">print</span> Cetak Purchase Order`;
    btnPrint.onclick = () => {
        // Status labels
        let approvalLabel = 'Menunggu Persetujuan';
        if (po.status === 'DRAFT') approvalLabel = 'Draf / Belum Diajukan';
        else if (po.status === 'ISSUED') approvalLabel = 'Menunggu Persetujuan Executive';
        else if (po.status === 'REJECTED') approvalLabel = 'Ditolak';
        else if (['APPROVED', 'SENT_TO_VENDOR', 'COMPLETED'].includes(po.status)) approvalLabel = 'Disetujui ✓';

        let pengirimanLabel = 'Belum Dikirim';
        if (po.status === 'SENT_TO_VENDOR') pengirimanLabel = 'Dalam Perjalanan';
        else if (po.status === 'COMPLETED') pengirimanLabel = 'Telah Diterima (GRN Selesai) ✓';

        const paymentTerms = (po.catatan && po.catatan.toLowerCase().includes('termin'))
            ? po.catatan
            : (po.term_of_payment ? `Net ${po.term_of_payment} Hari (Transfer Bank)` : 'Net 30 Hari (Transfer Bank)');

        const docDate = po.created_at
            ? new Date(po.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
            : '-';

        const totalNilai = parseFloat(po.total_nilai) || 0;

        const MOTEKAR_ADDRESS = 'Jl. Dr. Setiabudi No.193, Gegerkalong, Kec. Sukasari, Kota Bandung, Jawa Barat 40153';

        openPrintWindow({
            docType: 'Purchase Order',
            docNumber: po.nomor_po,
            docDate: docDate,
            status: approvalLabel,
            headerFields: [
                { label: 'Nomor PO', value: po.nomor_po },
                { label: 'Tanggal Terbit', value: docDate },
                { label: 'Nama Supplier', value: po.nama_vendor || '-' },
                { label: 'Alamat Supplier', value: po.alamat_vendor || '-' },
                { label: 'Alamat Pengiriman (Tujuan)', value: MOTEKAR_ADDRESS },
                { label: 'Payment Terms', value: paymentTerms },
                { label: 'Status Approval', value: approvalLabel },
                { label: 'Status Pengiriman', value: pengirimanLabel },
                { label: 'Catatan', value: po.catatan || 'Tidak ada catatan khusus' },
            ],
            columns: [
                { label: 'No', key: 'no', align: 'center' },
                { label: 'Kode Barang', key: 'kode_barang', align: 'left' },
                { label: 'Nama Barang', key: 'nama_barang', align: 'left' },
                { label: 'Qty', key: 'qty_display', align: 'center' },
                { label: 'Harga Satuan (Rp)', key: 'harga_display', align: 'right' },
                { label: 'Total (Rp)', key: 'subtotal_display', align: 'right' },
            ],
            items: (po.items || []).map((item: any, idx: number) => {
                const harga = parseFloat(item.harga_satuan) || 0;
                const subtotal = harga * item.qty;
                return {
                    no: idx + 1,
                    kode_barang: item.kode_barang || '-',
                    nama_barang: item.nama_barang,
                    qty_display: `${item.qty} ${item.satuan || 'pcs'}`,
                    harga_display: formatRupiahPrint(harga),
                    subtotal_display: formatRupiahPrint(subtotal),
                };
            }),
            totalLabel: 'GRAND TOTAL',
            totalValue: formatRupiahPrint(totalNilai),
            notes: po.catatan || undefined,
            signatures: [
                { title: 'Diterima Oleh', name: 'Nama & Stempel Supplier' },
                { title: 'Disetujui & Diterbitkan Oleh', name: 'Manajemen Motekar' },
            ],
            footer: `Dokumen ini diterbitkan oleh Sistem ERP Motekar Bike Assy · ${po.nomor_po} · Dicetak: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`,
        });
    };
    execBay.appendChild(btnPrint);

    backdrop.classList.remove('hidden');
    setTimeout(() => { drawer.classList.add('open'); }, 10);
}

function closeRightDrawer() {
    const drawer = document.getElementById('right-drawer');
    const backdrop = document.getElementById('right-drawer-backdrop');
    if (!drawer || !backdrop) return;

    drawer.classList.remove('open');
    setTimeout(() => {
        backdrop.classList.add('hidden');
        currentOpenedPO = null;
    }, 300);
}

// ============================================================
// BULK RECEIVE (GRN)
// ============================================================
async function confirmBulkReceivePO() {
    // @ts-ignore
    const result = await Swal.fire({
        title: 'Terima Barang Massal?',
        text: 'Anda akan mengeksekusi penerimaan barang (GRN) dan menambah stok untuk semua PO yang berstatus Dikirim ke Vendor. Lanjutkan?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Ya, Eksekusi GRN',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#059669', // Emerald 600
        cancelButtonColor: '#94a3b8'
    });

    if (result.isConfirmed) {
        try {
            const response = await apiFetch<{success: boolean, message: string}>('pengadaan/po/bulk-receive', { method: 'POST' });
            if (response.success) {
                // @ts-ignore
                Swal.fire('Berhasil!', response.message, 'success');
                loadPOs();
            } else {
                // @ts-ignore
                Swal.fire('Gagal!', response.message, 'error');
            }
        } catch (error: any) {
            // @ts-ignore
            Swal.fire('Error!', error.message, 'error');
        }
    }
}

async function confirmBulkApprovePO() {
    // @ts-ignore
    const result = await Swal.fire({
        title: 'Setujui Semua PO (ISSUED)?',
        text: 'Anda akan menyetujui semua PO yang berstatus Diterbitkan. PO tersebut akan otomatis disetujui dan dikirim ke Vendor.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Ya, Setujui Semua',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#2563eb', // Blue 600
        cancelButtonColor: '#94a3b8'
    });

    if (result.isConfirmed) {
        try {
            const response = await apiFetch<{success: boolean, message: string}>('pengadaan/po/bulk-approve', { method: 'POST' });
            if (response.success) {
                // @ts-ignore
                Swal.fire('Berhasil!', response.message, 'success');
                loadPOs();
            } else {
                // @ts-ignore
                Swal.fire('Gagal!', response.message, 'error');
            }
        } catch (error: any) {
            // @ts-ignore
            Swal.fire('Error!', error.message, 'error');
        }
    }
}

async function confirmBulkIssuePO() {
    // @ts-ignore
    const result = await Swal.fire({
        title: 'Ajukan Semua PO (DRAFT)?',
        text: 'Anda akan mengajukan semua PO yang berstatus Draf ke Executive untuk disetujui.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Ya, Ajukan Semua',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#f59e0b', // Amber 500
        cancelButtonColor: '#94a3b8'
    });

    if (result.isConfirmed) {
        try {
            const response = await apiFetch<{success: boolean, message: string}>('pengadaan/po/bulk-issue', { method: 'POST' });
            if (response.success) {
                // @ts-ignore
                Swal.fire('Berhasil!', response.message, 'success');
                loadPOs();
            } else {
                // @ts-ignore
                Swal.fire('Gagal!', response.message, 'error');
            }
        } catch (error: any) {
            // @ts-ignore
            Swal.fire('Error!', error.message, 'error');
        }
    }
}

async function confirmDeletePO(poId: number) {
    // @ts-ignore
    const result = await Swal.fire({
        title: 'Hapus PO ini?',
        text: 'Data PO akan dihapus secara permanen dari sistem. Status PR asal akan dikembalikan menjadi Diproses Vendor agar bisa diproses ulang.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e11d48',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    });

    if (result.isConfirmed) {
        try {
            const response = await apiFetch<{success: boolean, message: string}>(`pengadaan/po/${poId}`, {
                method: 'DELETE'
            });

            if (response.success) {
                showToast(response.message);
                closeRightDrawer();
                loadPOs(); // Refresh Table
            } else {
                // @ts-ignore
                Swal.fire('Gagal!', response.message, 'error');
            }
        } catch (error: any) {
            // @ts-ignore
            Swal.fire('Gagal!', error.message, 'error');
        }
    }
}

async function handleStateShift(poId: number, newStatus: string) {
    let confirmTitle = 'Ubah Status?';
    let confirmText = '';
    let confirmColor = '#00288e';

    if (newStatus === 'ISSUED') {
        confirmTitle = 'Ajukan PO?';
        confirmText = 'PO akan diajukan ke Executive untuk di-approve.';
        confirmColor = '#f59e0b';
    } else if (newStatus === 'APPROVED') {
        confirmTitle = 'Approve PO?';
        confirmText = 'PO akan disetujui secara resmi.';
        confirmColor = '#2563eb';
    } else if (newStatus === 'SENT_TO_VENDOR') {
        confirmTitle = 'Kirim ke Vendor?';
        confirmText = 'Tandai PO telah dikirimkan ke pihak vendor.';
        confirmColor = '#4f46e5';
    } else if (newStatus === 'COMPLETED') {
        confirmTitle = 'Eksekusi GRN?';
        confirmText = 'Barang akan diterima dan stok fisik di gudang akan otomatis bertambah (ACID Transaction).';
        confirmColor = '#10b981';
    } else if (newStatus === 'REJECTED') {
        confirmTitle = 'Tolak PO?';
        confirmText = 'PO ini akan dibatalkan permanen.';
        confirmColor = '#e11d48';
    }

    // @ts-ignore
    const result = await Swal.fire({
        title: confirmTitle,
        text: confirmText,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: confirmColor,
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Ya, Eksekusi!',
        cancelButtonText: 'Batal'
    });

    if (result.isConfirmed) {
        try {
            const response = await apiFetch<{success: boolean, message: string}>(`pengadaan/po/${poId}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status: newStatus })
            });

            if (response.success) {
                showToast(response.message, 'success');
                closeRightDrawer();
                loadPOs(); // Refresh Table
            } else {
                // @ts-ignore
                Swal.fire('Gagal!', response.message, 'error');
            }
        } catch (error: any) {
            // @ts-ignore
            Swal.fire('Gagal!', error.message, 'error');
        }
    }
}

// ============================================================
// 3. CREATE DIRECT PO MODAL
// ============================================================
async function initCreateModal() {
    const user = getUserData();
    const role = user?.divisi_role;
    const actionBayTop = document.getElementById('action-bay-top')!;
    
    // Hanya Pengadaan / Owner yang bisa melihat tombol Buat PO
    if (role === 'Pengadaan' || role === 'Owner') {
        const btnNewPO = document.createElement('button');
        btnNewPO.className = 'bg-primary hover:bg-primary-container text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center gap-2 transition-all';
        btnNewPO.innerHTML = `<span class="material-symbols-outlined text-[20px]">post_add</span> Buat PO Baru`;
        
        const modal = document.getElementById('modal-create-po')!;
        btnNewPO.onclick = () => {
            resetModal();
            modal.classList.remove('hidden');
        };
        actionBayTop.appendChild(btnNewPO);
    }

    const btnClose = document.getElementById('btn-close-modal')!;
    const btnCancel = document.getElementById('btn-cancel-modal')!;
    const btnAddRow = document.getElementById('btn-add-item')!;
    const btnSubmit = document.getElementById('btn-submit-po')!;
    const container = document.getElementById('po-items-container')!;
    const selectV = document.getElementById('select-vendor') as HTMLSelectElement;

    const closeModal = () => document.getElementById('modal-create-po')!.classList.add('hidden');
    btnClose.onclick = closeModal;
    btnCancel.onclick = closeModal;

    // Fetch Vendors & Items for dropdowns
    try {
        const [vendorRes, itemRes] = await Promise.all([
            apiFetch<{success: boolean, data: any[]}>('pengadaan/vendors'),
            apiFetch<{success: boolean, data: any[]}>('pengadaan/items') // Only Raw Materials
        ]);
        
        if (vendorRes.success) {
            selectV.innerHTML = '<option value="">-- Pilih Vendor --</option>';
            vendorRes.data.forEach(v => {
                selectV.innerHTML += `<option value="${v.id}">${v.nama_vendor}</option>`;
            });
        }

        if (itemRes.success) {
            inventoryItems = itemRes.data;
            populateFirstRow();
        }
    } catch (e) {
        console.error('Failed to load form data', e);
    }

    let isVendorAutoSelected = false;

    selectV.addEventListener('change', () => {
        const vendorId = selectV.value;
        
        // Find the first empty row to auto-select an item
        const allSelects = container.querySelectorAll('.po-item-row .item-select');
        let emptySelect = Array.from(allSelects).find(s => !(s as HTMLSelectElement).value) as HTMLSelectElement | undefined;
        
        // If no empty row, just take the first row
        if (!emptySelect && allSelects.length > 0) {
            emptySelect = allSelects[0] as HTMLSelectElement;
        }

        if (emptySelect && vendorId) {
            const firstItem = inventoryItems.find(i => i.id_vendor == vendorId);
            if (firstItem) {
                emptySelect.value = firstItem.id.toString();
                emptySelect.dispatchEvent(new Event('change'));
            }
        }
    });

    function renderItemOptions() {
        let options = '<option value="">-- Pilih Material --</option>';
        inventoryItems.forEach(i => {
            options += `<option value="${i.id}">[${i.kode_barang}] ${i.nama_barang}</option>`;
        });
        return options;
    }

    function generateRowHTML() {
        const options = renderItemOptions();

        return `
            <div class="flex items-end gap-3 po-item-row group">
                <div class="flex-1">
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 opacity-0 group-first:opacity-100 transition-opacity h-4">Material</label>
                    <select class="item-select w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none">${options}</select>
                </div>
                <div class="w-24">
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 opacity-0 group-first:opacity-100 transition-opacity h-4">Jumlah</label>
                    <input type="number" min="1" value="1" class="item-qty w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-data-mono focus:ring-1 focus:ring-primary outline-none" placeholder="1">
                </div>
                <div class="w-32">
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 opacity-0 group-first:opacity-100 transition-opacity h-4">Harga Satuan</label>
                    <input type="text" class="item-harga w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-data-mono outline-none cursor-not-allowed" placeholder="0" readonly>
                </div>
            </div>
        `;
    }

    // We no longer need updateAllItemDropdowns because options never change and are never filtered out.

    function populateFirstRow() {
        container.innerHTML = generateRowHTML();
        attachRowEvents(container.firstElementChild as HTMLElement);
    }

    function resetModal() {
        selectV.value = '';
        (document.getElementById('input-catatan') as HTMLInputElement).value = '';
        populateFirstRow();
    }

    if (btnAddRow) {
        btnAddRow.onclick = () => {
            const div = document.createElement('div');
            div.innerHTML = generateRowHTML();
            const row = div.firstElementChild as HTMLElement;
            container.appendChild(row);
            attachRowEvents(row);
        };
    }

    function attachRowEvents(row: HTMLElement) {
        const select = row.querySelector('.item-select') as HTMLSelectElement;
        const hargaInput = row.querySelector('.item-harga') as HTMLInputElement;
        const qtyInput = row.querySelector('.item-qty') as HTMLInputElement;

        select.addEventListener('change', () => {
            const selectedItem = inventoryItems.find(i => i.id == select.value);
            if (selectedItem) {
                hargaInput.value = formatIndoNumber(selectedItem.harga_standar || 0);

                // Auto-select vendor based on item
                if (selectedItem.id_vendor) {
                    selectV.value = selectedItem.id_vendor;
                }
            } else {
                hargaInput.value = '';
                qtyInput.value = '1';
            }
        });

        qtyInput.addEventListener('change', () => {
            if (qtyInput.value === '' || parseInt(qtyInput.value) < 1 || isNaN(parseInt(qtyInput.value))) {
                qtyInput.value = '1';
            }
        });
    }

    // Submit
    btnSubmit.onclick = async () => {
        const id_vendor = (document.getElementById('select-vendor') as HTMLSelectElement).value;
        const catatan = (document.getElementById('input-catatan') as HTMLInputElement).value;
        
        if (!id_vendor) {
            showToast('Silakan pilih vendor.', 'error');
            return;
        }

        const items: any[] = [];
        let valid = true;

        container.querySelectorAll('.po-item-row').forEach(row => {
            const id_inventory_material = (row.querySelector('.item-select') as HTMLSelectElement).value;
            const qty = (row.querySelector('.item-qty') as HTMLInputElement).value;
            const harga_satuan_raw = (row.querySelector('.item-harga') as HTMLInputElement).value;
            const harga_satuan = harga_satuan_raw.replace(/\./g, '');

            if (!id_inventory_material || !qty || parseInt(qty) <= 0 || !harga_satuan || parseFloat(harga_satuan) < 0) {
                valid = false;
            } else {
                items.push({ id_inventory_material: parseInt(id_inventory_material), qty, harga_satuan: parseFloat(harga_satuan) });
            }
        });

        if (!valid || items.length === 0) {
            showToast('Lengkapi semua item material dengan qty dan harga valid.', 'error');
            return;
        }

        try {
            const btnSubmitEl = btnSubmit as HTMLButtonElement;
            btnSubmitEl.disabled = true;
            btnSubmitEl.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">sync</span> Menyimpan...`;

            const response = await apiFetch<{success: boolean, message: string}>('pengadaan/po/direct', {
                method: 'POST',
                body: JSON.stringify({ id_vendor, catatan, items })
            });

            if (response.success) {
                showToast(response.message, 'success');
                closeModal();
                loadPOs();
            } else {
                // @ts-ignore
                Swal.fire('Gagal!', response.message, 'error');
            }
        } catch (e: any) {
            // @ts-ignore
            Swal.fire('Gagal!', e.message, 'error');
        } finally {
            const btnSubmitEl = btnSubmit as HTMLButtonElement;
            btnSubmitEl.disabled = false;
            btnSubmitEl.innerHTML = `<span class="material-symbols-outlined text-[18px]">save</span> Simpan (DRAFT)`;
        }
    };
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const user = initRBAC('Pengadaan'); // Works for Pengadaan, Gudang, Owner, GM based on their roles
    
    document.getElementById('btn-close-drawer')?.addEventListener('click', closeRightDrawer);
    document.getElementById('right-drawer-backdrop')?.addEventListener('click', closeRightDrawer);

    const btnBulkReceive = document.getElementById('btn-bulk-receive-po');
    if (btnBulkReceive) {
        btnBulkReceive.addEventListener('click', confirmBulkReceivePO);
    }

    const btnBulkApprove = document.getElementById('btn-bulk-approve-po');
    if (btnBulkApprove) {
        btnBulkApprove.addEventListener('click', confirmBulkApprovePO);
    }

    const btnBulkIssue = document.getElementById('btn-bulk-issue-po');
    if (btnBulkIssue) {
        btnBulkIssue.addEventListener('click', confirmBulkIssuePO);
    }

    const filterStatusPo = document.getElementById('filter-status-po') as HTMLSelectElement;
    if (filterStatusPo) {
        filterStatusPo.addEventListener('change', (e) => {
            currentFilterPO = (e.target as HTMLSelectElement).value;
            currentPage = 1;
            renderTable();
        });
    }

    const filterMonthPo = document.getElementById('filter-month-po') as HTMLInputElement;
    if (filterMonthPo) {
        filterMonthPo.addEventListener('change', (e) => {
            currentFilterMonthPO = (e.target as HTMLInputElement).value;
            currentPage = 1;
            renderTable();
        });
        filterMonthPo.addEventListener('click', function() {
            try { (this as any).showPicker(); } catch (e) {}
        });
    }

    const btnPrintReportPo = document.getElementById('btn-print-report-po');
    if (btnPrintReportPo) {
        btnPrintReportPo.addEventListener('click', () => {
            let filteredData = allPOs;
            if (currentFilterPO !== 'All') {
                const statusMap: Record<string, string> = {
                    'Diterbitkan': 'ISSUED',
                    'Dikirim ke Vendor': 'SENT_TO_VENDOR',
                    'Barang Diterima': 'COMPLETED'
                };
                filteredData = allPOs.filter(po => po.status === statusMap[currentFilterPO]);
            }
            if (currentFilterMonthPO) {
                filteredData = filteredData.filter(po => {
                    if (!po.created_at) return false;
                    const date = new Date(po.created_at);
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const year = date.getFullYear();
                    return `${year}-${month}` === currentFilterMonthPO;
                });
            }
            
            if (filteredData.length === 0) {
                // @ts-ignore
                Swal.fire('Info', 'Tidak ada data PO untuk dicetak.', 'info');
                return;
            }
            
            const subtitle = `Filter: Status ${currentFilterPO}${currentFilterMonthPO ? ' | Bulan ' + currentFilterMonthPO : ''}`;
            
            openReportWindow({
                title: 'Laporan Rekapitulasi Purchase Order (PO)',
                subtitle: subtitle,
                columns: [
                    { label: 'Nomor PO', key: 'nomor_po' },
                    { label: 'Tanggal', key: 'created_at', format: (val) => new Date(val).toLocaleDateString('id-ID') },
                    { label: 'Nama Vendor', key: 'nama_vendor' },
                    { label: 'Item Barang', key: 'items', format: (items: any[]) => {
                        if (!items || items.length === 0) return '-';
                        if (items.length === 1) return items[0].nama_barang;
                        return `${items[0].nama_barang} (+${items.length - 1} lain)`;
                    } },
                    { label: 'Jumlah', key: 'items', align: 'right', format: (items: any[]) => {
                        if (!items || items.length === 0) return '-';
                        if (items.length === 1) return `${items[0].qty} ${items[0].satuan}`;
                        const totalQty = items.reduce((sum: number, item: any) => sum + parseInt(item.qty), 0);
                        return `${totalQty} items`;
                    } },
                    { label: 'Total Nilai', key: 'total_nilai', align: 'right', format: (val) => formatRupiahPrint(parseFloat(val)) },
                    { label: 'Status PO', key: 'status', align: 'center' }
                ],
                data: filteredData
            });
        });
    }

    loadPOs();
    initCreateModal();

    // Polling for Real-Time Experience (Every 30 seconds)
    setInterval(() => {
        loadPOs();
    }, 30000);
});
