// ==UserScript==
// @name         Erzap - Kolom Outlet di Kelola Servis
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  [v1.0.1] Fix posisi kolom Outlet setelah redraw tabel (ganti halaman/urut/cari). Daftar Kelola Servis: tambah kolom "Outlet" di sebelah kiri kolom Status. Outlet diambil dari halaman detail tiap servis (link Kode Servis), di-cache supaya tidak fetch ulang
// @author       You
// @match        https://*.erzap.com/servis_elektroniks/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const CACHE_KEY = 'ks_outlet_cache_v1';
    const PARALEL = 4;
    const TANDA = 'ks_outlet_td';

    let cache = {};
    try { cache = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}'); } catch (e) { cache = {}; }
    function simpanCache() {
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* abaikan */ }
    }

    const antrian = [];
    let aktif = 0;

    function teksBersih(el) {
        return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
    }

    // Kolom Status dicari dari judul header (Outlet disisipkan di kirinya), bukan posisi tetap
    function indeksStatus(tabel) {
        const ths = tabel.querySelectorAll('thead tr:last-child th');
        let n = 0; // th Outlet buatan skrip tidak dihitung, karena baris tbody baru belum punya kolom itu
        for (let i = 0; i < ths.length; i++) {
            if (ths[i].classList.contains(TANDA)) { n++; continue; }
            if (teksBersih(ths[i]).toLowerCase() === 'status') return i - n;
        }
        return -1;
    }

    // ===== Ambil nama outlet dari HTML halaman detail servis =====
    function cariOutlet(doc) {
        // 1) Label "Outlet" (th/dt/label/strong/td/span/b) -> nilai di elemen sesudahnya
        const kandidat = doc.querySelectorAll('th, dt, label, strong, b, td, span, div.col-form-label');
        for (const k of kandidat) {
            const t = teksBersih(k).replace(/:$/, '').trim().toLowerCase();
            if (t !== 'outlet') continue;
            if (k.closest('nav, aside, header, footer, .sidebar, .main-sidebar, .navbar, .nav, [class*="menu"]')) continue; // label menu, bukan data servis
            let nilai = k.nextElementSibling;
            if (!nilai && k.parentElement) nilai = k.parentElement.nextElementSibling;
            const v = teksBersih(nilai);
            if (v) return v;
        }
        // 2) Select/input outlet di form
        const sel = doc.querySelector('select[id*="outlet"] option[selected], select[id*="outlet"] option:checked');
        if (sel && teksBersih(sel)) return teksBersih(sel);
        // 3) "Outlet : Nama" dalam teks biasa
        const m = (doc.body ? doc.body.textContent : '').replace(/\s+/g, ' ').match(/Outlet\s*:\s*([^:|]{2,60}?)(?:\s{2,}|\s[A-Z][a-z]+\s*:|$)/);
        return m ? m[1].trim() : '';
    }

    async function ambilOutlet(url) {
        if (url in cache) return cache[url];
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const outlet = cariOutlet(doc) || '-';
        if (outlet === '-') {
            const txt = (doc.body ? doc.body.textContent : '').replace(/\s+/g, ' ');
            const cuplikan = [];
            const re = /outlet/ig;
            let m;
            while ((m = re.exec(txt)) && cuplikan.length < 5) cuplikan.push(txt.slice(Math.max(0, m.index - 40), m.index + 80));
            console.warn('[kelolaservis] Outlet tidak ditemukan di', url, '| cuplikan kata "outlet":', cuplikan);
            return outlet; // tidak di-cache supaya dicoba lagi saat dimuat ulang
        }
        cache[url] = outlet;
        simpanCache();
        return outlet;
    }

    function jalankanAntrian() {
        while (aktif < PARALEL && antrian.length) {
            const { url, td } = antrian.shift();
            if (!td.isConnected) continue; // baris sudah hilang karena redraw
            aktif++;
            ambilOutlet(url)
                .then(o => { td.textContent = o; })
                .catch(e => { td.textContent = '?'; td.title = String(e && e.message || e); })
                .finally(() => { aktif--; sinkronLebar(); jalankanAntrian(); });
        }
    }

    // Samakan lebar th header yang kelihatan dengan kolom asli di area scroll
    let timerSinkron = null;
    function sinkronLebar() {
        clearTimeout(timerSinkron);
        timerSinkron = setTimeout(() => {
            const tabel = document.querySelector('table#data_table');
            const headVis = document.querySelector('.dataTables_scrollHead table');
            if (!tabel || !headVis) return;
            // Ukur dari sel baris pertama (lebar nyata), bukan dari th sizing yang bisa punya width inline lama
            const baris = tabel.querySelector('tbody tr');
            const vis = headVis.querySelectorAll('thead tr:last-child th');
            if (!baris || baris.children.length !== vis.length) return;
            const total = tabel.getBoundingClientRect().width;
            Array.from(baris.children).forEach((td, i) => {
                const w = td.getBoundingClientRect().width;
                vis[i].style.boxSizing = 'border-box';
                vis[i].style.width = w + 'px';
                vis[i].style.minWidth = w + 'px';
                vis[i].style.maxWidth = w + 'px';
            });
            headVis.style.tableLayout = 'fixed';
            headVis.style.width = total + 'px';
            const inner = headVis.parentElement;
            if (inner) inner.style.width = total + 'px';
        }, 150);
    }

    // Header di dalam area scroll hanya penentu lebar kolom -> harus tak kelihatan (tinggi 0),
    // header yang kelihatan adalah yang di .dataTables_scrollHead
    function pasangStyle() {
        if (document.getElementById('ks_style')) return;
        const st = document.createElement('style');
        st.id = 'ks_style';
        st.textContent = `
            .dataTables_scrollBody table#data_table > thead { visibility: collapse !important; }
            .dataTables_scrollBody table#data_table > thead tr { height: 0 !important; visibility: collapse !important; }
            .dataTables_scrollBody table#data_table > thead th {
                height: 0 !important; padding-top: 0 !important; padding-bottom: 0 !important;
                border-top-width: 0 !important; border-bottom-width: 0 !important;
                line-height: 0 !important; font-size: 0 !important; overflow: hidden !important;
            }
            .dataTables_scrollBody table#data_table > thead th::before,
            .dataTables_scrollBody table#data_table > thead th::after { display: none !important; }
        `;
        document.head.appendChild(st);
    }

    let nomor = 0;
    function proses() {
        const tabel = document.querySelector('table#data_table');
        if (!tabel) return;
        const iu = indeksStatus(tabel);
        if (iu < 0) return;

        // Header: DataTables menduplikasi thead (tabel scrollHead terpisah + thead tersembunyi) -> semua diisi
        pasangStyle();

        // DataTables punya 2 thead: yang kelihatan (scrollHead) dan yang tersembunyi di dalam area scroll
        // (penentu lebar kolom). Dua-duanya harus punya kolom Outlet supaya sejajar dengan isi tabel.
        document.querySelectorAll('.dataTables_scrollHead table thead, table#data_table thead').forEach(thead => {
            const rows = thead.querySelectorAll('tr');
            if (!rows.length) return;
            const ths = rows[rows.length - 1].children;
            let pos = -1;
            for (let i = 0; i < ths.length; i++) if (teksBersih(ths[i]).toLowerCase() === 'status') { pos = i; break; }
            if (pos < 0) return;
            rows.forEach((tr, i) => {
                const ada = tr.querySelectorAll('.' + TANDA);
                ada.forEach((x, n) => { if (n > 0) x.remove(); }); // buang duplikat (DataTables meng-clone header)
                if (ada.length) return;
                const th = document.createElement('th');
                th.className = TANDA;
                if (i === rows.length - 1) {
                    if (thead.closest('.dataTables_scrollHead')) th.textContent = 'Outlet';
                    else {
                        th.style.cssText = 'padding-top:0;padding-bottom:0;border-top-width:0;border-bottom-width:0;height:0';
                        const d = document.createElement('div');
                        d.className = 'dataTables_sizing';
                        d.style.cssText = 'height:0;overflow:hidden';
                        d.textContent = 'Outlet';
                        th.appendChild(d);
                    }
                }
                tr.children[pos].before(th);
            });
        });

        tabel.querySelectorAll('tbody tr').forEach(tr => {
            if (tr.querySelector('.' + TANDA)) return;
            if (tr.children.length <= iu) return; // baris "tidak ada data" (colspan)
            const td = document.createElement('td');
            td.className = TANDA;
            td.textContent = '...';
            td.dataset.ks = String(++nomor);
            tr.children[iu].before(td);

            const a = tr.querySelector('a[href*="/servis_elektroniks/kelola_servis/"]');
            if (!a) { td.textContent = '-'; return; }
            let url;
            try { url = new URL(a.getAttribute('href'), location.href).href; } catch (e) { td.textContent = '-'; return; }
            antrian.push({ url, td });
        });
        jalankanAntrian();
        sinkronLebar();
    }

    // Konten Erzap dimuat ulang lewat AJAX (#ajax_target) -> proses ulang kalau tabel berganti
    window.addEventListener('resize', sinkronLebar);
    let timerProses = null;
    function jadwalkanProses() {
        clearTimeout(timerProses);
        timerProses = setTimeout(proses, 50);
    }
    proses();
    new MutationObserver(jadwalkanProses).observe(document.body, { childList: true, subtree: true });
})();
