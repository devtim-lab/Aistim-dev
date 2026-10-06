// ==UserScript==
// @name         Erzap - Pesanan Web (Lonceng)
// @namespace    http://tampermonkey.net/
// @version      1.9.0
// @description  Tombol lonceng melayang (FAB, bisa digeser) di halaman Erzap: daftar nota pesanan dari web (partdistro) yang nomor fakturnya berpola 1XXXXXXXXXXX-ddMMyyJJmm dan badge jumlah nota baru.
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
    const POLL_MS = 60 * 1000;         // cek tiap 1 menit (hanya saat tab terlihat)
    const CACHE_MS = 90 * 1000;        // pindah halaman tidak memicu fetch ulang kalau data masih segar
    const K_SEEN = 'aistim_pw_seen', K_POS = 'aistim_pw_pos', K_FILTER = 'aistim_pw_filter', K_CACHE = 'aistim_pw_cache', K_BUNYI = 'aistim_pw_bunyi';

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

    // ---------- Bunyi notifikasi (Web Audio; aktif setelah halaman pernah disentuh/diklik) ----------
    let audioCtx = null;
    function siapkanAudio() {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
        } catch (e) { /* tidak didukung */ }
    }
    ['pointerdown', 'touchstart', 'keydown', 'click'].forEach((ev) => document.addEventListener(ev, siapkanAudio, { passive: true }));
    function bunyi() {
        try {
            siapkanAudio();
            if (!audioCtx || audioCtx.state !== 'running') return;
            [[880, 0], [1175, 0.18], [880, 0.36]].forEach(([f, t]) => {
                const o = audioCtx.createOscillator(), g = audioCtx.createGain();
                o.type = 'sine'; o.frequency.value = f;
                const m = audioCtx.currentTime + t;
                g.gain.setValueAtTime(0.0001, m);
                g.gain.exponentialRampToValueAtTime(0.4, m + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, m + 0.16);
                o.connect(g); g.connect(audioCtx.destination);
                o.start(m); o.stop(m + 0.18);
            });
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        } catch (e) { /* abaikan */ }
    }
    function cekBunyi() {
        const t = data && data.items.length ? data.items[0].ts : 0;
        const lama = +(ls.get(K_BUNYI) || 0);
        if (!lama) { if (t) ls.set(K_BUNYI, String(t)); return; }   // pertama kali: jangan bunyi
        if (t > lama) { ls.set(K_BUNYI, String(t)); bunyi(); }
    }

    let halKini = 1;           // halaman Data Penjualan yang sedang ditampilkan (50 baris/halaman)

    async function muatData(paksa, hal) {
        if (sedangFetch) return;
        if (hal) halKini = hal;
        if (!paksa && halKini === 1) {
            const c = bacaCache();
            if (c) { data = c; sesuaikanBadge(); render(); return; }
        }
        sedangFetch = true;
        render();
        try {
            const u = LIST_URL + (halKini > 1 ? '?page=' + halKini : '');
            const res = await fetch(u, { credentials: 'same-origin', cache: 'no-store' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
            const r = ekstrakDaftar(doc, location.origin + LIST_URL);
            data = { items: r.items, totalBaris: r.totalBaris, halaman: halKini, waktu: Date.now(), error: '' };
            if (halKini === 1) ls.set(K_CACHE, JSON.stringify(data));
        } catch (e) {
            data = { items: (data && data.items) || [], totalBaris: (data && data.totalBaris) || 0, halaman: (data && data.halaman) || 1, waktu: (data && data.waktu) || 0, error: e.message || String(e) };
        }
        sedangFetch = false;
        if (halKini === 1 && data && !data.error) cekBunyi();
        sesuaikanBadge();
        render();
    }

    // ---------- Rekap semua: telusuri halaman 1,2,3,... (50 halaman per tahap) ----------
    const HAL_PER_TAHAP = 50;
    let mode = 'hari';         // 'hari' = rekap semua (nama lama dipertahankan), 'halaman' = per halaman
    let outletPilih = '';      // filter dropdown outlet (rekap semua)
    let hari = null;           // { items, totalBaris, halaman, selesai, waktu, error }
    async function muatHari(lanjut) {
        if (sedangFetch) return;
        sedangFetch = true;
        const peta = new Map();
        let total = 0, hal = 0, selesai = false, p1 = null;
        if (lanjut && hari) { hari.items.forEach((it) => peta.set(it.faktur, it)); total = hari.totalBaris; hal = hari.halaman; }
        const simpan = (err) => {
            hari = { items: Array.from(peta.values()).sort((a, b) => b.ts - a.ts), totalBaris: total, halaman: hal, selesai: selesai, waktu: Date.now(), error: err || '' };
        };
        render();
        try {
            const mulai = hal + 1;
            for (let n = mulai; n < mulai + HAL_PER_TAHAP; n++) {
                const res = await fetch(LIST_URL + (n > 1 ? '?page=' + n : ''), { credentials: 'same-origin', cache: 'no-store' });
                if (!res.ok) throw new Error('HTTP ' + res.status + ' (halaman ' + n + ')');
                const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
                const r = ekstrakDaftar(doc, location.origin + LIST_URL);
                if (n === 1) p1 = r;
                total += r.totalBaris; hal = n;
                r.items.forEach((it) => { if (!peta.has(it.faktur)) peta.set(it.faktur, it); });
                if (r.totalBaris < 50) { selesai = true; }
                simpan('');
                render();           // tampilkan progres tiap halaman
                if (selesai) break;
            }
            simpan('');
            if (p1) {
                data = { items: p1.items, totalBaris: p1.totalBaris, halaman: 1, waktu: Date.now(), error: '' };
                ls.set(K_CACHE, JSON.stringify(data));
            }
        } catch (e) {
            simpan(e.message || String(e));
        }
        sedangFetch = false;
        halKini = 1;
        if (data && !hari.error && p1) cekBunyi();
        sesuaikanBadge();
        render();
    }

    function muatSesuaiMode() { if (mode === 'hari') muatHari(false); else muatData(true, halKini); }

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
        '.list{overflow-y:auto;flex:1}',
        '.it{padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;line-height:1.35}',
        '.it.baru{background:#fff7ed;border-left:4px solid #f97316}',
        '.it .f{font-weight:700;word-break:break-all}',
        '.it .f a{color:#1d4ed8;text-decoration:none}',
        '.it .m{color:#666;font-size:12px;margin-top:2px}',
        '.tag{display:inline-block;background:#f97316;color:#fff;border-radius:4px;font-size:10px;font-weight:700;padding:1px 5px;margin-left:6px;vertical-align:middle}',
        '.tabs{display:flex;border-bottom:1px solid #fecaca}',
        '.tabs button{flex:1;padding:8px;border:none;background:#fff;font-size:13px;color:#666;cursor:pointer;border-bottom:3px solid transparent}',
        '.tabs button.on{color:#dc2626;font-weight:700;border-bottom-color:#dc2626}',
        '.rk{padding:8px 12px;border-bottom:1px solid #eee}',
        '.sel{width:100%;padding:8px;font-size:14px;border:1px solid #ccc;border-radius:8px;background:#fff;color:#222}',
        '.rkh{font-size:11px;color:#888;text-transform:uppercase;margin-bottom:2px}',
        '.rkr{display:flex;justify-content:space-between;gap:8px;padding:2px 0}',
        '.rkr.tot{border-top:1px solid #ddd;margin-top:3px;padding-top:4px}',
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
        if (tombolInline) tombolInline.textContent = '🔔 Pesanan Web' + (n > 0 ? ' (' + n + ')' : '');
    }

    // ----- panel -----
    let terbuka = false;
    function togglePanel() {
        terbuka = !terbuka;
        panel.classList.toggle('buka', terbuka);
        if (terbuka) {
            if (mode === 'hari') muatHari(false); else muatData(true, 1);
            render();
        } else {
            if (data && data.halaman === 1) tandaiDilihat();
            halKini = 1;
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
        bRef.onclick = muatSesuaiMode;
        const bTutup = el('button', '', '✕');
        bTutup.type = 'button';
        bTutup.onclick = togglePanel;
        hd.append(bRef, bTutup);
        panel.appendChild(hd);

        const tabs = el('div', 'tabs');
        [['hari', 'Semua'], ['halaman', 'Per halaman']].forEach(([m, t]) => {
            const bt = el('button', m === mode ? 'on' : '', t);
            bt.type = 'button';
            bt.onclick = () => { if (mode === m) return; mode = m; if (m === 'hari') { if (!hari) muatHari(false); else render(); } else if (!data) muatData(true, 1); else render(); };
            tabs.appendChild(bt);
        });
        panel.appendChild(tabs);

        const src = mode === 'hari' ? hari : data;
        const sub = el('div', 'sub' + (src && src.error ? ' err' : ''));
        if (sedangFetch) sub.textContent = 'Memindai' + (mode === 'hari' && hari ? ' · halaman ' + hari.halaman + '...' : '...');
        else if (!src) sub.textContent = 'Memuat...';
        else if (src.error) sub.textContent = 'Gagal memuat: ' + src.error + (src.waktu ? ' (data lama ' + fmtWaktu(src.waktu) + ')' : '');
        else if (mode === 'hari') sub.textContent = 'Rekap semua: ' + src.items.length + ' nota web (dipindai ' + src.totalBaris + ' baris, halaman 1-' + src.halaman + (src.selesai ? ', semua halaman' : ', masih ada halaman lain') + ') · dicek ' + fmtWaktu(src.waktu);
        else sub.textContent = src.items.length + ' nota web dari ' + src.totalBaris + ' baris · halaman ' + (src.halaman || 1) + ' Data Penjualan · dicek ' + fmtWaktu(src.waktu);
        panel.appendChild(sub);

        let tampil = src ? src.items : [];
        if (mode === 'hari' && src && src.items.length) {
            const per = new Map();
            src.items.forEach((it) => { const k = it.outlet || '(tanpa outlet)'; per.set(k, (per.get(k) || 0) + 1); });
            if (outletPilih !== '' && !per.has(outletPilih)) outletPilih = '';
            const rk = el('div', 'rk');
            const sel = el('select', 'sel');
            const op0 = el('option', '', 'Semua outlet (' + src.items.length + ')');
            op0.value = '';
            sel.appendChild(op0);
            Array.from(per.entries()).sort((x, y) => y[1] - x[1]).forEach(([k, n]) => {
                const o = el('option', '', k + ' (' + n + ')');
                o.value = k;
                sel.appendChild(o);
            });
            sel.value = outletPilih;
            sel.onchange = () => { outletPilih = sel.value; render(); };
            rk.appendChild(sel);
            panel.appendChild(rk);
            if (outletPilih !== '') tampil = src.items.filter((it) => (it.outlet || '(tanpa outlet)') === outletPilih);
        }

        const list = el('div', 'list');
        const seen = terakhirDilihat();
        if (src && tampil.length) {
            tampil.forEach((it) => {
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
        } else if (src && !src.error) {
            list.appendChild(el('div', 'kosong', mode === 'hari'
                ? 'Belum ada nota web yang ditemukan.'
                : (src.totalBaris ? 'Tidak ada nota web di ' + src.totalBaris + ' baris di halaman ' + (src.halaman || 1) + '.' : 'Tabel Data Penjualan tidak terbaca (0 baris).')));
        } else if (!src || sedangFetch) {
            list.appendChild(el('div', 'kosong', 'Memuat...'));
        }
        panel.appendChild(list);

        if (mode === 'hari' && hari && !hari.selesai && !sedangFetch) {
            const lg = el('button', '', 'Pindai ' + HAL_PER_TAHAP + ' halaman berikutnya ›');
            lg.type = 'button';
            lg.style.cssText = 'margin:8px 10px 10px;padding:8px;border:1px solid #ccc;border-radius:8px;background:#f5f5f5;font-size:13px;cursor:pointer;';
            lg.onclick = () => muatHari(true);
            panel.appendChild(lg);
        }

        if (mode === 'halaman' && data) {
            const nav = el('div', 'nav');
            nav.style.cssText = 'display:flex;gap:8px;padding:8px 10px 10px;';
            const mk = (teks, off, fn) => {
                const b = el('button', '', teks);
                b.type = 'button';
                b.disabled = off;
                b.style.cssText = 'flex:1;padding:8px;border:1px solid #ccc;border-radius:8px;background:' + (off ? '#eee' : '#f5f5f5') + ';font-size:13px;cursor:' + (off ? 'default' : 'pointer') + ';color:' + (off ? '#999' : '#222') + ';';
                if (!off) b.onclick = fn;
                return b;
            };
            const h = data.halaman || 1;
            nav.appendChild(mk('‹ Kembali', sedangFetch || h <= 1, () => { tandaiDilihat(); muatData(true, h - 1); }));
            nav.appendChild(mk('Berikutnya ›', sedangFetch || data.totalBaris < 50, () => { tandaiDilihat(); muatData(true, h + 1); }));
            panel.appendChild(nav);
        }
    }

    // bersihkan sisa pengaturan filter lama (fitur filter dihapus)
    ls.del(K_FILTER);

    // ---------- Tombol lonceng sebaris di halaman Data Pesanan Penjualan (di kiri "Rekap Pesanan Baru") ----------
    var tombolInline = null;
    if (/^\/pesanan_penjualans\/?$/.test(location.pathname)) {
        let sejak = Date.now();
        const pasangInline = () => {
            if (tombolInline && document.contains(tombolInline)) return;
            const rekap = document.getElementById('btn-rekap-pesanan');
            if (!rekap || !rekap.parentNode) {
                if (Date.now() - sejak > 90000) fab.style.display = '';   // tombol Rekap tak muncul: pakai FAB saja
                return;
            }
            tombolInline = document.createElement('button');
            tombolInline.id = 'aistim_pw_inline';
            tombolInline.type = 'button';
            tombolInline.className = 'btn btn-danger';
            tombolInline.style.cssText = 'white-space:nowrap;margin:4px 8px 4px 0;';
            tombolInline.addEventListener('click', togglePanel);
            rekap.parentNode.insertBefore(tombolInline, rekap);
            fab.style.display = 'none';
            sesuaikanBadge();
        };
        fab.style.display = 'none';
        setInterval(pasangInline, 1000);
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
