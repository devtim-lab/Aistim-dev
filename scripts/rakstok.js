// ==UserScript==
// @name         Lihat Stok - Kolom Rak
// @namespace    http://tampermonkey.net/
// @version      1.4.0
// @description  Lihat Stok: kolom Rak (otomatis dari Penempatan Rak per gudang), thumbnail gambar produk asli (kecil seukuran favicon) di kolom Nama, klik untuk lihat semua gambar di popup, dan kolom Nama yang responsif (teks panjang turun ke bawah, tidak terpotong).
// @match        https://*.erzap.com/produk_gudangs/lihat_stok/new*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TABLE_SEL = '#data_table_produk';
    const CACHE_KEY = 'aistim_rak_cache_v3';
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
        /* Desktop: kolom melebar mengikuti isi, tiap "TOKO: RAK" satu baris utuh (tidak terpotong) */
        .rk_th, .rk_cell { min-width: 120px; box-sizing: border-box; }
        .rk_cell { cursor: pointer; font-size: 12px; }
        .rk_cell .rk_item { display: block; white-space: nowrap; }
        .rk_cell .rk_lanjut { padding-left: 12px; }
        /* Layar sempit (HP): lebar dibatasi, teks boleh turun baris */
        @media (max-width: 768px) {
            .rk_th, .rk_cell { width: 130px; max-width: 200px; }
            .rk_cell .rk_item { white-space: normal; word-break: break-word; }
        }
        .rk_cell .rk_val { font-weight: 600; color: #0d6efd; }
        .rk_cell .rk_g { color: #777; font-weight: 400; }
        .rk_cell .rk_muted { color: #aaa; }
        .rk_cell .rk_err { color: #dc3545; }

        .gs_ikon { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px;
                   margin: 0 5px 2px 0; border: 1px solid #ccd; border-radius: 4px; background: #f4f6ff;
                   cursor: pointer; font-size: 11px; line-height: 1; vertical-align: middle; user-select: none;
                   overflow: hidden; box-sizing: border-box; }
        .gs_ikon:hover { background: #e3e8ff; }
        .gs_ikon.gs_kosong { opacity: .45; }
        .gs_ikon img { width: 100%; height: 100%; object-fit: cover; display: block; }
        #gs_modal_bd { position: fixed; inset: 0; z-index: 99996; background: rgba(0,0,0,.55);
                       display: flex; align-items: center; justify-content: center; }
        #gs_modal { background: #fff; border-radius: 10px; width: 94%; max-width: 560px; max-height: 88vh;
                    display: flex; flex-direction: column; box-shadow: 0 6px 24px rgba(0,0,0,.35); font-family: inherit; }
        #gs_modal .gs_head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
                             padding: 12px 14px; border-bottom: 1px solid #eee; }
        #gs_modal .gs_judul { font-weight: 600; font-size: 14px; word-break: break-word; }
        #gs_modal .gs_tutup { border: none; background: none; font-size: 22px; line-height: 1; cursor: pointer; color: #666; }
        #gs_modal .gs_isi { padding: 12px 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; align-items: center; }
        #gs_modal .gs_isi img { max-width: 100%; max-height: 70vh; object-fit: contain; border: 1px solid #eee; border-radius: 6px; background: #fafafa; }
        #gs_modal .gs_info { color: #777; font-size: 13px; padding: 20px 0; text-align: center; }
        #gs_modal .gs_info.gs_err { color: #dc3545; }

        /* Kolom Nama responsif: teks panjang turun ke bawah, tidak terpotong */
        .rs_nama_th, .rs_nama { min-width: 220px; }
        .rs_nama { white-space: normal !important; overflow: visible !important; text-overflow: clip !important;
                   max-width: none !important; word-break: break-word; }
        .rs_nama * { white-space: normal !important; overflow: visible !important; text-overflow: clip !important; }
        @media (max-width: 768px) { .rs_nama_th, .rs_nama { min-width: 160px; } }
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
            const idx = findIndexIn(tr, 'nama');
            if (idx < 0) return;
            tr.children[idx].classList.add('rs_nama_th');
            if (tr.querySelector('.rk_th')) return;
            const th = tr.children[idx].cloneNode(true);
            th.className = (th.className || '').replace(/\bsorting\w*\b/g, '').replace(/\brs_nama_th\b/g, '').trim() + ' rk_th';
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

    // Catatan ringkas tiap request (dibaca tombol Perekam lewat atribut dokumen)
    const rakLog = [];
    function catatLog(baris) {
        rakLog.push(new Date().toTimeString().slice(0, 8) + ' ' + baris);
        if (rakLog.length > 30) rakLog.shift();
        try { document.documentElement.setAttribute('data-aistim-rak-log', rakLog.join('\n')); } catch (e) { /* abaikan */ }
    }

    async function ambilHtml(url, params) {
        const qs = new URLSearchParams(params).toString();
        let res;
        try {
            res = await fetch(url + '?' + qs, {
                credentials: 'same-origin',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'text/plain, */*; q=0.01' // sama dengan $.ajax dataType:text milik situs
                }
            });
        } catch (e) {
            catatLog('FETCH ' + url + '?' + qs + ' -> ERROR ' + e);
            throw e;
        }
        catatLog('FETCH ' + url + '?' + qs + ' -> ' + res.status);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
    }

    function parseHtml(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelectorAll('script, style').forEach((x) => x.remove());
        doc.querySelectorAll('br').forEach((b) => b.replaceWith('\n')); // textContent tidak memuat <br>
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
        if (!m) {
            catatLog('RAK tidak ketemu di respons (' + teks.length + ' char): ' + teks.replace(/\s+/g, ' ').trim().slice(0, 150));
            return '';
        }
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
        let errTerakhir = null;
        for (const g of target) {
            try {
                const rak = await rakGudang(idproduk, g.id, idoutlet);
                hasil.push({ g: g.nama, o: g.outlet, r: rak });
            } catch (e) {
                errTerakhir = e;
                console.error('[Rak] gudang', g.id, g.nama, e);
            }
        }
        if (!hasil.length && errTerakhir) throw errTerakhir;
        return hasil;
    }

    // ---------- sinkron lebar header (dipanggil setelah isi sel berubah) ----------
    let syncTimer = null;
    function jadwalSync() {
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
            const t = document.querySelector(TABLE_SEL);
            if (t) syncWidths(t);
        }, 200);
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
        ada.forEach((x) => {
            // maksimal 1 nama rak per baris, sisanya turun ke baris berikutnya
            const names = x.r.split(/\s*,\s*/).filter(Boolean);
            const chunks = [];
            for (let i = 0; i < names.length; i += 1) chunks.push(names.slice(i, i + 1).join(', '));
            chunks.forEach((teks, idx) => {
                const baris = document.createElement('span');
                baris.className = 'rk_item' + (idx > 0 && x.g ? ' rk_lanjut' : '');
                if (idx === 0 && x.g) {
                    const g = document.createElement('span');
                    g.className = 'rk_g';
                    g.textContent = x.g + ': ';
                    baris.appendChild(g);
                }
                const v = document.createElement('span');
                v.className = 'rk_val';
                v.textContent = teks;
                baris.appendChild(v);
                td.appendChild(baris);
            });
        });
        jadwalSync();
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

    function pump() {
        while (running < CONCURRENCY && queue.length) {
            const job = queue.shift();
            running++;
            job().finally(() => {
                running--;
                jadwalSync();
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
                renderStatus(td, 'gagal: ' + (e && e.message ? e.message : e) + ' (klik)', 'rk_err');
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

    const GCACHE = {}; // id -> [url,...] selama halaman terbuka

    // ---------- ambil semua gambar dari halaman detail produk ----------
    const GPROMISE = {}; // id -> promise yang sedang berjalan (hindari fetch ganda)
    function ambilGambar(id) {
        if (GCACHE[id]) return Promise.resolve(GCACHE[id]);
        if (!GPROMISE[id]) {
            GPROMISE[id] = ambilGambarFetch(id).finally(() => { delete GPROMISE[id]; });
        }
        return GPROMISE[id];
    }

    async function ambilGambarFetch(id) {
        const res = await fetch('/produks/' + encodeURIComponent(id), {
            credentials: 'same-origin',
            headers: { 'Accept': 'text/html' }
        });
        catatLog('GET /produks/' + id + ' -> ' + res.status);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const pane = doc.querySelector('#tab_produk_gambar');
        if (!pane) { catatLog('produk ' + id + ': #tab_produk_gambar tidak ada'); GCACHE[id] = []; return []; }
        const urls = [];
        pane.querySelectorAll('img').forEach((im) => {
            const src = im.getAttribute('src') || im.getAttribute('data-src') || '';
            if (!src || /^data:/i.test(src)) return;
            try {
                const u = new URL(src, location.origin).href;
                if (urls.indexOf(u) === -1) urls.push(u);
            } catch (e) { /* lewati */ }
        });
        if (!urls.length) catatLog('produk ' + id + ': tidak ada <img> di tab Gambar');
        GCACHE[id] = urls;
        return urls;
    }

    // ---------- thumbnail kecil (seukuran favicon) di kolom Nama ----------
    // Dimuat bertahap: hanya saat ikon terlihat di layar, maks 3 permintaan sekaligus.
    const ANTRI = [];
    let jalan = 0;
    const MAKS_PARALEL = 3;

    function pasangThumb(ikon, urls) {
        if (!urls.length) { ikon.classList.add('gs_kosong'); return; }
        const img = document.createElement('img');
        img.alt = '';
        img.loading = 'lazy';
        img.src = urls[0];
        img.addEventListener('error', () => { img.remove(); ikon.textContent = '🖼️'; ikon.classList.add('gs_kosong'); });
        ikon.textContent = '';
        ikon.appendChild(img);
    }

    function pompaThumb() {
        while (jalan < MAKS_PARALEL && ANTRI.length) {
            const ikon = ANTRI.shift();
            if (!document.body.contains(ikon)) continue;
            jalan++;
            ambilGambar(ikon.dataset.prd)
                .then((urls) => pasangThumb(ikon, urls))
                .catch(() => { ikon.classList.add('gs_kosong'); })
                .finally(() => { jalan--; pompaThumb(); });
        }
    }

    const ioThumb = 'IntersectionObserver' in window
        ? new IntersectionObserver((entries) => {
            entries.forEach((en) => {
                if (!en.isIntersecting) return;
                ioThumb.unobserve(en.target);
                ANTRI.push(en.target);
            });
            pompaThumb();
        }, { rootMargin: '200px' })
        : null;

    // ---------- popup ----------
    function tutupModal() {
        const bd = document.getElementById('gs_modal_bd');
        if (bd) bd.remove();
    }

    function bukaModal(id, judul) {
        tutupModal();
        const bd = document.createElement('div');
        bd.id = 'gs_modal_bd';
        const modal = document.createElement('div');
        modal.id = 'gs_modal';

        const head = document.createElement('div');
        head.className = 'gs_head';
        const j = document.createElement('div');
        j.className = 'gs_judul';
        j.textContent = judul || ('Produk ' + id);
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'gs_tutup';
        x.innerHTML = '&times;';
        x.addEventListener('click', tutupModal);
        head.appendChild(j);
        head.appendChild(x);

        const isi = document.createElement('div');
        isi.className = 'gs_isi';
        const info = document.createElement('div');
        info.className = 'gs_info';
        info.textContent = 'Memuat gambar...';
        isi.appendChild(info);

        modal.appendChild(head);
        modal.appendChild(isi);
        bd.appendChild(modal);
        bd.addEventListener('click', (e) => { if (e.target === bd) tutupModal(); });
        document.body.appendChild(bd);

        ambilGambar(id).then((urls) => {
            if (!document.body.contains(bd)) return; // popup sudah ditutup
            isi.textContent = '';
            if (!urls.length) {
                const t = document.createElement('div');
                t.className = 'gs_info';
                t.textContent = 'Produk ini belum punya gambar.';
                isi.appendChild(t);
                return;
            }
            urls.forEach((u) => {
                const img = document.createElement('img');
                img.alt = '';
                img.src = u;
                img.addEventListener('error', () => { img.alt = 'Gambar gagal dimuat'; });
                isi.appendChild(img);
            });
        }).catch((e) => {
            console.error('[Gambar] gagal produk=', id, e);
            catatLog('produk ' + id + ' gagal: ' + e.message);
            isi.textContent = '';
            const t = document.createElement('div');
            t.className = 'gs_info gs_err';
            t.textContent = 'Gagal memuat gambar (' + e.message + ').';
            isi.appendChild(t);
        });
    }

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') tutupModal(); });

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
            const namaTd = tds[namaIdx];
            namaTd.classList.add('rs_nama');
            if (stokCell && stokCell.dataset.prd && !namaTd.querySelector('.gs_ikon')) {
                const ikon = document.createElement('span');
                ikon.className = 'gs_ikon';
                ikon.title = 'Lihat gambar produk';
                ikon.textContent = '\uD83D\uDDBC\uFE0F'; // ikon gambar
                ikon.dataset.prd = stokCell.dataset.prd;
                namaTd.insertBefore(ikon, namaTd.firstChild);
                if (ioThumb) ioThumb.observe(ikon); else { ANTRI.push(ikon); pompaThumb(); }
            }
            namaTd.insertAdjacentElement('afterend', td);
            if (io) io.observe(td); else muat(td, false);
        });

        if (headChanged) {
            window.dispatchEvent(new Event('resize'));
            [60, 300, 800].forEach((ms) => setTimeout(() => syncWidths(table), ms));
        }
        syncWidths(table);
    }

    // klik ikon gambar -> ambil & tampilkan gambar di popup
    document.addEventListener('click', (e) => {
        const ikon = e.target.closest && e.target.closest('.gs_ikon');
        if (!ikon) return;
        e.preventDefault();
        e.stopPropagation();
        const td = ikon.closest('td');
        const judul = td ? td.textContent.replace(ikon.textContent, '').replace(/\s+/g, ' ').trim() : '';
        bukaModal(ikon.dataset.prd, judul);
    }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') tutupModal(); });

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
