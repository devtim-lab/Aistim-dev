// ==UserScript==
// @name         Lihat Stok - Kolom Rak
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Kolom Rak di kanan Nama pada Lihat Stok. Otomatis diambil dari "Penempatan Rak" di dialog Aktifitas Stok (per gudang yang ada stoknya). Klik sel untuk muat ulang.
// @match        https://*.erzap.com/produk_gudangs/lihat_stok/new*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TABLE_SEL = '#data_table_produk';
    const CACHE_KEY = 'aistim_rak_cache_v2';
    const CACHE_TTL = 60 * 60 * 1000; // 1 jam
    const MAKS_GUDANG = 8;            // batas request aktifitas per produk
    const CONCURRENCY = 3;

    // ---------- cache (localStorage, aman kalau diblokir) ----------
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch (e) { cache = {}; }
    let saveTimer = null;
    function saveCache() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            try {
                const now = Date.now();
                Object.keys(cache).forEach((k) => { if (now - cache[k].t > CACHE_TTL) delete cache[k]; });
                localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
            } catch (e) { /* abaikan */ }
        }, 500);
    }

    const style = document.createElement('style');
    style.textContent = `
        .rk_th, .rk_cell { width: 120px; min-width: 100px; max-width: 200px; box-sizing: border-box; }
        .rk_cell { cursor: pointer; font-size: 12px; word-break: break-word; }
        .rk_cell .rk_val { font-weight: 600; color: #0d6efd; }
        .rk_cell .rk_g { color: #777; font-weight: 400; }
        .rk_cell .rk_muted { color: #aaa; }
        .rk_cell .rk_err { color: #dc3545; }
    `;
    document.head.appendChild(style);

    // ---------- header (DataTables: header terpisah + thead tersembunyi di tabel isi) ----------
    function findIndexIn(tr, label) {
        const ths = tr.children;
        for (let i = 0; i < ths.length; i++) {
            if (ths[i].textContent.trim().toLowerCase() === label) return i;
        }
        return -1;
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

    // ---------- ambil data rak ----------
    function angka(t) {
        const m = String(t || '').match(/-?[\d.,]+/);
        if (!m) return NaN;
        return parseFloat(m[0].replace(/\./g, '').replace(',', '.'));
    }

    async function ambilHtml(url, params) {
        const qs = new URLSearchParams(params).toString();
        const res = await fetch(url + '?' + qs, {
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
    }

    function parseHtml(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelectorAll('script, style').forEach((x) => x.remove());
        return doc;
    }

    // Sama dengan popup "detail stok": label tebal = outlet, label biasa = gudang,
    // lalu <a class="bt_detail_stok_aktifitas" data-gdn> = jumlah stok gudang itu.
    async function daftarGudang(idproduk, idoutlet) {
        const html = await ambilHtml('/produk_gudangs/detail_stok/new', {
            idproduk: idproduk, idgudang: '', idoutlet: idoutlet
        });
        const doc = parseHtml(html);
        const list = [];
        let outlet = '', gudang = '';
        doc.querySelectorAll('label, a.bt_detail_stok_aktifitas').forEach((el) => {
            if (el.tagName === 'LABEL') {
                const teks = el.textContent.trim();
                if (/bold|font-weight:\s*[6-9]00/i.test(el.getAttribute('style') || '')) outlet = teks;
                else gudang = teks;
                return;
            }
            list.push({
                id: el.getAttribute('data-gdn') || '',
                nama: gudang || el.getAttribute('data-gudang-nama') || '',
                outlet: outlet,
                stok: angka(el.textContent)
            });
            gudang = '';
        });
        return list;
    }

    // Dari dialog Aktifitas Stok: blok "Penempatan Rak :" lalu nama rak
    async function rakGudang(idproduk, idgudang, idoutlet) {
        const html = await ambilHtml('/produk_gudangs/aktifitas_stok/new', {
            idproduk: idproduk, idgudang: idgudang, idoutlet: idoutlet,
            idproduk_harga: '', hide_stok_awal_stok_akhir: 'false'
        });
        const teks = parseHtml(html).body.textContent || '';
        const m = teks.match(/Penempatan Rak\s*:?\s*([\s\S]*?)(?:Tabel ini dibaca|Tanggal\s+Kode|$)/i);
        if (!m) return '';
        return m[1].split(/\n+/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean).join(', ');
    }

    async function ambilRakProduk(idproduk, idoutlet, idgudangCell) {
        let gudangs = [];
        try { gudangs = await daftarGudang(idproduk, idoutlet); } catch (e) { /* coba gudang dari sel */ }
        if (!gudangs.length) gudangs = [{ id: idgudangCell || '', nama: '', outlet: '', stok: NaN }];

        // utamakan gudang yang ada stoknya; kalau semua kosong, cek semua
        let target = gudangs.filter((g) => !isNaN(g.stok) && g.stok !== 0);
        if (!target.length) target = gudangs;
        target = target.slice(0, MAKS_GUDANG);

        const hasil = [];
        for (const g of target) {
            const rak = await rakGudang(idproduk, g.id, idoutlet);
            hasil.push({ g: g.nama, o: g.outlet, r: rak });
        }
        return hasil;
    }

    // ---------- tampilan sel ----------
    function renderCell(td, data) {
        td.textContent = '';
        const ada = (data || []).filter((x) => x.r);
        if (!ada.length) {
            const s = document.createElement('span');
            s.className = 'rk_muted';
            s.textContent = '-';
            td.appendChild(s);
            return;
        }
        ada.forEach((x, i) => {
            if (i) td.appendChild(document.createElement('br'));
            if (ada.length > 1 && x.g) {
                const g = document.createElement('span');
                g.className = 'rk_g';
                g.textContent = x.g + ': ';
                td.appendChild(g);
            }
            const v = document.createElement('span');
            v.className = 'rk_val';
            v.textContent = x.r;
            td.appendChild(v);
        });
    }

    function renderStatus(td, teks, cls) {
        td.textContent = '';
        const s = document.createElement('span');
        s.className = cls;
        s.textContent = teks;
        td.appendChild(s);
    }

    // ---------- antrean (maks CONCURRENCY sekaligus) ----------
    const queue = [];
    let running = 0;
    let widthTimer = null;

    function pump() {
        while (running < CONCURRENCY && queue.length) {
            const job = queue.shift();
            running++;
            job().finally(() => {
                running--;
                clearTimeout(widthTimer);
                widthTimer = setTimeout(() => {
                    const t = document.querySelector(TABLE_SEL);
                    if (t) syncWidths(t);
                }, 200);
                pump();
            });
        }
    }

    function muat(td, paksa) {
        const idproduk = td.dataset.prd;
        const idoutlet = td.dataset.otl || '';
        if (!idproduk) { renderStatus(td, '-', 'rk_muted'); return; }
        const key = idproduk + '|' + idoutlet;
        const c = cache[key];
        if (!paksa && c && Date.now() - c.t < CACHE_TTL) { renderCell(td, c.v); return; }

        renderStatus(td, '...', 'rk_muted');
        queue.push(async () => {
            try {
                const v = await ambilRakProduk(idproduk, idoutlet, td.dataset.gdn);
                cache[key] = { t: Date.now(), v: v };
                saveCache();
                // semua sel dengan produk yang sama
                document.querySelectorAll('.rk_cell').forEach((x) => {
                    if (x.dataset.prd === idproduk && (x.dataset.otl || '') === idoutlet) renderCell(x, v);
                });
            } catch (e) {
                console.error('[Rak] gagal produk=', idproduk, e);
                renderStatus(td, 'gagal (klik)', 'rk_err');
            }
        });
        pump();
    }

    // muat hanya saat sel terlihat di layar
    const io = 'IntersectionObserver' in window
        ? new IntersectionObserver((entries) => {
            entries.forEach((en) => {
                if (!en.isIntersecting) return;
                io.unobserve(en.target);
                muat(en.target, false);
            });
        }, { rootMargin: '300px' })
        : null;

    // ---------- pasang kolom ----------
    function enhance(table) {
        const headRow = table.querySelector('thead tr');
        if (!headRow) return;
        const namaIdx = findIndexIn(headRow, 'nama') >= 0
            ? findIndexIn(headRow, 'nama')
            : (headRow.querySelector('.rk_th') ? findIndexIn(headRow, 'rak') - 1 : -1);
        const barcodeIdx = findIndexIn(headRow, 'barcode');
        if (namaIdx < 0 || barcodeIdx < 0) return;

        const wrapper = table.closest('.dataTables_wrapper') || table.parentElement || document;
        const headChanged = enhanceHeaders(wrapper);

        table.querySelectorAll('tbody tr').forEach((tr) => {
            if (tr.querySelector('.rk_cell')) return;
            const tds = tr.children;
            if (tds.length <= Math.max(namaIdx, barcodeIdx)) return; // baris pesan kosong / loading
            if (!tds[barcodeIdx].textContent.trim()) return;

            const stokCell = tr.querySelector('td.bt_dialog_aktifitas_stok');
            const td = document.createElement('td');
            td.className = 'rk_cell';
            if (stokCell) {
                td.dataset.prd = stokCell.dataset.prd || '';
                td.dataset.otl = stokCell.dataset.otl || '';
                td.dataset.gdn = stokCell.dataset.gdn || '';
            }
            renderStatus(td, '...', 'rk_muted');
            tds[namaIdx].insertAdjacentElement('afterend', td);
            if (io) io.observe(td); else muat(td, false);
        });

        if (headChanged) {
            window.dispatchEvent(new Event('resize'));
            [60, 300, 800].forEach((ms) => setTimeout(() => syncWidths(table), ms));
        }
        syncWidths(table);
    }

    // klik sel Rak -> muat ulang dari server
    document.addEventListener('click', (e) => {
        const td = e.target.closest && e.target.closest('.rk_cell');
        if (td) muat(td, true);
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
