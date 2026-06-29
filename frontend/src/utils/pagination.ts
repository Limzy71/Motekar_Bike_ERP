/**
 * pagination.ts — Centralized Pagination UI Renderer
 * Motekar Enterprise Design System (MEDS)
 * 
 * Usage:
 *   renderPaginationUI('container-id', 'info-id', currentPage, perPage, total, callback);
 * 
 * HTML structure expected:
 *   <span id="info-id">...</span>
 *   <div id="container-id" class="flex items-center gap-1.5"></div>
 */

export function renderPaginationUI(
    containerId: string,
    infoId: string,
    currentPage: number,
    itemsPerPage: number,
    totalItems: number,
    onPageChange: (newPage: number) => void
): void {
    const container = document.getElementById(containerId);
    const info = document.getElementById(infoId);

    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

    // Clamp currentPage
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);

    // ── 1. Always update info text, even if container is missing ──
    if (info) {
        if (totalItems === 0) {
            info.textContent = 'Menampilkan 0-0 dari 0 data';
        } else {
            info.textContent = `Menampilkan ${startIndex + 1}-${endIndex} dari ${totalItems} data`;
        }
    }

    // ── 2. Render pagination buttons ──
    if (!container) return;
    container.innerHTML = '';

    // Don't render buttons if only 1 page
    if (totalPages <= 1) return;

    // Helper: create a button element
    const createBtn = (label: string, page: number, opts: { disabled?: boolean; active?: boolean; isArrow?: boolean } = {}) => {
        const btn = document.createElement('button');
        const { disabled = false, active = false, isArrow = false } = opts;

        if (isArrow) {
            btn.className = [
                'btn-pagination w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
                disabled
                    ? 'text-slate-300 cursor-not-allowed'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            ].join(' ');
        } else {
            btn.className = [
                'btn-pagination w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all',
                active
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
            ].join(' ');
        }

        btn.innerHTML = label;
        btn.disabled = disabled;

        if (!disabled && !active) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                onPageChange(page);
            });
        }

        return btn;
    };

    // ◀ Prev button
    container.appendChild(
        createBtn(
            '<span class="material-symbols-outlined text-[18px]">chevron_left</span>',
            currentPage - 1,
            { disabled: currentPage === 1, isArrow: true }
        )
    );

    // Page number buttons with smart ellipsis
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    // Adjust window if we're near the edges
    if (endPage - startPage + 1 < maxVisible) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    // Show first page + ellipsis if window doesn't start at 1
    if (startPage > 1) {
        container.appendChild(createBtn('1', 1, { active: currentPage === 1 }));
        if (startPage > 2) {
            const dots = document.createElement('span');
            dots.className = 'w-6 text-center text-slate-400 text-xs font-bold select-none';
            dots.textContent = '…';
            container.appendChild(dots);
        }
    }

    // Visible page numbers
    for (let i = startPage; i <= endPage; i++) {
        if (i === 1 && startPage > 1) continue; // Already rendered above
        if (i === totalPages && endPage < totalPages) continue; // Will render below
        container.appendChild(createBtn(i.toString(), i, { active: i === currentPage }));
    }

    // Show ellipsis + last page if window doesn't end at totalPages
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const dots = document.createElement('span');
            dots.className = 'w-6 text-center text-slate-400 text-xs font-bold select-none';
            dots.textContent = '…';
            container.appendChild(dots);
        }
        container.appendChild(createBtn(totalPages.toString(), totalPages, { active: currentPage === totalPages }));
    }

    // ▶ Next button
    container.appendChild(
        createBtn(
            '<span class="material-symbols-outlined text-[18px]">chevron_right</span>',
            currentPage + 1,
            { disabled: currentPage === totalPages, isArrow: true }
        )
    );
}
