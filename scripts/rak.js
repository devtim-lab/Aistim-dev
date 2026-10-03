// ==UserScript==
// @name         Lihat Stok - Kolom Rak
// @namespace    http://tampermonkey.net/
// @version      1.0.0
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
        .rk_cell { cursor: pointer; white-space: nowrap; min-width: 60px; }
        .rk_cell .rk_val { font-weight: 600; color: #0d6efd; }
        .rk_cell .rk_kosong { color: #aaa; font-style: italic; font-size: 12px; }
    `;
    document.head.appendChild(style);

    function findIndex(table, label) {
        const ths = table.querySelectorAll('thead th');
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

    function enhance(table) {
        const namaIdx = findIndex(table, 'nama');
        const barcodeIdx = findIndex(table, 'barcode');
        if (namaIdx < 0 || barcodeIdx < 0) return;

        // Header
        const headRow = table.querySelector('thead tr');
        if (headRow && !headRow.querySelector('.rk_th')) {
            const namaTh = headRow.children[namaIdx];
            const th = document.createElement('th');
            th.className = 'rk_th';
            th.textContent = 'Rak';
            th.style.cursor = 'default';
            namaTh.insertAdjacentElement('afterend', th);
        }

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
    schedule();
})();
