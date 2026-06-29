/**
 * printDocument.ts — Shared Print Document Engine for Motekar ERP.
 * Generates professional, print-ready document layouts in a new browser tab.
 */

interface PrintColumn {
    label: string;
    key: string;
    align?: 'left' | 'center' | 'right';
    format?: (val: any) => string;
}

interface PrintDocumentOptions {
    docType: string;           // e.g. "Purchase Requisition", "Purchase Order"
    docNumber: string;         // e.g. "PR/MTK/2026/0001"
    docDate: string;           // Formatted date string
    status: string;
    headerFields: { label: string; value: string }[];
    columns: PrintColumn[];
    items: any[];
    totalLabel?: string;
    totalValue?: string;
    subTotals?: { label: string; value: string }[];
    notes?: string;
    footer?: string;
    signatures?: { title: string; name: string; }[];
}

const formatRupiahPrint = (number: number): string => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
};

export function openPrintWindow(options: PrintDocumentOptions): void {
    const headerFieldsHTML = options.headerFields.map(f => `
        <div class="info-row">
            <span class="info-label">${f.label}</span>
            <span class="info-value">${f.value}</span>
        </div>
    `).join('');

    const tableHeaderHTML = options.columns.map(col => `
        <th style="text-align: ${col.align || 'left'}">${col.label}</th>
    `).join('');

    const tableBodyHTML = options.items.map((item, idx) => {
        const cells = options.columns.map(col => {
            let val = item[col.key];
            if (col.format) val = col.format(val);
            return `<td style="text-align: ${col.align || 'left'}">${val ?? '-'}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
    }).join('');

    const subTotalsHTML = options.subTotals ? options.subTotals.map(sub => `
        <tr>
            <td colspan="${options.columns.length - 1}" style="text-align: right; font-weight: 600; font-size: 11px; color: #475569; padding-right: 12px;">
                ${sub.label}
            </td>
            <td style="text-align: right; font-weight: 700; font-size: 12px; color: #334155;">
                ${sub.value}
            </td>
        </tr>
    `).join('') : '';

    const totalRowHTML = options.totalValue ? `
        ${subTotalsHTML}
        <tr class="total-row">
            <td colspan="${options.columns.length - 1}" style="text-align: right; font-weight: 700; padding-right: 12px; color: #00288e;">
                ${options.totalLabel || 'TOTAL'}
            </td>
            <td style="text-align: right; font-weight: 900; font-size: 13px; color: #00288e;">
                ${options.totalValue}
            </td>
        </tr>
    ` : '';

    const notesHTML = options.notes ? `
        <div class="notes-section">
            <strong>Catatan:</strong>
            <p>${options.notes}</p>
        </div>
    ` : '';

    const footerHTML = options.footer || '';

    const sigs = options.signatures || [
        { title: 'Dibuat Oleh', name: 'Pengadaan / Sales' },
        { title: 'Disetujui Oleh', name: 'Manager' },
        { title: 'Diterima Oleh', name: 'Vendor / Penerima' }
    ];

    const signaturesHTML = `
        <div class="signatures">
            ${sigs.map(sig => `
                <div class="sig-block">
                    <div class="sig-title">${sig.title}</div>
                    <div class="sig-line">${sig.name}</div>
                </div>
            `).join('')}
        </div>
    `;

    const html = `
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <title>${options.docType} — ${options.docNumber}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=JetBrains+Mono:wght@500;700&display=swap');
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Inter', -apple-system, sans-serif;
            color: #1e293b;
            background: #fff;
            padding: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }

        .page {
            max-width: 210mm;
            margin: 0 auto;
            padding: 20px 28px;
            position: relative;
            display: flex;
            flex-direction: column;
        }

        /* === HEADER === */
        .doc-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 3px solid #00288e;
            padding-bottom: 20px;
            margin-bottom: 24px;
        }

        .company-info h1 {
            font-size: 22px;
            font-weight: 900;
            color: #00288e;
            letter-spacing: -0.5px;
        }

        .company-info p {
            font-size: 10px;
            color: #64748b;
            margin-top: 2px;
            line-height: 1.6;
        }

        .doc-meta {
            text-align: right;
        }

        .doc-meta .doc-type {
            font-size: 16px;
            font-weight: 900;
            color: #1e293b;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .doc-meta .doc-number {
            font-family: 'JetBrains Mono', monospace;
            font-size: 14px;
            font-weight: 700;
            color: #00288e;
            margin-top: 4px;
        }

        .doc-meta .doc-date {
            font-size: 11px;
            color: #64748b;
            margin-top: 4px;
        }

        .status-badge {
            display: inline-block;
            margin-top: 6px;
            padding: 3px 12px;
            border-radius: 20px;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            border: 1.5px solid #94a3b8;
            color: #475569;
        }

        /* === INFO GRID === */
        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px 32px;
            margin-bottom: 28px;
            padding: 16px 20px;
            background: #f8fafc;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
        }

        .info-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 0;
        }

        .info-label {
            font-size: 10px;
            font-weight: 700;
            color: #94a3b8;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .info-value {
            font-size: 12px;
            font-weight: 600;
            color: #1e293b;
            text-align: right;
        }

        /* === TABLE === */
        .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 24px;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            overflow: hidden;
        }

        .items-table thead th {
            background: #f1f5f9;
            padding: 10px 12px;
            font-size: 10px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 2px solid #e2e8f0;
        }

        .items-table tbody td {
            padding: 10px 12px;
            font-size: 11px;
            color: #334155;
            border-bottom: 1px solid #f1f5f9;
        }

        .items-table tbody tr:last-child td {
            border-bottom: none;
        }

        .items-table .total-row td {
            padding: 12px;
            background: #f8fafc;
            border-top: 2px solid #00288e;
            color: #00288e;
            font-size: 13px;
        }

        /* === NOTES === */
        .notes-section {
            margin-bottom: 28px;
            padding: 12px 16px;
            background: #fffbeb;
            border: 1px solid #fde68a;
            border-radius: 6px;
            font-size: 11px;
            color: #92400e;
        }

        .notes-section strong {
            display: block;
            margin-bottom: 4px;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        /* === SIGNATURE BLOCK === */
        .signatures {
            display: grid;
            grid-template-columns: repeat(${sigs.length}, 1fr);
            gap: 40px;
            margin-top: 48px;
            margin-bottom: 24px;
            padding-top: 24px;
            page-break-inside: avoid;
        }

        .sig-block {
            text-align: center;
        }

        .sig-block .sig-title {
            font-size: 10px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 60px;
        }

        .sig-block .sig-line {
            border-top: 1px solid #1e293b;
            padding-top: 8px;
            font-size: 10px;
            font-weight: 600;
            color: #1e293b;
        }

        /* === FOOTER === */
        .doc-footer {
            margin-top: 48px;
            text-align: center;
            font-size: 9px;
            color: #94a3b8;
            border-top: 1px solid #e2e8f0;
            padding-top: 12px;
            padding-bottom: 24px;
            page-break-inside: avoid;
        }
    </style>
</head>
<body>
    <div class="page">
        <!-- Header -->
        <div class="doc-header">
            <div class="company-info">
                <h1>Motekar Bike Assy</h1>
                <p>PT. Motekar Manufaktur Indonesia<br>
                Jl. Dr. Setiabudi No.193, Gegerkalong, Kec. Sukasari, Kota Bandung, Jawa Barat 40153<br>
                Telp: (021) 8900-1234 | Email: admin@motekar.id</p>
            </div>
            <div class="doc-meta">
                <div class="doc-type">${options.docType}</div>
                <div class="doc-number">${options.docNumber}</div>
                <div class="doc-date">${options.docDate}</div>
                <span class="status-badge">${options.status}</span>
            </div>
        </div>

        <!-- Info Grid -->
        <div class="info-grid">
            ${headerFieldsHTML}
        </div>

        <!-- Items Table -->
        <table class="items-table">
            <thead><tr>${tableHeaderHTML}</tr></thead>
            <tbody>
                ${tableBodyHTML}
                ${totalRowHTML}
            </tbody>
        </table>

        ${notesHTML}

        ${signaturesHTML}

        ${footerHTML ? `<div class="doc-footer">${footerHTML}</div>` : `
        <div class="doc-footer">
            Dokumen ini dicetak secara otomatis oleh Motekar ERP System. Berlaku tanpa tanda tangan basah.
        </div>`}
    </div>
</body>
</html>`;

    // Use a hidden iframe to trigger native print dialog without opening a new tab
    const iframeId = 'print-engine-iframe';
    let iframe = document.getElementById(iframeId) as HTMLIFrameElement;
    if (iframe) {
        document.body.removeChild(iframe);
    }

    iframe = document.createElement('iframe');
    iframe.id = iframeId;
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    
    document.body.appendChild(iframe);

    if (iframe.contentWindow) {
        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();

        // Secret Feature: Change Document Title temporarily so PDF saves with correct name
        const originalTitle = document.title;
        const safeTitle = `${options.docType}_${options.docNumber}`.replace(/[^a-zA-Z0-9_-]/g, '_');
        document.title = safeTitle;

        // Create blur overlay
        const overlay = document.createElement('div');
        overlay.id = 'print-blur-overlay';
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.backgroundColor = 'rgba(15, 23, 42, 0.4)';
        overlay.style.backdropFilter = 'blur(8px)';
        overlay.style.zIndex = '999999';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.innerHTML = '<div style="background: white; padding: 20px 32px; border-radius: 12px; font-family: Inter, sans-serif; font-weight: 700; color: #0f172a; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); display: flex; align-items: center; gap: 12px;"><svg class="animate-spin h-5 w-5 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Membuka Jendela Cetak...</div>';
        document.body.appendChild(overlay);

        // Wait for styles/fonts to load before printing
        setTimeout(() => {
            if (iframe.contentWindow) {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            }
            // Restore original title
            document.title = originalTitle;
            
            // Remove blur overlay
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
            
            // Clean up iframe after a delay to ensure print dialog captures it
            setTimeout(() => {
                const frameToRemove = document.getElementById(iframeId);
                if (frameToRemove && frameToRemove.parentNode) {
                    frameToRemove.parentNode.removeChild(frameToRemove);
                }
            }, 5000);
        }, 500);
    }
}
export interface ReportColumn {
    label: string;
    key: string;
    align?: 'left' | 'center' | 'right';
    format?: (val: any) => string;
}

export interface ReportOptions {
    title: string;
    subtitle?: string;
    columns: ReportColumn[];
    data: any[];
}

export const openReportWindow = (options: ReportOptions) => {
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>${options.title}</title>
            <style>
                @page { size: landscape; margin: 15mm; }
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; color: #1e293b; margin: 0; padding: 0; }
                h1 { font-size: 18px; margin: 0 0 5px 0; color: #0f172a; text-align: center; text-transform: uppercase; letter-spacing: 1px; }
                p { font-size: 12px; margin: 0 0 20px 0; color: #64748b; text-align: center; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th { background-color: #f8fafc; border-bottom: 2px solid #cbd5e1; padding: 10px 8px; text-transform: uppercase; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; color: #475569; }
                td { border-bottom: 1px solid #e2e8f0; padding: 8px; color: #334155; }
                .text-left { text-align: left; }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .footer { margin-top: 30px; font-size: 9px; color: #94a3b8; text-align: center; }
                tr:nth-child(even) td { background-color: #fcfcfc; }
            </style>
        </head>
        <body>
            <h1>${options.title}</h1>
            ${options.subtitle ? `<p>${options.subtitle}</p>` : ''}
            
            <table>
                <thead>
                    <tr>
                        ${options.columns.map(c => `<th class="text-${c.align || 'left'}">${c.label}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${options.data.length > 0 ? options.data.map((row) => `
                        <tr>
                            ${options.columns.map(c => {
                                let val = row[c.key];
                                if (c.format) val = c.format(val);
                                return `<td class="text-${c.align || 'left'}">${val !== undefined && val !== null ? val : '-'}</td>`;
                            }).join('')}
                        </tr>
                    `).join('') : `<tr><td colspan="${options.columns.length}" class="text-center" style="padding: 20px; font-style: italic; color: #94a3b8;">Tidak ada data yang dicetak</td></tr>`}
                </tbody>
            </table>
            
            <div class="footer">
                Dicetak oleh Sistem ERP Motekar Bike Assy pada ${new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}
            </div>
        </body>
        </html>
    `;

    const iframeId = 'print-report-iframe';
    let iframe = document.getElementById(iframeId) as HTMLIFrameElement;
    
    if (iframe) {
        document.body.removeChild(iframe);
    }

    iframe = document.createElement('iframe');
    iframe.id = iframeId;
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    
    document.body.appendChild(iframe);

    if (iframe.contentWindow) {
        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();

        const originalTitle = document.title;
        const safeTitle = options.title.replace(/[^a-zA-Z0-9_-]/g, '_');
        document.title = safeTitle;

        // Overlay blur
        const overlay = document.createElement('div');
        overlay.id = 'print-blur-overlay';
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.backgroundColor = 'rgba(15, 23, 42, 0.4)';
        overlay.style.backdropFilter = 'blur(8px)';
        overlay.style.zIndex = '999999';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.innerHTML = '<div style="background: white; padding: 20px 32px; border-radius: 12px; font-family: Inter, sans-serif; font-weight: 700; color: #0f172a; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); display: flex; align-items: center; gap: 12px;"><svg class="animate-spin h-5 w-5 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Menyiapkan Laporan...</div>';
        document.body.appendChild(overlay);

        setTimeout(() => {
            if (iframe.contentWindow) {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            }
            document.title = originalTitle;
            
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
            
            setTimeout(() => {
                const frameToRemove = document.getElementById(iframeId);
                if (frameToRemove && frameToRemove.parentNode) {
                    frameToRemove.parentNode.removeChild(frameToRemove);
                }
            }, 5000);
        }, 800);
    }
}

export { formatRupiahPrint };
