// ==UserScript==
// @name         Erzap - Pesanan Web (Lonceng)
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  Tombol lonceng melayang (FAB, bisa digeser) di halaman Erzap: daftar nota pesanan dari web (partdistro) yang nomor fakturnya berpola 1XXXXXXXXXXX-ddMMyyJJmm, badge jumlah nota baru, dan filter "hanya nota web" di halaman Data Penjualan.
// @match        https://*.erzap.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Hanya di jendela utama, dan bukan di halaman cetak/nota
    if (window.top !== window) return;
    if (/[?&]layout=/.test(location.search) || /\/nota/i.test(location.pathname)) return;
    if (window.__aistimPesananWeb) return;
    window.__aistimPesananWeb = true;

    // Nomor faktur nota web: "1" + 9-13 huruf/angka acak + "-" + ddMMyyJJmm (tanggal & jam nota)
    // (tanpa \b: di DOM teks "Kode Pemesanan" bisa menempel langsung setelah nomor faktur)
    const RE_FAKTUR = /(?<![A-Z0-9])(1[A-Z0-9]{9,13})-(\d{10})(?!\d)/;
    const LIST_URL = '/penjualans';
    const POLL_MS = 3 * 60 * 1000;     // cek tiap 3 menit (hanya saat tab terlihat)
    const CACHE_MS = 90 * 1000;        // pindah halaman tidak memicu fetch ulang kalau data masih segar
    const K_SEEN = 'aistim_pw_seen', K_POS = 'aistim_pw_pos', K_FILTER = 'aistim_pw_filter', K_CACHE = 'aistim_pw_cache';

    const ls = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* diblokir */ } },
        del(k) { try { localStorage.removeItem(k); } catch (e) { /* diblokir */ } }
    };

    const rapih = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

    // ---------- Parsing ----------
    function waktuDariKode(s) {
        const d = +s.slice(0, 2), mo = +s.slice(2, 4), y = 2000 + (+s.slice(4, 6)), h = +s.slice(6, 8), mi = +s.slice(8, 10);
        if (d < 1 || d > 31 || mo < 1 || mo > 12 || h > 23 || mi > 59) return 0;
        return new Date(y, mo - 1, d, h, mi).getTime();
    }

    function ekstrakBaris(tr, base) {
        const tds = Array.from(tr.children).filter((c) => /^t[dh]$/i.test(c.tagName));
        for (let i = 0; i < tds.length; i++) {
            const teks = rapih(tds[i].textContent);
            const m = RE_FAKTUR.exec(teks);
            if (!m) continue;
            const kode = /Kode Pemesanan:\s*([A-Za-z0-9-]+)/i.exec(teks);
            const a = Array.from(tds[i].querySelectorAll('a[href]')).find((x) => rapih(x.textContent).indexOf(m[0]) !== -1);
            let href = '';
            try {
                const h = a && a.getAttribute('href');
                if (h && h !== '#' && !/^javascript/i.test(h)) href = new URL(h, base).href;
            } catch (e) { /* abaikan */ }
            return {
                faktur: m[0],
                ts: waktuDariKode(m[2]),
                kode: kode ? kode[1] : '',
                outlet: tds[i + 1] ? rapih(tds[i + 1].textContent) : '',
                href: href
            };
        }
        return null;
    }

    function ekstrakDaftar(doc, base) {
        const rows = Array.from(doc.querySelectorAll('table tbody tr'));
        const items = [];
        rows.forEach((tr) => { const it = ekstrakBaris(tr, base); if (it) items.push(it); });
        items.sort((a, b) => b.ts - a.ts);
        return { items: items, totalBaris: rows.length };
    }

    // ---------- Ambil data (dengan cache singkat) ----------
    let data = null;           // { items, totalBaris, waktu, error }
    let sedangFetch = false;

    function bacaCache() {
        try {
            const c = JSON.parse(ls.get(K_CACHE) || 'null');
            if (c && c.waktu && Date.now() - c.waktu < CACHE_MS && Array.isArray(c.items)) return c;
        } catch (e) { /* abaikan */ }
        return null;
    }

    async function muatData(paksa, tambah) {
        if (sedangFetch) return;
        if (!paksa) {
            const c = bacaCache();
            if (c) { data = c; sesuaikanBadge(); render(); return; }
        }
        sedangFetch = true;
        render();
        try {
            // pindai halaman 1..jmlHal Data Penjualan (50 baris/halaman), gabungkan & buang duplikat
            const jmlHal = Math.max(1, (data && data.halaman) || 1) + (tambah ? 1 : 0);
            const halaman = await Promise.all(Array.from({ length: jmlHal }, (_, i) => i + 1).map(async (n) => {
                const u = LIST_URL + (n > 1 ? '?page=' + n : '');
                const res = await fetch(u, { credentials: 'same-origin', cache: 'no-store' });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
                return ekstrakDaftar(doc, location.origin + LIST_URL);
            }));
            const peta = new Map();
            let total = 0;
            halaman.forEach((r) => { total += r.totalBaris; r.items.forEach((it) => { if (!peta.has(it.faktur)) peta.set(it.faktur, it); }); });
            const items = Array.from(peta.values()).sort((a, b) => b.ts - a.ts);
            data = { items, totalBaris: total, halaman: jmlHal, waktu: Date.now(), error: '' };
            ls.set(K_CACHE, JSON.stringify(data));
        } catch (e) {
            data = { items: (data && data.items) || [], totalBaris: (data && data.totalBaris) || 0, halaman: (data && data.halaman) || 1, waktu: (data && data.waktu) || 0, error: e.message || String(e) };
        }
        sedangFetch = false;
        sesuaikanBadge();
        render();
    }

    // ---------- Status "sudah dilihat" ----------
    const terakhirDilihat = () => +(ls.get(K_SEEN) || 0);
    const tsTerbaru = () => (data && data.items.length ? data.items[0].ts : 0);
    const jumlahBaru = () => {
        const seen = terakhirDilihat();
        return data ? data.items.filter((i) => i.ts > seen).length : 0;
    };

    // ---------- UI (Shadow DOM supaya CSS Erzap tidak mengganggu) ----------
    const host = document.createElement('div');
    host.id = 'aistim_pw_host';
    host.style.cssText = 'all:initial;';
    const root = host.attachShadow({ mode: 'open' });
    const css = document.createElement('style');
    css.textContent = [
        '*{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}',
        '.fab{position:fixed;width:52px;height:52px;border-radius:50%;border:none;background:#dc2626;color:#fff;font-size:24px;line-height:52px;text-align:center;',
        'box-shadow:0 4px 12px rgba(0,0,0,.4);cursor:pointer;z-index:2147483000;touch-action:none;user-select:none;-webkit-user-select:none;padding:0}',
        '.fab.diam{opacity:.85}',
        '.badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;border-radius:10px;background:#fff;color:#dc2626;border:2px solid #dc2626;font-size:11px;font-weight:700;line-height:16px;padding:0 4px;display:none}',
        '.badge.ada{display:block}',
        '.panel{position:fixed;left:50%;transform:translateX(-50%);bottom:12px;width:min(94vw,440px);max-height:72vh;background:#fff;color:#222;border-radius:12px;',
        'box-shadow:0 8px 30px rgba(0,0,0,.45);z-index:2147483001;display:none;flex-direction:column;overflow:hidden}',
        '.panel.buka{display:flex}',
        '.hd{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#dc2626;color:#fff}',
        '.hd b{flex:1;font-size:15px}',
        '.hd button{background:rgba(255,255,255,.2);border:none;color:#fff;border-radius:6px;padding:4px 10px;font-size:14px;cursor:pointer}',
        '.sub{padding:6px 12px;font-size:12px;color:#555;background:#fef2f2;border-bottom:1px solid #fecaca}',
        '.sub.err{color:#b91c1c}',
        '.filter{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #eee;font-size:13px}',
        '.filter span{flex:1}',
        '.sw{width:42px;height:24px;border-radius:12px;background:#ccc;position:relative;cursor:pointer;border:none;padding:0;flex-shrink:0}',
        '.sw::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left .15s}',
        '.sw.on{background:#dc2626}.sw.on::after{left:20px}',
        '.list{overflow-y:auto;flex:1}',
        '.it{padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;line-height:1.35}',
        '.it.baru{background:#fff7ed;border-left:4px solid #f97316}',
        '.it .f{font-weight:700;word-break:break-all}',
        '.it .f a{color:#1d4ed8;text-decoration:none}',
        '.it .m{color:#666;font-size:12px;margin-top:2px}',
        '.tag{display:inline-block;background:#f97316;color:#fff;border-radius:4px;font-size:10px;font-weight:700;padding:1px 5px;margin-left:6px;vertical-align:middle}',
        '.kosong{padding:24px 12px;text-align:center;color:#777;font-size:13px}'
    ].join('');
    root.appendChild(css);

    const fab = document.createElement('button');
    fab.className = 'fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Pesanan web');
    fab.textContent = '🔔';
    const badge = document.createElement('span');
    badge.className = 'badge';
    fab.appendChild(badge);
    root.appendChild(fab);

    const panel = document.createElement('div');
    panel.className = 'panel';
    root.appendChild(panel);

    // ----- posisi FAB (bisa digeser, tersimpan) -----
    const UK = 52;
    function batasi(x, y) {
        return {
            x: Math.max(4, Math.min(window.innerWidth - UK - 4, x)),
            y: Math.max(4, Math.min(window.innerHeight - UK - 4, y))
        };
    }
    function pasangPos(x, y) {
        const p = batasi(x, y);
        fab.style.left = p.x + 'px';
        fab.style.top = p.y + 'px';
        return p;
    }
    (function posAwal() {
        let x = window.innerWidth - UK - 12, y = window.innerHeight - UK - 170;
        try { const s = JSON.parse(ls.get(K_POS) || 'null'); if (s && typeof s.fx === 'number') { x = s.fx * window.innerWidth; y = s.fy * window.innerHeight; } } catch (e) { /* default */ }
        pasangPos(x, y);
    })();
    window.addEventListener('resize', () => { const r = fab.getBoundingClientRect(); pasangPos(r.left, r.top); });

    let drag = null;
    fab.addEventListener('pointerdown', (e) => {
        const r = fab.getBoundingClientRect();
        drag = { ox: e.clientX - r.left, oy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, pindah: false };
        try { fab.setPointerCapture(e.pointerId); } catch (x) { /* abaikan */ }
    });
    fab.addEventListener('pointermove', (e) => {
        if (!drag) return;
        if (!drag.pindah && Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 8) drag.pindah = true;
        if (drag.pindah) pasangPos(e.clientX - drag.ox, e.clientY - drag.oy);
    });
    fab.addEventListener('pointerup', () => {
        if (!drag) return;
        const pindah = drag.pindah;
        drag = null;
        if (pindah) {
            const r = fab.getBoundingClientRect();
            ls.set(K_POS, JSON.stringify({ fx: r.left / window.innerWidth, fy: r.top / window.innerHeight }));
        } else {
            togglePanel();
        }
    });
    fab.addEventListener('pointercancel', () => { drag = null; });

    function sesuaikanBadge() {
        const n = jumlahBaru();
        badge.textContent = n > 99 ? '99+' : String(n);
        badge.classList.toggle('ada', n > 0);
    }

    // ----- panel -----
    let terbuka = false;
    function togglePanel() {
        terbuka = !terbuka;
        panel.classList.toggle('buka', terbuka);
        if (terbuka) {
            muatData(true);
            render();
        } else {
            tandaiDilihat();
        }
    }
    function tandaiDilihat() {
        const t = tsTerbaru();
        if (t > terakhirDilihat()) ls.set(K_SEEN, String(t));
        sesuaikanBadge();
    }

    const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    function fmtWaktu(ts) {
        if (!ts) return '-';
        const d = new Date(ts);
        const p = (n) => (n < 10 ? '0' : '') + n;
        return d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + p(d.getHours()) + '.' + p(d.getMinutes());
    }

    function el(tag, cls, teks) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (teks != null) e.textContent = teks;
        return e;
    }

    function render() {
        if (!terbuka) return;
        panel.textContent = '';

        const hd = el('div', 'hd');
        hd.appendChild(el('b', '', '🔔 Pesanan Web'));
        const bRef = el('button', '', sedangFetch ? '...' : '↻');
        bRef.type = 'button';
        bRef.title = 'Muat ulang';
        bRef.onclick = () => muatData(true);
        const bTutup = el('button', '', '✕');
        bTutup.type = 'button';
        bTutup.onclick = togglePanel;
        hd.append(bRef, bTutup);
        panel.appendChild(hd);

        const sub = el('div', 'sub' + (data && data.error ? ' err' : ''));
        if (sedangFetch) sub.textContent = 'Memindai no faktur berawalan 1...';
        else if (!data) sub.textContent = 'Memuat...';
        else if (data.error) sub.textContent = 'Gagal memuat: ' + data.error + (data.waktu ? ' (data lama ' + fmtWaktu(data.waktu) + ')' : '');
        else sub.textContent = data.items.length + ' nota web dari ' + data.totalBaris + ' baris (halaman 1-' + (data.halaman || 1) + ' Data Penjualan, 50/halaman) · dicek ' + fmtWaktu(data.waktu);
        panel.appendChild(sub);

        if (halamanDaftar()) {
            const f = el('div', 'filter');
            f.appendChild(el('span', '', 'Saring daftar di halaman ini: hanya nota web'));
            const sw = el('button', 'sw' + (filterAktif() ? ' on' : ''));
            sw.type = 'button';
            sw.onclick = () => { setFilter(!filterAktif()); render(); };
            f.appendChild(sw);
            panel.appendChild(f);
        }

        const list = el('div', 'list');
        const seen = terakhirDilihat();
        if (data && data.items.length) {
            data.items.forEach((it) => {
                const row = el('div', 'it' + (it.ts > seen ? ' baru' : ''));
                const f = el('div', 'f');
                if (it.href) {
                    const a = el('a', '', it.faktur);
                    a.href = it.href;
                    f.appendChild(a);
                } else {
                    f.appendChild(document.createTextNode(it.faktur));
                }
                if (it.ts > seen) f.appendChild(el('span', 'tag', 'BARU'));
                row.appendChild(f);
                row.appendChild(el('div', 'm', fmtWaktu(it.ts) + (it.outlet ? ' · ' + it.outlet : '') + (it.kode ? ' · ' + it.kode : '')));
                list.appendChild(row);
            });
        } else if (data && !data.error) {
            list.appendChild(el('div', 'kosong', data.totalBaris
                ? 'Tidak ada nota dengan pola nomor faktur web di ' + data.totalBaris + ' baris yang dipindai (halaman 1-' + (data.halaman || 1) + ').'
                : 'Tabel Data Penjualan tidak terbaca (0 baris).'));
        } else if (!data || sedangFetch) {
            list.appendChild(el('div', 'kosong', 'Memuat...'));
        }
        panel.appendChild(list);

        if (data && !sedangFetch) {
            const more = el('button', 'more', 'Pindai halaman berikutnya (' + ((data.halaman || 1) + 1) + ') ›');
            more.type = 'button';
            more.style.cssText = 'margin:6px 10px 10px;padding:8px;border:1px solid #ccc;border-radius:8px;background:#f5f5f5;font-size:13px;cursor:pointer;';
            more.onclick = () => muatData(true, true);
            panel.appendChild(more);
        }
    }

    // ---------- Filter "hanya nota web" di halaman Data Penjualan ----------
    function halamanDaftar() { return /^\/penjualans\/?$/.test(location.pathname); }
    function filterAktif() { return ls.get(K_FILTER) === '1'; }
    function setFilter(on) {
        if (on) ls.set(K_FILTER, '1'); else ls.del(K_FILTER);
        terapkanFilter();
    }

    function cariTabel() {
        return Array.from(document.querySelectorAll('table')).find((t) => /no\.?\s*faktur/i.test(rapih((t.tHead || t).textContent)));
    }

    function terapkanFilter() {
        if (!halamanDaftar()) return;
        const tabel = cariTabel();
        if (!tabel) return;
        const aktif = filterAktif();
        const rows = Array.from(tabel.querySelectorAll('tbody tr'));
        let web = 0;
        rows.forEach((tr) => {
            const adaWeb = RE_FAKTUR.test(Array.from(tr.children).map((c) => rapih(c.textContent)).join(' '));
            if (adaWeb) web++;
            const sembunyi = aktif && !adaWeb;
            if (sembunyi) { tr.style.display = 'none'; tr.setAttribute('data-aw-sembunyi', '1'); }
            else if (tr.getAttribute('data-aw-sembunyi')) { tr.style.display = ''; tr.removeAttribute('data-aw-sembunyi'); }
        });
        let info = document.getElementById('aistim_pw_info');
        if (!aktif) { if (info) info.remove(); return; }
        if (!info) {
            info = document.createElement('div');
            info.id = 'aistim_pw_info';
            info.style.cssText = 'margin:8px 0;padding:8px 12px;background:#fff7ed;border:1px solid #fdba74;border-radius:6px;color:#9a3412;font-size:13px;';
            tabel.parentNode.insertBefore(info, tabel);
        }
        info.textContent = '';
        info.appendChild(document.createTextNode('Filter nota web aktif: ' + web + ' dari ' + rows.length + ' baris di halaman ini. '));
        const off = document.createElement('a');
        off.href = '#';
        off.textContent = 'Matikan';
        off.style.cssText = 'font-weight:bold;text-decoration:underline;';
        off.onclick = (e) => { e.preventDefault(); setFilter(false); render(); };
        info.appendChild(off);
    }

    // Terapkan ulang kalau isi tabel berubah (pindah halaman via AJAX/Turbolinks)
    if (halamanDaftar()) {
        let tunda = null;
        new MutationObserver((muts) => {
            if (muts.every((m) => m.target && m.target.id === 'aistim_pw_info')) return;
            clearTimeout(tunda);
            tunda = setTimeout(terapkanFilter, 150);
        }).observe(document.documentElement, { childList: true, subtree: true });
        terapkanFilter();
    }

    // ---------- Mulai ----------
    function pasang() {
        if (document.body && !document.getElementById('aistim_pw_host')) document.body.appendChild(host);
    }
    new MutationObserver(pasang).observe(document.documentElement, { childList: true });
    pasang();

    // Muat pertama: kalau belum pernah ada penanda "dilihat", anggap yang ada sekarang sudah dilihat (tanpa banjir badge)
    muatData(false).then(() => {
        if (!ls.get(K_SEEN) && tsTerbaru()) ls.set(K_SEEN, String(tsTerbaru()));
        sesuaikanBadge();
    });
    setInterval(() => { if (document.visibilityState === 'visible' && !terbuka) muatData(true); }, POLL_MS);
})();
