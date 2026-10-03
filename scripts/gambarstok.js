// ==UserScript==
// @name         Lihat Stok - Gambar Produk
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Ikon gambar di kolom Nama pada Lihat Stok. Gambar baru diambil saat ikon diklik (tidak membebani tabel), ditampilkan di popup. Sumber: tab Gambar di halaman detail produk (/produks/<id>).
// @match        https://*.erzap.com/produk_gudangs/lihat_stok/new*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TABLE_SEL = '#data_table_produk';
    const CACHE = {}; // id -> [url,...] selama halaman terbuka (tanpa localStorage)

    // ---------- log ringkas (dibaca devtool) ----------
    const logBaris = [];
    function catatLog(b) {
        logBaris.push(new Date().toTimeString().slice(0, 8) + ' ' + b);
        if (logBaris.length > 30) logBaris.shift();
        try { document.documentElement.setAttribute('data-aistim-gambar-log', logBaris.join('\n')); } catch (e) { /* abaikan */ }
    }

    const style = document.createElement('style');
    style.textContent = `
        .gs_ikon { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;
                   margin: 0 6px 2px 0; border: 1px solid #ccd; border-radius: 6px; background: #f4f6ff;
                   cursor: pointer; font-size: 15px; line-height: 1; vertical-align: middle; user-select: none; }
        .gs_ikon:hover { background: #e3e8ff; }
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
    `;
    document.head.appendChild(style);

    // ---------- ambil semua gambar dari halaman detail produk ----------
    async function ambilGambar(id) {
        if (CACHE[id]) return CACHE[id];
        const res = await fetch('/produks/' + encodeURIComponent(id), {
            credentials: 'same-origin',
            headers: { 'Accept': 'text/html' }
        });
        catatLog('GET /produks/' + id + ' -> ' + res.status);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const pane = doc.querySelector('#tab_produk_gambar');
        if (!pane) { catatLog('produk ' + id + ': #tab_produk_gambar tidak ada'); CACHE[id] = []; return []; }
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
        CACHE[id] = urls;
        return urls;
    }

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

    // ---------- pasang ikon di kolom Nama ----------
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
            if (tr.querySelector('.gs_ikon')) return;
            const tds = tr.children;
            if (tds.length <= namaIdx) return; // baris pesan kosong / loading
            const stokCell = tr.querySelector('td.bt_dialog_aktifitas_stok');
            if (!stokCell || !stokCell.dataset.prd) return;

            const ikon = document.createElement('span');
            ikon.className = 'gs_ikon';
            ikon.title = 'Lihat gambar produk';
            ikon.textContent = '🖼️'; // 🖼
            ikon.dataset.prd = stokCell.dataset.prd;
            tds[namaIdx].insertBefore(ikon, tds[namaIdx].firstChild);
        });
    }

    // klik ikon -> ambil & tampilkan gambar di popup
    document.addEventListener('click', (e) => {
        const ikon = e.target.closest && e.target.closest('.gs_ikon');
        if (!ikon) return;
        e.preventDefault();
        e.stopPropagation();
        const td = ikon.closest('td');
        const judul = td ? td.textContent.replace(ikon.textContent, '').replace(/\s+/g, ' ').trim() : '';
        bukaModal(ikon.dataset.prd, judul);
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
