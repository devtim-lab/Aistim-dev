// ==UserScript==
// @name         AISTIM TOOL
// @namespace    http://tampermonkey.net/
// @version      2026-09-05.18
// @description  Header Cek Selisih + filter Ada Selisih + hasil jadi text (tidak bisa diubah)
// @author       You
// @match        https://trial.erzap.com/stok_opnams/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        autoRefreshSeconds: 60,
        version: 'v2026-09-05.18'
    };

    const STORAGE_KEY = 'erzap_filter';
    const PANEL_STATE_KEY = 'erzap_panel_collapsed';

    const SafeStorage = {
        _mem: {},
        get(key, def) {
            try {
                const v = localStorage.getItem(key);
                if (v !== null) return v;
            } catch (e) {}
            return this._mem[key] !== undefined ? this._mem[key] : def;
        },
        set(key, val) {
            this._mem[key] = val;
            try { localStorage.setItem(key, val); } catch (e) {}
        }
    };

    let allRows = [];
    let rowCounter = 0;
    let observer = null;
    let isFiltering = false;
    let nextRefreshTime = null;
    let countdownInterval = null;
    let refreshTimer = null;
    let initDone = false;

    function log(...args) {
        console.log('[AistimTool]', ...args);
    }

    function analyzeRows(table) {
        const cover = [];
        const infos = [];
        for (const row of table.rows) {
            let covered = 0;
            for (let i = 0; i < cover.length; i++) if (cover[i] > 0) covered++;
            let col = 0;
            for (const cell of row.cells) {
                while (cover[col] > 0) col++;
                const rs = cell.rowSpan || 1;
                const cs = cell.colSpan || 1;
                for (let k = 0; k < cs; k++) cover[col + k] = rs;
                col += cs;
            }
            infos.push({ row, covered });
            for (let i = 0; i < cover.length; i++) if (cover[i] > 0) cover[i]--;
        }
        return infos;
    }

    function addKoreksiColumn() {
        if (isFiltering) return;
        const table = document.querySelector('table.no_data_table.table');
        if (!table) return;

        const infos = analyzeRows(table);
        if (!infos.length) return;

        const headerRows = infos.filter(({row}) => row.closest('thead') !== null || row.querySelector('th'));
        const koreksiAlreadyInHeader = headerRows.some(({row}) => row.querySelector('.koreksi-col'));
        let headerRowSpan = 1;
        if (headerRows.length > 0) {
            for (const c of headerRows[0].row.cells) headerRowSpan = Math.max(headerRowSpan, c.rowSpan || 1);
        }
        let headerAdded = koreksiAlreadyInHeader;
        let addedNew = false;

        infos.forEach(({row, covered}) => {
            if (row.querySelector('.koreksi-col')) return;
            if (row.getAttribute('data-koreksi-done') === '1') return;

            const inThead = row.closest('thead') !== null;
            const hasTh = row.querySelector('th') !== null;
            const isHeaderArea = inThead || hasTh;
            const isStructural = covered > 0;

            if (isHeaderArea) {
                if (!headerAdded) {
                    const th = document.createElement('th');
                    th.className = 'table-header-so koreksi-col';
                    th.style.textAlign = 'center';
                    th.style.verticalAlign = 'middle';
                    th.innerHTML = '<div>Cek Selisih</div>'; // <-- GANTI: Koreksi → Cek Selisih
                    if (headerRowSpan > 1) th.rowSpan = headerRowSpan;
                    row.appendChild(th);
                    headerAdded = true;
                } else if (headerRowSpan === 1) {
                    const th = document.createElement('th');
                    th.className = 'table-header-so koreksi-col';
                    th.style.textAlign = 'center';
                    th.style.verticalAlign = 'middle';
                    th.innerHTML = '';
                    row.appendChild(th);
                }
                return;
            }

            if (isStructural) return;

            const firstCell = row.cells[0];
            const firstCellText = firstCell ? firstCell.textContent.trim() : '';
            const isBlankOrFilter = firstCellText === '';

            const td = document.createElement('td');
            td.className = 'koreksi-col';
            td.style.textAlign = 'center';
            td.style.verticalAlign = 'middle';

            let status = 'unknown';

            if (isBlankOrFilter) {
                td.innerHTML = '';
                td.style.border = 'none';
                status = 'blank';
            } else {
                let nilaiPerhitungan = 0;
                let nilaiStokSO = 0;
                let teksPerhitunganCell = '';

                if (row.cells[5] && row.cells[6]) {
                    teksPerhitunganCell = row.cells[5].textContent.trim();
                    nilaiPerhitungan = parseFloat(teksPerhitunganCell.replace(/[^\d.-]/g, '')) || 0;
                    nilaiStokSO = parseFloat(row.cells[6].textContent.replace(/[^\d.-]/g, '')) || 0;
                }

                const isUncalculated = teksPerhitunganCell === 'PCS' || teksPerhitunganCell === '0.0 PCS';

                if (isUncalculated) {
                    td.innerHTML = '';
                    status = 'uncalculated';
                } else {
                    let hasilKoreksi = nilaiPerhitungan - nilaiStokSO;
                    if (hasilKoreksi === 0) {
                        // <-- GANTI: input number → span text (tidak bisa diubah)
                        td.innerHTML = `<span style="font-weight: bold; color: gray;">0</span>`;
                        status = 'nol';
                    } else {
                        let warnaTeks = hasilKoreksi < 0 ? 'red' : 'green';
                        // <-- GANTI: input number → span text (tidak bisa diubah)
                        td.innerHTML = `<span style="font-weight: bold; color: ${warnaTeks};">${hasilKoreksi}</span>`;
                        status = hasilKoreksi < 0 ? 'negatif' : 'positif';
                    }
                }
            }

            row.appendChild(td);
            row.setAttribute('data-row-idx', String(rowCounter++));
            row.setAttribute('data-koreksi-status', status);
            row.setAttribute('data-koreksi-done', '1');

            allRows.push({ element: row, status, index: rowCounter - 1 });
            addedNew = true;
        });

        if (addedNew) {
            updateFilterCounts();
            applyFilter();
        }
    }

    function getSavedFilter() {
        return SafeStorage.get(STORAGE_KEY, 'koreksi');
    }

    function saveFilter(value) {
        SafeStorage.set(STORAGE_KEY, value);
        log('Filter saved:', value);
    }

    function updateFilterCounts() {
        const select = document.getElementById('erzap-filter-select');
        if (!select) return;

        const counts = { semua: 0, negatif: 0, positif: 0, nol: 0, blank: 0, koreksi: 0 };
        allRows.forEach(({status}) => {
            counts.semua++;
            if (status === 'negatif') counts.negatif++;
            else if (status === 'positif') counts.positif++;
            else if (status === 'nol') counts.nol++;
            else if (status === 'blank' || status === 'uncalculated') counts.blank++;
            if (status === 'negatif' || status === 'positif') counts.koreksi++;
        });

        const baseLabels = {
            semua: '📋 Semua',
            negatif: '🔴 Negatif (-)',
            positif: '🟢 Positif (+)',
            nol: '⚪ Nol (0)',
            blank: '⬜ Blank',
            koreksi: '🔵 Ada Selisih (-/+)' // <-- GANTI: Ada Koreksi → Ada Selisih
        };

        Array.from(select.options).forEach(opt => {
            const key = opt.value;
            if (baseLabels[key]) {
                opt.textContent = `${baseLabels[key]} (${counts[key]})`;
            }
        });
    }

    function applyFilter() {
        if (isFiltering || allRows.length === 0) {
            log('applyFilter skipped:', {isFiltering, len: allRows.length});
            return;
        }
        isFiltering = true;
        if (observer) observer.disconnect();

        const filterValue = getSavedFilter();
        log('Applying filter:', filterValue);

        const table = document.querySelector('table.no_data_table.table');
        if (!table) {
            isFiltering = false;
            if (observer) observer.observe(document.body, { childList: true, subtree: true });
            return;
        }

        const tbody = table.querySelector('tbody');
        if (!tbody) {
            isFiltering = false;
            if (observer) observer.observe(document.body, { childList: true, subtree: true });
            return;
        }

        allRows.forEach(({element}) => {
            if (element.parentNode === tbody) {
                try { tbody.removeChild(element); } catch(e) {}
            }
        });

        let shown = 0;
        allRows.forEach(({element, status}) => {
            let show = true;
            switch (filterValue) {
                case 'negatif': show = status === 'negatif'; break;
                case 'positif': show = status === 'positif'; break;
                case 'nol': show = status === 'nol'; break;
                case 'blank': show = status === 'blank' || status === 'uncalculated'; break;
                case 'koreksi': show = status === 'negatif' || status === 'positif'; break;
                case 'semua':
                default: show = true; break;
            }
            if (show) {
                tbody.appendChild(element);
                shown++;
            }
        });

        log('Filter result:', {filter: filterValue, shown, total: allRows.length});

        const select = document.getElementById('erzap-filter-select');
        if (select) select.value = filterValue;
        updateFilterCounts();

        if (observer) observer.observe(document.body, { childList: true, subtree: true });
        isFiltering = false;
    }

    function getPanelCollapsed() {
        return SafeStorage.get(PANEL_STATE_KEY, '0') === '1';
    }

    function savePanelCollapsed(collapsed) {
        SafeStorage.set(PANEL_STATE_KEY, collapsed ? '1' : '0');
    }

    function createPanel() {
        if (document.getElementById('erzap-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'erzap-panel';

        // Coba cari menu Administrator untuk menempatkan panel di bawahnya
        let adminEl = null;
        let isInline = false;
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
            if (el.textContent && el.textContent.trim() === 'Administrator') {
                adminEl = el;
                break;
            }
        }

        // Jika ketemu Administrator, tempatkan panel di bawahnya (mobile sidebar / desktop topbar)
        if (adminEl) {
            isInline = true;
            // Cari parent container yang cocok untuk menyisipkan panel
            let container = adminEl.closest('li, .nav-item, .menu-item, [class*="menu"], [class*="nav"]');
            if (!container) container = adminEl.parentElement;
            if (container) {
                panel.style.cssText = `
                    z-index: 999999 !important;
                    background: #fff;
                    border: 1px solid #ccc;
                    border-radius: 8px;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    font-size: 12px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    min-width: 180px;
                    overflow: hidden;
                    margin: 8px;
                `;
                // Sisipkan setelah container Administrator
                container.parentNode.insertBefore(panel, container.nextSibling);
            } else {
                isInline = false;
            }
        }

        // Fallback: fixed top-right kalau tidak ketemu Administrator
        if (!isInline) {
            panel.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                z-index: 999999 !important;
                background: #fff;
                border: 1px solid #ccc;
                border-radius: 8px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 12px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                min-width: 180px;
                overflow: hidden;
            `;
            document.body.appendChild(panel);
        }

        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 8px 10px;
            background: #f1f3f5;
            border-bottom: 1px solid #e2e2e2;
            cursor: pointer;
            user-select: none;
        `;

        const titleWrap = document.createElement('div');
        titleWrap.style.cssText = 'display: flex; align-items: baseline; gap: 6px;';

        const title = document.createElement('div');
        title.textContent = '⚙️ Aistim Tool';
        title.style.cssText = 'font-weight: 700; color: #222; font-size: 13px;';

        const version = document.createElement('div');
        version.textContent = CONFIG.version;
        version.style.cssText = 'color: #999; font-size: 10px; font-family: monospace;';

        titleWrap.appendChild(title);
        titleWrap.appendChild(version);

        const btnToggle = document.createElement('button');
        btnToggle.id = 'erzap-panel-toggle';
        btnToggle.style.cssText = `
            background: transparent;
            border: none;
            cursor: pointer;
            font-size: 12px;
            color: #555;
            padding: 0 2px;
            line-height: 1;
        `;

        header.appendChild(titleWrap);
        header.appendChild(btnToggle);

        const body = document.createElement('div');
        body.id = 'erzap-panel-body';
        body.style.cssText = `
            padding: 10px 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        `;

        const filterLabel = document.createElement('div');
        filterLabel.textContent = 'Filter Tampilan:';
        filterLabel.style.cssText = 'color: #555;';

        const filterSelect = document.createElement('select');
        filterSelect.id = 'erzap-filter-select';
        filterSelect.disabled = false;
        filterSelect.style.cssText = `
            padding: 5px 8px;
            border-radius: 4px;
            border: 1px solid #007bff;
            font-size: 12px;
            cursor: pointer;
            background: #ffffff;
            color: #222;
            width: 100%;
            pointer-events: auto !important;
            opacity: 1 !important;
            -webkit-appearance: menulist-button;
            appearance: auto;
            min-height: 32px;
        `;

        const options = [
            { value: 'semua', text: '📋 Semua' },
            { value: 'koreksi', text: '🔵 Ada Selisih (-/+)' }, // <-- GANTI
            { value: 'negatif', text: '🔴 Negatif (-)' },
            { value: 'positif', text: '🟢 Positif (+)' },
            { value: 'nol', text: '⚪ Nol (0)' },
            { value: 'blank', text: '⬜ Blank' }
        ];

        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.text;
            filterSelect.appendChild(o);
        });

        filterSelect.value = getSavedFilter();

        const onFilterChange = (e) => {
            e.stopPropagation();
            saveFilter(e.target.value);
            applyFilter();
        };
        filterSelect.addEventListener('change', onFilterChange);
        filterSelect.addEventListener('input', onFilterChange);
        filterSelect.addEventListener('click', (e) => e.stopPropagation());

        const divider = document.createElement('div');
        divider.style.cssText = 'border-top: 1px solid #eee; margin: 2px 0;';

        const refreshLabel = document.createElement('div');
        refreshLabel.textContent = 'Auto Refresh:';
        refreshLabel.style.cssText = 'color: #555;';

        const countdown = document.createElement('div');
        countdown.id = 'erzap-refresh-countdown';
        countdown.textContent = CONFIG.autoRefreshSeconds > 0 ? 'Menunggu...' : 'Mati';
        countdown.style.cssText = 'color: #007bff; font-family: monospace; font-size: 13px;';

        const btnRefresh = document.createElement('button');
        btnRefresh.textContent = '🔄 Refresh Sekarang';
        btnRefresh.style.cssText = `
            background: #007bff;
            color: #fff;
            border: none;
            border-radius: 4px;
            padding: 7px 10px;
            font-size: 12px;
            cursor: pointer;
            font-weight: 500;
            width: 100%;
        `;
        btnRefresh.onmouseenter = () => btnRefresh.style.background = '#0056b3';
        btnRefresh.onmouseleave = () => btnRefresh.style.background = '#007bff';
        btnRefresh.ontouchstart = () => btnRefresh.style.background = '#0056b3';
        btnRefresh.ontouchend = () => btnRefresh.style.background = '#007bff';
        btnRefresh.onclick = () => location.reload();

        body.appendChild(filterLabel);
        body.appendChild(filterSelect);
        body.appendChild(divider);
        body.appendChild(refreshLabel);
        body.appendChild(countdown);
        body.appendChild(btnRefresh);

        panel.appendChild(header);
        panel.appendChild(body);

        function renderPanelState() {
            const collapsed = getPanelCollapsed();
            body.style.display = collapsed ? 'none' : 'flex';
            header.style.borderBottom = collapsed ? 'none' : '1px solid #e2e2e2';
            btnToggle.textContent = collapsed ? '▼ Show' : '▲ Hide';
            btnToggle.title = collapsed ? 'Tampilkan panel' : 'Sembunyikan panel';
        }

        header.addEventListener('click', () => {
            savePanelCollapsed(!getPanelCollapsed());
            renderPanelState();
        });

        renderPanelState();
        updateFilterCounts();
        log('Panel created');
    }

    function formatCountdown(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function startAutoRefresh() {
        if (!CONFIG.autoRefreshSeconds || CONFIG.autoRefreshSeconds <= 0) return;
        const intervalMs = CONFIG.autoRefreshSeconds * 1000;
        nextRefreshTime = Date.now() + intervalMs;

        countdownInterval = setInterval(() => {
            const el = document.getElementById('erzap-refresh-countdown');
            if (!el || !nextRefreshTime) return;
            const remainingSec = Math.ceil((nextRefreshTime - Date.now()) / 1000);
            if (remainingSec <= 0) {
                el.textContent = 'Refreshing...';
            } else {
                el.textContent = 'Next: ' + formatCountdown(remainingSec);
            }
        }, 1000);

        refreshTimer = setTimeout(() => {
            location.reload();
        }, intervalMs);
    }

    function init() {
        if (initDone) return;
        log('Initializing...');
        addKoreksiColumn();
        createPanel();
        startAutoRefresh();
        initDone = true;
        log('Init complete. Rows:', allRows.length);
    }

    function waitAndInit() {
        if (document.querySelector('table.no_data_table.table')) {
            init();
        } else {
            log('Table not found, waiting...');
            const checkTimer = setInterval(() => {
                if (document.querySelector('table.no_data_table.table')) {
                    clearInterval(checkTimer);
                    init();
                }
            }, 500);
            setTimeout(() => clearInterval(checkTimer), 15000);
        }
    }

    observer = new MutationObserver(() => {
        if (!initDone) return;
        addKoreksiColumn();
    });

    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitAndInit);
    } else {
        waitAndInit();
    }

    setInterval(() => {
        if (!initDone) waitAndInit();
        else addKoreksiColumn();
    }, 1000);

})();