// ==UserScript==
// @name         Lihat Stok - Kolom Rak
// @namespace    http://tampermonkey.net/
// @version      1.0.2
// @description  Tambah kolom Rak di sebelah kanan Nama pada tabel Lihat Stok. Klik sel untuk isi/ubah rak (disimpan di browser per barcode).
// @match        https://*.erzap.com/produk_gudangs/lihat_stok/new*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'aistim_rak_lihat_stok_v1';
    const TABLE_SEL = '#data_table_produk';

    function loadMap() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; }
        catch (e) { return {}; }
    }
    function saveMap(map) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch (e) { /* abaikan */ }
    }

    const style = document.createElement('style');
    style.textContent = `
        .rk_th, .rk_cell { width: 90px; min-width: 90px; max-width: 140px; box-sizing: border-box; }
        .rk_cell { cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .rk_cell .rk_val { font-weight: 600; color: #0d6efd; }
        .rk_cell .rk_kosong { color: #aaa; font-style: italic; font-size: 12px; }
    `;
    document.head.appendChild(style);

    function findIndexIn(tr, label) {
        const ths = tr.children;
        for (let i = 0; i < ths.length; i++) {
            if (ths[i].textContent.trim().toLowerCase() === label) return i;
        }
        return -1;
    }

    function renderCell(td, rak) {
        td.innerHTML = rak
            ? '<span class="rk_val"></span>'
            : '<span class="rk_kosong">+ rak</span>';
        if (rak) td.firstChild.textContent = rak;
    }

    function setThText(th, txt) {
        const w = document.createTreeWalker(th, NodeFilter.SHOW_TEXT);
        let first = null, n;
        const rest = [];
        while ((n = w.nextNode())) {
            if (!n.nodeValue.trim()) continue;
            if (!first) first = n; else rest.push(n);
        }
        if (first) { first.nodeValue = txt; rest.forEach((x) => (x.nodeValue = '')); }
        else th.textContent = txt;
    }

    // Header: tabel Lihat Stok memakai DataTables dengan header terpisah (scrollHead) +
    // thead tersembunyi di tabel isi. Tambah kolom di SEMUA thead yang punya "Nama",
    // dengan meng-clone th Nama supaya struktur/gaya (termasuk yang disembunyikan) sama.
    function enhanceHeaders(root) {
        let changed = false;
        root.querySelectorAll('thead tr').forEach((tr) => {
            if (tr.querySelector('.rk_th')) return;
            const idx = findIndexIn(tr, 'nama');
            if (idx < 0) return;
            const th = tr.children[idx].cloneNode(true);
            th.className = (th.className || '').replace(/\bsorting\w*\b/g, '').trim() + ' rk_th';
            th.removeAttribute('aria-sort');
            th.removeAttribute('aria-label');
            th.removeAttribute('tabindex');
            th.style.width = '';
            th.style.cursor = 'default';
            setThText(th, 'Rak');
            tr.children[idx].insertAdjacentElement('afterend', th);
            changed = true;
        });
        return changed;
    }

    function enhance(table) {
        const headRow = table.querySelector('thead tr');
        if (!headRow) return;
        const namaIdx = findIndexIn(headRow, 'nama') >= 0 ? findIndexIn(headRow, 'nama') : (headRow.querySelector('.rk_th') ? findIndexIn(headRow, 'rak') - 1 : -1);
        const barcodeIdx = findIndexIn(headRow, 'barcode');
        if (namaIdx < 0 || barcodeIdx < 0) return;

        const wrapper = table.closest('.dataTables_wrapper') || table.parentElement || document;
        const headChanged = enhanceHeaders(wrapper);

        // Baris data
        const map = loadMap();
        table.querySelectorAll('tbody tr').forEach((tr) => {
            if (tr.querySelector('.rk_cell')) return;
            const tds = tr.children;
            if (tds.length <= Math.max(namaIdx, barcodeIdx)) return; // baris pesan kosong / loading
            const barcode = tds[barcodeIdx].textContent.trim();
            if (!barcode) return;

            const td = document.createElement('td');
            td.className = 'rk_cell';
            td.dataset.barcode = barcode;
            renderCell(td, map[barcode] || '');
            tds[namaIdx].insertAdjacentElement('afterend', td);
        });

        if (headChanged) {
            window.dispatchEvent(new Event('resize')); // biar DataTables hitung ulang dulu
            [60, 300, 800].forEach((ms) => setTimeout(() => syncWidths(table), ms));
        }
        syncWidths(table);
    }

    // Samakan lebar tiap kolom header (tabel header terpisah) dengan kolom tabel isi,
    // supaya th dan td lurus walau tabel bisa di-scroll horizontal.
    function syncWidths(table) {
        const wrapper = table.closest('.dataTables_wrapper');
        if (!wrapper) return;
        const bodyThs = table.querySelectorAll('thead tr:first-child th');
        if (!bodyThs.length) return;
        const widths = Array.from(bodyThs).map((t) => t.getBoundingClientRect().width);
        if (widths.some((w) => !w)) return;
        const total = table.getBoundingClientRect().width;
        wrapper.querySelectorAll('table').forEach((t) => {
            if (t === table) return;
            const ths = t.querySelectorAll('thead tr:first-child th');
            if (ths.length !== widths.length) return;
            t.style.width = total + 'px';
            const inner = t.closest('.dataTables_scrollHeadInner');
            if (inner) inner.style.width = total + 'px';
            ths.forEach((th, i) => {
                th.style.boxSizing = 'border-box';
                th.style.width = th.style.minWidth = th.style.maxWidth = widths[i] + 'px';
            });
        });
    }

    // Klik sel Rak -> isi/ubah (prompt, ramah HP)
    document.addEventListener('click', (e) => {
        const td = e.target.closest && e.target.closest('.rk_cell');
        if (!td) return;
        const barcode = td.dataset.barcode;
        const map = loadMap();
        const input = prompt('Rak untuk barcode ' + barcode + ' (kosongkan untuk hapus):', map[barcode] || '');
        if (input === null) return;
        const val = input.trim();
        if (val) map[barcode] = val; else delete map[barcode];
        saveMap(map);
        // perbarui semua sel dengan barcode yang sama
        document.querySelectorAll('.rk_cell').forEach((c) => {
            if (c.dataset.barcode === barcode) renderCell(c, val);
        });
    });

    let timer = null;
    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(() => {
            const table = document.querySelector(TABLE_SEL);
            if (table) enhance(table);
        }, 150);
    }

    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', () => {
        const t = document.querySelector(TABLE_SEL);
        if (t) setTimeout(() => syncWidths(t), 100);
    });
    schedule();
})();
