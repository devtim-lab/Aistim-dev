// ==UserScript==
// @name         Lihat Stok - Gambar Produk
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Thumbnail gambar produk di kolom Nama pada Lihat Stok. Diambil dari tab Gambar di halaman detail produk (/produks/<id>), dimuat saat baris terlihat & disimpan di cache. Klik thumbnail untuk memperbesar.
// @match        https://*.erzap.com/produk_gudangs/lihat_stok/new*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TABLE_SEL = '#data_table_produk';
    const CACHE_KEY = 'aistim_gambar_cache_v1';
    const TTL = 24 * 60 * 60 * 1000;      // gambar ketemu: 24 jam
    const TTL_KOSONG = 60 * 60 * 1000;    // tidak ada gambar / gagal: 1 jam
    const CONCURRENCY = 3;

    // ---------- cache ----------
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch (e) { cache = {}; }
    let saveTimer = null;
    function saveCache() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            try {
                const now = Date.now();
                Object.keys(cache).forEach((k) => {
                    const ttl = cache[k].u ? TTL : TTL_KOSONG;
                    if (now - cache[k].t > ttl) delete cache[k];
                });
                localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
            } catch (e) { /* abaikan */ }
        }, 500);
    }

    // ---------- log ringkas (dibaca devtool) ----------
    const logBaris = [];
    function catatLog(b) {
        logBaris.push(new Date().toTimeString().slice(0, 8) + ' ' + b);
        if (logBaris.length > 30) logBaris.shift();
        try { document.documentElement.setAttribute('data-aistim-gambar-log', logBaris.join('\n')); } catch (e) { /* abaikan */ }
    }

    const style = document.createElement('style');
    style.textContent = `
        .gs_box { float: left; width: 44px; height: 44px; margin: 0 8px 4px 0; border: 1px solid #ddd;
                  border-radius: 4px; background: #fafafa; display: flex; align-items: center;
                  justify-content: center; overflow: hidden; font-size: 11px; color: #aaa; cursor: default; }
        .gs_box.gs_ada { cursor: zoom-in; }
        .gs_box img { width: 100%; height: 100%; object-fit: contain; }
        #gs_lightbox { position: fixed; inset: 0; z-index: 99996; background: rgba(0,0,0,.75);
                       display: flex; align-items: center; justify-content: center; cursor: zoom-out; }
        #gs_lightbox img { max-width: 92vw; max-height: 90vh; background: #fff; border-radius: 6px; }
    `;
    document.head.appendChild(style);

    // ---------- ambil URL gambar dari halaman detail produk ----------
    async function ambilUrlGambar(id) {
        const res = await fetch('/produks/' + encodeURIComponent(id), {
            credentials: 'same-origin',
            headers: { 'Accept': 'text/html' }
        });
        catatLog('GET /produks/' + id + ' -> ' + res.status);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const pane = doc.querySelector('#tab_produk_gambar');
        if (!pane) { catatLog('produk ' + id + ': #tab_produk_gambar tidak ada'); return ''; }
        for (const im of pane.querySelectorAll('img')) {
            const src = im.getAttribute('src') || im.getAttribute('data-src') || '';
            if (!src || /^data:/i.test(src)) continue;
            try { return new URL(src, location.origin).href; } catch (e) { /* lanjut */ }
        }
        catatLog('produk ' + id + ': tidak ada <img> di tab Gambar');
        return '';
    }

    // ---------- tampilan ----------
    function tampil(box, url) {
        box.textContent = '';
        box.classList.toggle('gs_ada', !!url);
        if (!url) { box.textContent = '-'; return; }
        const img = document.createElement('img');
        img.alt = '';
        img.loading = 'lazy';
        img.src = url;
        img.addEventListener('error', () => { box.classList.remove('gs_ada'); box.textContent = '!'; });
        box.dataset.url = url;
        box.appendChild(img);
        jadwalResize();
    }

    let resizeTimer = null;
    function jadwalResize() { // minta tabel (DataTables / kolom Rak) hitung ulang lebar kolom
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
    }

    // ---------- antrean ----------
    const queue = [];
    let running = 0;
    function pump() {
        while (running < CONCURRENCY && queue.length) {
            const job = queue.shift();
            running++;
            job().finally(() => { running--; pump(); });
        }
    }

    function muat(box) {
        const id = box.dataset.prd;
        if (!id) { tampil(box, ''); return; }
        const c = cache[id];
        if (c && Date.now() - c.t < (c.u ? TTL : TTL_KOSONG)) { tampil(box, c.u); return; }
        box.textContent = '...';
        queue.push(async () => {
            try {
                const u = await ambilUrlGambar(id);
                cache[id] = { t: Date.now(), u: u };
                saveCache();
                document.querySelectorAll('.gs_box').forEach((b) => { if (b.dataset.prd === id) tampil(b, u); });
            } catch (e) {
                console.error('[Gambar] gagal produk=', id, e);
                catatLog('produk ' + id + ' gagal: ' + e.message);
                box.textContent = '!';
            }
        });
        pump();
    }

    const io = 'IntersectionObserver' in window
        ? new IntersectionObserver((entries) => {
            entries.forEach((en) => {
                if (!en.isIntersecting) return;
                io.unobserve(en.target);
                muat(en.target);
            });
        }, { rootMargin: '300px' })
        : null;

    // ---------- pasang di kolom Nama ----------
    function findIndexIn(tr, label) {
        for (let i = 0; i < tr.children.length; i++) {
            if (tr.children[i].textContent.trim().toLowerCase() === label) return i;
        }
        return -1;
    }

    function enhance(table) {
        const headRow = table.querySelector('thead tr');
        if (!headRow) return;
        const namaIdx = findIndexIn(headRow, 'nama');
        if (namaIdx < 0) return;

        table.querySelectorAll('tbody tr').forEach((tr) => {
            if (tr.querySelector('.gs_box')) return;
            const tds = tr.children;
            if (tds.length <= namaIdx) return; // baris pesan kosong / loading
            const stokCell = tr.querySelector('td.bt_dialog_aktifitas_stok');
            if (!stokCell || !stokCell.dataset.prd) return;

            const box = document.createElement('span');
            box.className = 'gs_box';
            box.dataset.prd = stokCell.dataset.prd;
            box.textContent = '...';
            tds[namaIdx].insertBefore(box, tds[namaIdx].firstChild);
            if (io) io.observe(box); else muat(box);
        });
    }

    // klik thumbnail -> perbesar
    document.addEventListener('click', (e) => {
        const box = e.target.closest && e.target.closest('.gs_box.gs_ada');
        if (!box || !box.dataset.url) return;
        e.stopPropagation();
        const lb = document.createElement('div');
        lb.id = 'gs_lightbox';
        const img = document.createElement('img');
        img.src = box.dataset.url;
        lb.appendChild(img);
        lb.addEventListener('click', () => lb.remove());
        document.body.appendChild(lb);
    }, true);

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
