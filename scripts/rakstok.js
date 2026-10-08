// ==UserScript==
// @name         Lihat Stok - Kolom Rak
// @namespace    http://tampermonkey.net/
// @version      1.11.2
// @description  Lihat Stok: kolom Rak (tulisan "Lihat rak", klik untuk popup daftar rak per toko/gudang dari Penempatan Rak), ikon logo PartDistro di kolom Nama (gambar produk baru dimuat & tampil di popup saat ikon diklik), tombol panah di kolom Harga Jual untuk melihat harga jual per pelanggan (Basic dst., diambil dari tab harga di detail produk), dan kolom Nama yang responsif (teks panjang turun ke bawah, tidak terpotong).
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

    // ---------- cache (localStorage, aman kalau diblokir) ----------
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch (e) { cache = {}; }
    // buang entri kedaluwarsa saat dimuat (bukan hanya saat menyimpan)
    Object.keys(cache).forEach((k) => { if (!cache[k] || Date.now() - cache[k].t > CACHE_TTL) delete cache[k]; });
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

    // logo PartDistro sebagai ikon gambar produk (sebelum foto termuat / bila tanpa foto)
    const LOGO_IKON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAAPFBMVEVHcEztHCT////sAATtHCTtHCTtHCTtHCTtHCTtHCTtEhzwTVH4ubruNDn6y8zzf4H83t/+8vLyaGz1m50cRTncAAAACnRSTlMA////pHz73ii9DsDuxAAAAnVJREFUWIXNl9uaoyAMgJW0ajkf3v9dN1i/kQhB3LnYzcWMRfMTIAnJNB2yvT/rPCjr571NVLZh5UOWlSBeD9V3eZ36T6c/ZB3Qlyi3BMZ+CQBSoUB+aH+zr2Jj1E2y4hCbDIPYmAVIcF4Q8a6JWNsGQAyikhChacK7Mb2t1bPo2ojlPX0qfdOY/jDCVIRPtQXScOpZKsI6PdJvEK4AYO0/VnHdyQsAdF8/72QPIOOdvhBRdgCXBeiY3ThSqy6LIABw1NjvuWNQEISTPKD0XwcM2QMHIEfoyGeEQI6yBEDiN7tcRQIOUMRA5bPyfGdZQGANICYEFnBOEmsLChdhAOUetpJHexdLgGrPUdun/g3gt0sY2cQuYOAYb5ZwvuQcqQsovZRz5R6ABBN5MwSQZZjx4cwApISZ3DSRSygEcIpx9KLybEorAR1RbFIdA3TS+hDAdy6WEUCYO1fbAKBxPT8C+EbF9QTQKDCeALxqJYlhgI1MnTYCCNbNXKVYFRhXMWbO/sx/cAeozv0x4E7+A8BS/ir3Cwv9vUz/DpzbSM9jIYUmJGv13iKgcozKWuvAm/w7me+wnC3JSCspdcF7F/TszKyM8jaKpEXUUjl0EWdMlMbJGEhW/5BiG3wC64UVmEN1CAkzm9fC4YAW+IBPXhhHIvJNyv29yIo4rUZVq9X+F2k2gTDaZ76nEbVspOHIr/EGUDj9AZhx1ugSDhlrcQgCuVX2rmmjAJntzBbgxDmIABEh4N2uLWCwBOqZW6PpAvNdJOTskU8VMzt8Dw9vCBoVr2bbJ3/8//r/KiONY09+9H/f+v5F8z2vVf+O7f9yr5dlKdv/P98nJyMLRjJkAAAAAElFTkSuQmCC';

    const style = document.createElement('style');
    style.textContent = `
        /* Kolom Rak sempit: lebar hanya sebesar tulisan "Lihat rak" */
        /* lebar dikunci hanya di tabel isi; header mengikuti lebar kolom isi lewat syncWidths supaya selalu sejajar */
        #data_table_produk .rk_th, #data_table_produk .rk_cell { width: 76px !important; min-width: 76px !important; max-width: 76px !important; white-space: nowrap; box-sizing: border-box; }
        .rk_th { white-space: nowrap; }
        .rk_cell { cursor: pointer; font-size: 12px; }
        /* Layar sempit (HP): lebar dibatasi */
        @media (max-width: 768px) {
            #data_table_produk .rk_th, #data_table_produk .rk_cell { width: 76px !important; max-width: 76px !important; }
        }
        .rk_cell .rk_muted { color: #aaa; }
        .rk_cell .rk_lihat { color: #0d6efd; text-decoration: underline; white-space: nowrap; }
        /* Popup rak: melayang di area tabel, mirip popup detail stok */
        #gs_rak_pop { position: absolute; z-index: 99995; box-sizing: border-box; min-width: 150px; max-width: min(280px, 94vw);
                      display: flex; flex-direction: column; background: #fff; border: 1px solid #ccc; border-radius: 4px;
                      box-shadow: 0 4px 16px rgba(0,0,0,.25); font-size: 12px; text-align: left; }
        #gs_rak_pop .rk_head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 5px 8px; border-bottom: 1px solid #ddd; }
        #gs_rak_pop .rk_judul { font-size: 11px; font-weight: 600; color: #555; word-break: break-word; }
        #gs_rak_pop .rk_x { border: none; background: none; font-size: 16px; line-height: 1; cursor: pointer; color: #666; padding: 0 2px; }
        #gs_rak_pop .rk_isi { padding: 5px 8px; overflow-y: auto; min-height: 0; overscroll-behavior: contain; }
        #gs_rak_pop .rk_baris { padding: 3px 0; border-bottom: 1px solid #ddd; }
        #gs_rak_pop .rk_baris:first-child { padding-top: 0; }
        #gs_rak_pop .rk_baris:last-of-type { border-bottom: 0; }
        #gs_rak_pop .rk_gn { font-weight: 700; color: #444; }
        #gs_rak_pop .rk_rv { font-weight: 600; color: #0d9bdb; padding-left: 0; }
        #gs_rak_pop .rk_info { color: #777; font-size: 11px; padding: 4px 0; }
        #gs_rak_pop .rk_info.rk_err { color: #dc3545; }
        #gs_rak_pop .rk_tutup { display: block; padding: 3px 10px; border: 1px solid #ccc; border-radius: 4px; background: #fff; cursor: pointer; font-size: 11px; color: #444; }
        #gs_rak_pop .rk_tutup:hover { background: #f0f0f0; }
        #gs_rak_pop .rk_foot { flex: none; padding: 5px 8px; border-top: 1px solid #ddd; background: #fff; border-radius: 0 0 4px 4px; }
        #gs_rak_pop.rk_gambar { max-width: min(340px, 94vw); }
        #gs_rak_pop.rk_gambar .rk_isi img { display: block; max-width: 100%; margin: 0 auto 6px; border: 1px solid #eee; border-radius: 4px; background: #fafafa;
                                            pointer-events: none; -webkit-touch-callout: none; -webkit-user-drag: none; user-select: none; }

        /* Ikon gambar (logo PartDistro) di kolom Nama */
        .gs_ikon { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px;
                   margin: 0 5px 2px 0; border: 1px solid #ccd; border-radius: 4px; background: #f4f6ff;
                   cursor: pointer; font-size: 11px; line-height: 1; vertical-align: middle; user-select: none;
                   overflow: hidden; box-sizing: border-box; flex: none; max-width: 20px; max-height: 20px; }
        .gs_ikon:hover { background: #e3e8ff; }
        .gs_ikon.gs_logo { background: #fff url("${LOGO_IKON}") no-repeat 50% 50% / contain; border-color: #e3e3e8; }

        /* Harga jual per pelanggan: dibuka lewat panah merah bawaan situs (fa-angle-double-down) di sel Harga Jual */
        .hj_td i.fa-angle-double-down, .hj_td .hj_btn { cursor: pointer; padding: 0 4px; }
        .hj_td .hj_btn { color: red; font-style: normal; }
        #gs_rak_pop .hj_row { display: flex; justify-content: space-between; gap: 14px; padding: 3px 0; border-bottom: 1px solid #ddd; }
        #gs_rak_pop .hj_row:last-of-type { border-bottom: 0; }
        #gs_rak_pop .hj_nm { font-weight: 700; color: #444; }
        #gs_rak_pop .hj_hg { font-weight: 600; color: #0d9bdb; white-space: nowrap; }

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

    // ---------- tampilan sel ----------
    // Sel Rak hanya berisi tulisan "Lihat rak"; daftar rak tampil di popup saat diklik.
    function renderLihat(td) {
        td.textContent = '';
        const s = document.createElement('span');
        s.className = 'rk_lihat';
        s.textContent = 'Lihat rak';
        td.appendChild(s);
    }

    // data rak per gudang/toko untuk satu sel: dari cache (1 jam) atau diambil dari server
    function dataRak(td) {
        const idproduk = td.dataset.prd;
        const idoutlet = td.dataset.otl || '';
        if (!idproduk) return Promise.resolve([]);
        const key = idproduk + '|' + idoutlet;
        const c = cache[key];
        if (c && Date.now() - c.t < CACHE_TTL) return Promise.resolve(c.v);
        return ambilRakProduk(idproduk, idoutlet, td.dataset.gdn).then((v) => {
            cache[key] = { t: Date.now(), v: v };
            saveCache();
            return v;
        });
    }

    const GCACHE = {}; // id -> [url,...] selama halaman terbuka
    const HDIAG = {}; // id -> keterangan bila tab harga ditemukan tapi tabelnya kosong
    const HCACHE = {}; // id -> [{nama, harga},...] harga jual per pelanggan (dari halaman detail yang sama)

    // ---------- ambil harga jual per pelanggan dari tab harga di halaman detail produk ----------
    function teksBersih(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim(); }

    function nilaiSel(td) {
        const inp = td.querySelector('input, select');
        if (inp) {
            if (inp.tagName === 'SELECT') {
                const o = inp.options[inp.selectedIndex];
                return o ? o.textContent.trim() : '';
            }
            return (inp.getAttribute('value') || inp.value || '').trim();
        }
        return teksBersih(td);
    }

    function cariPaneHarga(doc) {
        const panes = [];
        const tambah = (el) => { if (el && panes.indexOf(el) === -1) panes.push(el); };
        tambah(doc.querySelector('#tab_produk_harga_pelanggan')); // tab "Harga Jual" (dari hasil rekam)
        // 1) tab (link) yang judulnya mengandung "harga"
        doc.querySelectorAll('a[href^="#"], [data-bs-target^="#"], [data-target^="#"]').forEach((a) => {
            if (!/harga/i.test(a.textContent)) return;
            const ref = a.getAttribute('href') || a.getAttribute('data-bs-target') || a.getAttribute('data-target') || '';
            if (ref.length < 2) return;
            try { tambah(doc.querySelector(ref)); } catch (e) { /* selector tidak valid */ }
        });
        // 2) pane dengan id mengandung "harga"
        doc.querySelectorAll('[id*="harga" i]').forEach((el) => { if (el.querySelector('table')) tambah(el); });
        return panes;
    }

    // Tabel "Harga Jual per Jenis Pelanggan": kolom Jenis (Platinum, Gold, Silver, Basic, Marketplace) + Diskon (input)
    function formatAngka(t) {
        const n = Number(String(t).replace(/,/g, ''));
        return isFinite(n) && String(t).trim() !== '' ? n.toLocaleString('id-ID', { maximumFractionDigits: 2 }) : String(t);
    }

    function ekstrakHarga(doc, id) {
        const hasil = [];
        const panes = cariPaneHarga(doc);
        if (!panes.length) { catatLog('produk ' + id + ': tab harga tidak ditemukan'); return null; }
        const judulTabel = [];
        let kolomJenis = '';
        panes.forEach((pane) => {
            pane.querySelectorAll('table').forEach((tb) => {
                const heads = Array.from(tb.querySelectorAll('thead th')).map(teksBersih);
                judulTabel.push(heads.slice(0, 3).join('/'));
                if (!heads.length || !/^jenis/i.test(heads[0])) return; // hanya tabel "per Jenis Pelanggan"
                // kolom harga jual (bukan Diskon): header mengandung "harga"
                const col = heads.findIndex((h, i) => i > 0 && /harga/i.test(h) && !/diskon/i.test(h));
                kolomJenis = heads.join(' | ');
                if (col < 0) return;
                tb.querySelectorAll('tbody tr').forEach((tr) => {
                    const cells = Array.from(tr.children);
                    if (cells.length <= col) return;
                    const nama = teksBersih(cells[0]);
                    const nilai = nilaiSel(cells[col]);
                    if (!nama || nilai === '') return;
                    if (hasil.some((x) => x.nama.toLowerCase() === nama.toLowerCase())) return; // hindari dobel (tabel jenis muncul lebih dari sekali)
                    const fa = formatAngka(nilai);
                    hasil.push({ nama: nama, harga: /^-?[\d.,]+$/.test(fa) ? 'Rp ' + fa : fa });
                });
            });
        });
        catatLog('produk ' + id + ': ' + hasil.length + ' jenis pelanggan ditemukan');
        if (!hasil.length) {
            HDIAG[id] = kolomJenis ? 'kolom tabel Jenis: ' + kolomJenis + ' (tidak ada kolom harga)' : 'tabel di tab: ' + (judulTabel.join(' ; ') || 'tidak ada');
            catatLog('produk ' + id + ' jenis pelanggan kosong: ' + HDIAG[id]);
        }
        return hasil;
    }

    // ---------- ambil semua gambar dari halaman detail produk ----------
    // (halaman yang sama juga dipakai untuk mengisi HCACHE / harga per pelanggan)
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
        try { HCACHE[id] = ekstrakHarga(doc, id); } catch (e) { catatLog('produk ' + id + ' harga error: ' + e.message); HCACHE[id] = null; }
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

    // ---------- popup (melayang di area tabel, dekat elemen yang diklik) ----------
    function tutupModal() {
        const rp = document.getElementById('gs_rak_pop');
        if (rp) rp.remove();
    }

    // kerangka popup: judul + tombol x + isi yang bisa di-scroll. 'anchor' = elemen yang diklik.
    function bukaPop(anchor, judul, kelas) {
        tutupModal();
        const pop = document.createElement('div');
        pop.id = 'gs_rak_pop';
        if (kelas) pop.className = kelas;
        // blokir seret/seleksi (menu klik-kanan dibiarkan)
        ['dragstart', 'selectstart'].forEach((ev) => pop.addEventListener(ev, (e) => e.preventDefault()));

        const head = document.createElement('div');
        head.className = 'rk_head';
        const j = document.createElement('div');
        j.className = 'rk_judul';
        j.textContent = judul;
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'rk_x';
        x.innerHTML = '&times;';
        x.addEventListener('click', tutupModal);
        head.appendChild(j);
        head.appendChild(x);

        const isi = document.createElement('div');
        isi.className = 'rk_isi';
        pop.appendChild(head);
        pop.appendChild(isi);
        document.body.appendChild(pop);

        // posisi: di dalam area tabel (wrapper DataTables), mulai dari elemen yang diklik
        const area = () => (anchor.closest('.dataTables_wrapper') || anchor.closest('table') || document.body).getBoundingClientRect();
        const taruh = () => {
            if (!document.body.contains(pop)) return;
            const a = area();
            const c = anchor.getBoundingClientRect();
            const sx = window.pageXOffset, sy = window.pageYOffset;
            const maxH = Math.max(160, Math.min(a.height - 8, window.innerHeight * 0.7));
            pop.style.maxHeight = maxH + 'px';
            const w = pop.offsetWidth, h = pop.offsetHeight;
            let left = c.left;
            if (left + w > a.right - 4) left = a.right - 4 - w;
            if (left < a.left + 4) left = a.left + 4;
            let top = c.top;
            if (top + h > a.bottom - 4) top = a.bottom - 4 - h;
            if (top < a.top + 4) top = a.top + 4;
            pop.style.left = (left + sx) + 'px';
            pop.style.top = (top + sy) + 'px';
        };
        // tombol Tutup di footer (di luar area scroll, jadi tidak ikut tergulung); dipasang sekali
        const tombolTutup = () => {
            if (pop.querySelector('.rk_foot')) return;
            const foot = document.createElement('div');
            foot.className = 'rk_foot';
            const tb = document.createElement('button');
            tb.type = 'button';
            tb.className = 'rk_tutup';
            tb.textContent = '\u2716 Tutup';
            tb.addEventListener('click', tutupModal);
            foot.appendChild(tb);
            pop.appendChild(foot);
        };
        tombolTutup();
        const info = (teks, err) => {
            isi.textContent = '';
            const t = document.createElement('div');
            t.className = 'rk_info' + (err ? ' rk_err' : '');
            t.textContent = teks;
            isi.appendChild(t);
            tombolTutup();
            taruh();
        };
        return { pop: pop, isi: isi, taruh: taruh, tombolTutup: tombolTutup, info: info };
    }

    // popup gambar produk (klik ikon logo di kolom Nama)
    function bukaModal(ikon, id, judul) {
        const m = bukaPop(ikon, judul || ('Produk ' + id), 'rk_gambar');
        m.info('Memuat gambar...');

        ambilGambar(id).then((urls) => {
            if (!document.body.contains(m.pop)) return; // popup sudah ditutup
            if (!urls.length) return m.info('Produk ini belum punya gambar.');
            m.isi.textContent = '';
            urls.forEach((u) => {
                const img = document.createElement('img');
                img.alt = '';
                img.draggable = false;
                img.addEventListener('load', m.taruh);
                img.addEventListener('error', () => { img.alt = 'Gambar gagal dimuat'; m.taruh(); });
                img.src = u;
                m.isi.appendChild(img);
            });
            m.tombolTutup();
            m.taruh();
        }).catch((e) => {
            console.error('[Gambar] gagal produk=', id, e);
            catatLog('produk ' + id + ' gagal: ' + e.message);
            if (document.body.contains(m.pop)) m.info('Gagal memuat gambar (' + e.message + ').', true);
        });
    }

    // popup daftar rak: toko/gudang tebal, nama rak di bawahnya, dipisah garis (klik "Lihat rak")
    function bukaModalRak(td, judul) {
        const m = bukaPop(td, judul || 'Rak produk');
        m.info('Memuat rak...');

        dataRak(td).then((data) => {
            if (!document.body.contains(m.pop)) return; // popup sudah ditutup
            data = data || [];
            if (!data.some((x) => x.r)) return m.info('Produk ini belum punya penempatan rak.');
            m.isi.textContent = '';
            // hanya toko/gudang yang punya rak; yang kosong tidak ditampilkan
            data.filter((x) => x.r).forEach((x) => {
                const baris = document.createElement('div');
                baris.className = 'rk_baris';
                const g = document.createElement('div');
                g.className = 'rk_gn';
                g.textContent = x.g || 'GUDANG';
                baris.appendChild(g);
                x.r.split(/\s*,\s*/).filter(Boolean).forEach((nama) => {
                    const r = document.createElement('div');
                    r.className = 'rk_rv';
                    r.textContent = nama;
                    baris.appendChild(r);
                });
                m.isi.appendChild(baris);
            });
            m.tombolTutup();
            m.taruh();
        }).catch((e) => {
            console.error('[Rak] gagal produk=', td.dataset.prd, e);
            if (document.body.contains(m.pop)) m.info('Gagal memuat rak (' + (e && e.message ? e.message : e) + ').', true);
        });
    }

    // klik di luar popup (bukan "Lihat rak"/ikon gambar) menutupnya
    document.addEventListener('mousedown', (e) => {
        if (!document.getElementById('gs_rak_pop')) return;
        if (e.target.closest && (e.target.closest('#gs_rak_pop') || e.target.closest('.rk_cell') || e.target.closest('.gs_ikon') || e.target.closest('.hj_td i'))) return;
        tutupModal();
    }, true);

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
            td.dataset.bc = tds[barcodeIdx].textContent.trim();
            if (stokCell) {
                td.dataset.prd = stokCell.dataset.prd || '';
                td.dataset.otl = stokCell.dataset.otl || '';
                td.dataset.gdn = stokCell.dataset.gdn || '';
            }
            renderLihat(td);
            const namaTd = tds[namaIdx];
            namaTd.classList.add('rs_nama');
            if (stokCell && stokCell.dataset.prd && !namaTd.querySelector('.gs_ikon')) {
                const ikon = document.createElement('span');
                ikon.className = 'gs_ikon';
                ikon.title = 'Lihat gambar produk';
                ikon.classList.add('gs_logo'); // logo PartDistro sebagai ikon awal
                ikon.dataset.prd = stokCell.dataset.prd;
                namaTd.insertBefore(ikon, namaTd.firstChild);
            }
            namaTd.insertAdjacentElement('afterend', td);
        });

        // Tombol panah Harga Jual: dipasang ulang tiap pass (situs bisa menulis ulang isi sel setelah tabel digambar)
        const hjNow = Array.from(headRow.children).findIndex((th) => /^harga\s*jual/i.test(th.textContent.trim()));
        if (hjNow >= 0) {
            table.querySelectorAll('tbody tr').forEach((tr) => {
                if (!tr.querySelector('.rk_cell')) return;
                const stok = tr.querySelector('td.bt_dialog_aktifitas_stok');
                const hd = tr.children[hjNow];
                if (!stok || !stok.dataset.prd || !hd || hd.classList.contains('rk_cell')) return;
                hd.classList.add('hj_td');
                hd.dataset.hjprd = stok.dataset.prd;
                // pemicu = panah merah bawaan situs; kalau sel tidak punya, pasang panah merah serupa
                if (hd.querySelector('i.fa-angle-double-down, .hj_btn')) return;
                const b = document.createElement('i');
                b.className = 'fa fa-angle-double-down hj_btn';
                b.title = 'Harga jual per pelanggan';
                hd.appendChild(b);
            });
        }

        if (headChanged) {
            window.dispatchEvent(new Event('resize'));
            [60, 300, 800].forEach((ms) => setTimeout(() => syncWidths(table), ms));
        }
        syncWidths(table);
        terapkanFilterRak();
    }

    // ---------- filter "Status Rak" (combobox di panel filter; menyaring baris tabel di halaman ini) ----------
    // '' = semua, 'ada' = sudah ada rak, 'kosong' = belum ada rak.
    // Disimpan di sessionStorage supaya tetap terpilih saat pindah halaman / halaman dimuat ulang.
    const FILTER_KEY = 'aistim_rak_filter';
    let filterRak = '';
    try { const f = sessionStorage.getItem(FILTER_KEY); if (f === 'ada' || f === 'kosong') filterRak = f; } catch (e) { /* abaikan */ }
    const antreFilter = [];
    let jalanFilter = 0;
    const MAKS_FILTER = 3; // maks permintaan rak bersamaan saat memeriksa baris

    // 'ada' | 'kosong' | 'gagal' | null (belum diketahui)
    function statusRak(td) {
        if (!td.dataset.prd) return 'kosong';
        const c = cache[td.dataset.prd + '|' + (td.dataset.otl || '')];
        if (c && Date.now() - c.t < CACHE_TTL) return (c.v || []).some((x) => x.r) ? 'ada' : 'kosong';
        return td.dataset.rkgagal ? 'gagal' : null;
    }

    function pompaFilter() {
        while (jalanFilter < MAKS_FILTER && antreFilter.length) {
            const td = antreFilter.shift();
            jalanFilter++;
            dataRak(td)
                .catch((e) => { td.dataset.rkgagal = '1'; console.error('[Rak] filter gagal produk=', td.dataset.prd, e); })
                .finally(() => { jalanFilter--; delete td.dataset.rkantri; terapkanFilterRak(); pompaFilter(); });
        }
    }

    function terapkanFilterRak() {
        const table = document.querySelector(TABLE_SEL);
        if (!table) return;
        let total = 0, tampil = 0, menunggu = 0, gagal = 0;
        table.querySelectorAll('tbody tr').forEach((tr) => {
            const td = tr.querySelector('.rk_cell');
            if (!td) return;
            total++;
            if (!filterRak) { tr.style.display = ''; tampil++; return; }
            const st = statusRak(td);
            if (st === null) {
                // belum diketahui: sembunyikan dulu, periksa rak-nya, lalu saring ulang
                menunggu++;
                tr.style.display = 'none';
                if (!td.dataset.rkantri) { td.dataset.rkantri = '1'; antreFilter.push(td); }
                return;
            }
            if (st === 'gagal') gagal++;
            const cocok = st === 'gagal' || st === filterRak; // yang gagal diperiksa tetap ditampilkan
            tr.style.display = cocok ? '' : 'none';
            if (cocok) tampil++;
        });
        pompaFilter();
        const info = document.getElementById('rk_filter_info');
        if (!info) return;
        let teks = '';
        if (filterRak && menunggu) teks = 'Memeriksa rak... ' + (total - menunggu) + '/' + total;
        else if (filterRak) teks = 'Tampil ' + tampil + ' dari ' + total + ' baris di halaman ini' + (gagal ? ' (' + gagal + ' gagal diperiksa)' : '');
        // hanya tulis bila berubah: menulis ulang memicu MutationObserver dan membuat putaran tak berujung
        if (info.textContent !== teks) info.textContent = teks;
    }

    // pasang combobox tepat di bawah kolom Barcode/Nama Produk/Kode Ref pada panel filter (sekali; dipasang ulang bila panel digambar ulang)
    function pasangFilterRak() {
        const cari = document.getElementById('pencarian_nama');
        const field = cari && cari.closest('.field2');
        if (!field) return;
        const ada = document.getElementById('rk_filter_box');
        if (ada) {
            if (field.nextElementSibling !== ada) field.insertAdjacentElement('afterend', ada); // pindahkan bila posisinya belum benar
            return;
        }
        const box = document.createElement('div');
        box.className = 'field2';
        box.id = 'rk_filter_box';
        const lb = document.createElement('label');
        lb.htmlFor = 'rk_filter_status';
        lb.textContent = 'Status Rak';
        const sel = document.createElement('select');
        sel.id = 'rk_filter_status'; // tanpa atribut name: tidak ikut terkirim ke server
        [['', '-- Semua --'], ['ada', 'Sudah ada rak'], ['kosong', 'Belum ada rak']].forEach((o) => {
            const op = document.createElement('option');
            op.value = o[0];
            op.textContent = o[1];
            sel.appendChild(op);
        });
        sel.value = filterRak;
        sel.addEventListener('change', () => {
            filterRak = sel.value;
            try { sessionStorage.setItem(FILTER_KEY, filterRak); } catch (e) { /* abaikan */ }
            terapkanFilterRak();
        });
        const info = document.createElement('div');
        info.id = 'rk_filter_info';
        info.style.cssText = 'font-size:11px;color:#777;margin-top:3px';
        box.appendChild(lb);
        box.appendChild(document.createElement('br'));
        box.appendChild(sel);
        box.appendChild(info);
        field.insertAdjacentElement('afterend', box);
        terapkanFilterRak();
    }

    // judul popup untuk satu baris tabel: "barcode - nama"
    function judulBaris(td) {
        const namaTd = td.previousElementSibling;
        const ikon = namaTd && namaTd.querySelector('.gs_ikon');
        const nama = namaTd ? namaTd.textContent.replace(ikon ? ikon.textContent : '', '').replace(/\s+/g, ' ').trim() : '';
        return [td.dataset.bc, nama].filter(Boolean).join(' - ');
    }

    // popup harga jual per jenis pelanggan (klik panah merah di sel Harga Jual)
    function bukaModalHarga(panah, id, judul) {
        const m = bukaPop(panah, judul || ('Produk ' + id));
        m.info('Memuat harga...');

        ambilGambar(id).then(() => {
            if (!document.body.contains(m.pop)) return; // popup sudah ditutup
            const data = HCACHE[id];
            if (data === null || data === undefined) return m.info('Tab harga tidak ditemukan.', true);
            if (!data.length) return m.info('Tabel jenis pelanggan tidak terbaca. ' + (HDIAG[id] || ''), true);
            m.isi.textContent = '';
            const jd = document.createElement('div');
            jd.className = 'rk_info';
            jd.textContent = 'Harga jual per jenis pelanggan';
            m.isi.appendChild(jd);
            data.forEach((r) => {
                const row = document.createElement('div');
                row.className = 'hj_row';
                const n = document.createElement('span');
                n.className = 'hj_nm';
                n.textContent = r.nama;
                const h = document.createElement('span');
                h.className = 'hj_hg';
                h.textContent = r.harga;
                row.appendChild(n);
                row.appendChild(h);
                m.isi.appendChild(row);
            });
            m.tombolTutup();
            m.taruh();
        }).catch((err) => {
            catatLog('harga produk ' + id + ' gagal: ' + err.message);
            if (document.body.contains(m.pop)) m.info('Gagal memuat harga (' + err.message + ').', true);
        });
    }

    document.addEventListener('click', (e) => {
        const panah = e.target.closest && e.target.closest('i.fa-angle-double-down, .hj_btn');
        if (!panah) return;
        const td = panah.closest('td.hj_td');
        if (!td || !td.dataset.hjprd) return;
        e.preventDefault();
        e.stopPropagation();
        try {
            const rk = td.parentElement && td.parentElement.querySelector('.rk_cell');
            bukaModalHarga(panah, td.dataset.hjprd, rk ? judulBaris(rk) : '');
        } catch (err) {
            console.error('[Harga] gagal membuka popup', err);
        }
    }, true);

    // klik ikon gambar -> ambil & tampilkan gambar di popup
    document.addEventListener('click', (e) => {
        const ikon = e.target.closest && e.target.closest('.gs_ikon');
        if (!ikon) return;
        e.preventDefault();
        e.stopPropagation();
        const td = ikon.closest('td');
        const judul = td ? td.textContent.replace(ikon.textContent, '').replace(/\s+/g, ' ').trim() : '';
        bukaModal(ikon, ikon.dataset.prd, judul);
    }, true);

    // klik "Lihat rak" -> popup daftar rak (capture + stopPropagation: tidak sampai ke handler situs)
    document.addEventListener('click', (e) => {
        const td = e.target.closest && e.target.closest('.rk_cell');
        if (!td) return;
        e.preventDefault();
        e.stopPropagation();
        try {
            catatLog('klik Lihat rak produk=' + (td.dataset.prd || '?'));
            bukaModalRak(td, judulBaris(td));
        } catch (err) {
            console.error('[Rak] gagal membuka popup', err);
        }
    }, true);

    let timer = null;
    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(() => {
            pasangFilterRak();
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
