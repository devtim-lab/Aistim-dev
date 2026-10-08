// ==UserScript==
// @name         Erzap - Pesanan Web (Lonceng)
// @namespace    http://tampermonkey.net/
// @version      1.21.0
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

    // Cari kolom "Total" dari header tabel (kalau tidak ada: sel angka terakhir di baris)
    function kolomTotal(tabel) {
        const ths = Array.from(((tabel.tHead && tabel.tHead.rows[0]) || tabel.querySelector('tr') || { children: [] }).children);
        const nama = ths.map((t) => rapih(t.textContent).toLowerCase());
        let i = nama.findIndex((n) => /^(grand\s*)?total(\s*(faktur|bayar|penjualan|tagihan))?$/.test(n));
        if (i < 0) i = nama.findIndex((n) => /total|tagihan|grand/.test(n));
        return i;
    }
    const RE_UANG = /^(rp\.?\s*)?-?\d[\d.,]*$/i;

    function ekstrakBaris(tr, base, kolTotal) {
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
            let total = '';
            if (kolTotal >= 0 && tds[kolTotal]) total = rapih(tds[kolTotal].textContent);
            else {
                for (let j = tds.length - 1; j > i; j--) { const t = rapih(tds[j].textContent); if (RE_UANG.test(t) && /\d{3}/.test(t)) { total = t; break; } }
            }
            return {
                total: total,
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
        rows.forEach((tr) => {
            const tabel = tr.closest('table');
            const it = ekstrakBaris(tr, base, tabel ? kolomTotal(tabel) : -1);
            if (it) items.push(it);
        });
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
        if (terbuka && mode === 'halaman' && data && !data.error) muatStatus(data.items);
    }

    // ---------- Status pesanan (cocokkan Kode Pemesanan SP... dengan daftar Data Pesanan Penjualan) ----------
    //   Edit aktif = pesanan baru (oranye) | Edit nonaktif & "Dibatalkan" = batal | Edit nonaktif lainnya = sudah diproses (hijau)
    const PESANAN_URL = '/pesanan_penjualans';
    const statusMap = {};
    let sedangStatus = false;
    function editAktif(tr) {
        const sel = Array.from(tr.querySelectorAll('a, button, input[type=button], input[type=submit], span')).filter(
            (x) => rapih(x.textContent || x.value).toLowerCase() === 'edit');
        if (!sel.length) return null;
        return sel.some((x) => {
            if (x.tagName !== 'A') return false;
            const href = (x.getAttribute('href') || '').trim();
            if (!href || href === '#' || /^javascript/i.test(href)) return false;
            if (x.hasAttribute('disabled') || x.getAttribute('aria-disabled') === 'true' || /(^|\s)disabled(\s|$)/i.test(x.className || '')) return false;
            if (x.closest('[disabled], .disabled')) return false;
            return true;
        });
    }
    function linkBerikut(doc) {
        let path = null;
        const rel = doc.querySelector('a[rel="next"]');
        if (rel) path = rel.getAttribute('href');
        if (!path) {
            for (const a of doc.querySelectorAll('.pagination a, div[class*="pagin"] a, .pager a')) {
                const t = rapih(a.textContent).toLowerCase();
                if (t === '>' || t === 'next' || t === 'selanjutnya' || t === '›' || t === '»') { path = a.getAttribute('href'); break; }
            }
        }
        if (!path || path === '#' || /^javascript/i.test(path)) return null;
        try { return new URL(path, location.origin + PESANAN_URL).href; } catch (e) { return null; }
    }
    let statusAntri = null;
    async function muatStatus(items) {
        if (!items || !items.length) return;
        statusAntri = items;
        if (sedangStatus) return;
        sedangStatus = true;
        perbaruiLegenda();
        try {
            while (statusAntri) {
                const its = statusAntri;
                statusAntri = null;
                const perlu = new Set(its.map((i) => i.kode).filter((k) => k && !statusMap[k]));
                if (!perlu.size) continue;
                let url = location.origin + PESANAN_URL;
                const sudah = new Set();
                for (let n = 1; n <= 30 && url && !sudah.has(url); n++) {
                    sudah.add(url);
                    const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
                    if (!res.ok) break;
                    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
                    doc.querySelectorAll('table tbody tr').forEach((tr) => {
                        const t = rapih(Array.from(tr.children).map((c) => c.textContent).join(' '));
                        const m = /(?<![A-Za-z0-9])SP\d{3,6}-\d+(?!\d)/.exec(t);
                        if (!m) return;
                        const a = editAktif(tr);
                        if (a === null) return;
                        statusMap[m[0]] = a ? 'baru' : (/dibatalkan/i.test(t) ? 'batal' : 'proses');
                        perlu.delete(m[0]);
                    });
                    perbaruiWarna();
                    if (!perlu.size) break;
                    url = linkBerikut(doc);
                }
            }
        } catch (e) { /* status tidak wajib */ }
        sedangStatus = false;
        perbaruiWarna();
    }

    // ---------- Rekap semua: telusuri halaman 1,2,3,... (50 halaman per tahap) ----------
    const HAL_PER_TAHAP = 50;
    let mode = 'hari';         // 'hari' = rekap semua (nama lama dipertahankan), 'halaman' = per halaman
    let cariOutlet = '';       // kata pencarian outlet
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
                if (terbuka && (n === 1 || n % 10 === 0)) muatStatus(hari.items);   // status mulai dicek lebih awal, tanpa menunggu semua halaman
                if (n <= 2 || n % 3 === 0) render();           // tampilkan progres
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
        if (terbuka && !hari.error) muatStatus(hari.items);
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
        '.it.st-baru{background:#fff7ed;border-left:5px solid #f97316}',
        '.it.st-proses{background:#ecfdf5;border-left:5px solid #16a34a}',
        '.it.st-batal{background:#fef2f2;border-left:5px solid #dc2626}',
        '.stl{font-size:11px;font-weight:700;margin-top:2px}',
        '.it .f{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}',
        '.it .fl{flex:1;min-width:0}',
        '.ck{flex:0 0 auto;width:24px;height:24px;border-radius:50%;color:#fff;font-size:14px;line-height:24px;text-align:center;font-weight:700}',
        '.ck:empty{display:none}',
        '.st-baru .ck{background:#f97316}.st-proses .ck{background:#16a34a}.st-batal .ck{background:#dc2626}',
        '.st-baru .stl{color:#c2410c}.st-proses .stl{color:#15803d}.st-batal .stl{color:#b91c1c}',
        '.leg{padding:5px 12px;font-size:12px;color:#555;border-bottom:1px solid #eee}',
        '.it .f{font-weight:700;word-break:break-all}',
        '.it .f a{color:#1d4ed8;text-decoration:none}',
        '.it .m{color:#666;font-size:12px;margin-top:2px}',
        '.tag{display:inline-block;background:#f97316;color:#fff;border-radius:4px;font-size:10px;font-weight:700;padding:1px 5px;margin-left:6px;vertical-align:middle}',
        '.tabs{display:flex;border-bottom:1px solid #fecaca}',
        '.tabs button{flex:1;padding:8px;border:none;background:#fff;font-size:13px;color:#666;cursor:pointer;border-bottom:3px solid transparent}',
        '.tabs button.on{color:#dc2626;font-weight:700;border-bottom-color:#dc2626}',
        '.rk{padding:8px 12px;border-bottom:1px solid #eee;position:relative}',
        '.panah{position:absolute;right:22px;top:16px;font-size:14px;color:#666;cursor:pointer;padding:0 4px}',
        '.opts{display:none;position:absolute;left:12px;right:12px;top:calc(100% - 4px);max-height:36vh;overflow-y:auto;background:#fff;border:1px solid #ccc;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.3);z-index:10}',
        '.opts.buka{display:block}',
        '.opt{display:flex;justify-content:space-between;gap:8px;padding:10px 12px;font-size:14px;border-bottom:1px solid #eee;cursor:pointer}',
        '.opt.on{background:#fef2f2;font-weight:700}',
        '.cari{width:100%;padding:8px 28px 8px 8px;font-size:14px;border:1px solid #ccc;border-radius:8px;background:#fff;color:#222}',
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
            Object.keys(statusMap).forEach((k) => delete statusMap[k]);   // status dicek ulang tiap lonceng dibuka
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

    // Kerangka panel TETAP (tidak dibuat ulang tiap render) supaya kotak cari outlet tidak kehilangan fokus/ketikan
    const zTop = el('div'), rkBox = el('div', 'rk'), list = el('div', 'list'), zBottom = el('div');
    zTop.style.cssText = 'flex:0 0 auto';
    zBottom.style.cssText = 'flex:0 0 auto';
    const inp = el('input', 'cari');
    inp.type = 'text';
    inp.setAttribute('autocomplete', 'off');
    inp.setAttribute('autocapitalize', 'off');
    inp.setAttribute('spellcheck', 'false');
    const panah = el('span', 'panah', '▾');
    const opts = el('div', 'opts');
    rkBox.append(inp, panah, opts);
    panel.append(zTop, rkBox, list, zBottom);
    const ctx = { src: null, per: new Map(), adaDrop: false };

    const cocokCari = (nama) => !cariOutlet || nama.toLowerCase().indexOf(cariOutlet.toLowerCase()) !== -1;
    const outletItem = (it) => it.outlet || '(tanpa outlet)';
    function hitungTampil() {
        const src = ctx.src;
        if (!src) return [];
        if (!ctx.adaDrop) return src.items;
        if (outletPilih !== '') return src.items.filter((it) => outletItem(it) === outletPilih);
        return cariOutlet ? src.items.filter((it) => cocokCari(outletItem(it))) : src.items;
    }
    const LABEL_ST = { baru: 'Pesanan baru', proses: 'Sudah diproses', batal: 'Dibatalkan' };
    function terapkanStatusRow(row, st) {
        row.className = 'it' + (st ? ' st-' + st : '');
        const ck = row.querySelector('.ck');
        if (ck) { ck.textContent = st === 'batal' ? '✕' : (st ? '✔' : ''); ck.title = st ? LABEL_ST[st] : ''; }
        let l = row.querySelector('.stl');
        if (!st) { if (l) l.remove(); return; }
        if (!l) { l = el('div', 'stl'); row.appendChild(l); }
        l.textContent = LABEL_ST[st];
    }
    // perbarui warna baris yang sudah tampil tanpa menggambar ulang (tidak mengganggu ketikan/gulir)
    function perbaruiWarna() {
        Array.from(list.children).forEach((row) => {
            const k = row.getAttribute('data-kode');
            if (k && statusMap[k]) terapkanStatusRow(row, statusMap[k]);
        });
        perbaruiLegenda();
    }
    let legEl = null;
    function perbaruiLegenda() {
        if (!legEl) return;
        const src = ctx.src;
        const kodes = src ? src.items.map((i) => i.kode).filter(Boolean) : [];
        const tahu = kodes.filter((k) => statusMap[k]).length;
        legEl.textContent = (sedangStatus ? 'Mengecek status pesanan... · ' : '') + '🟧 pesanan baru · 🟩 sudah diproses · 🟥 dibatalkan' +
            (!sedangStatus && kodes.length ? ' · status terbaca ' + tahu + '/' + kodes.length : '');
    }

    function isiList() {
        const st0 = list.scrollTop;
        list.textContent = '';
        const src = ctx.src;
        const seen = terakhirDilihat();
        const tampil = hitungTampil();
        if (src && tampil.length) {
            tampil.forEach((it) => {
                const row = el('div', 'it');
                row.setAttribute('data-kode', it.kode || '');
                const f = el('div', 'f');
                const fl = el('span', 'fl');
                if (it.href) {
                    const a = el('a', '', it.faktur);
                    a.href = it.href;
                    fl.appendChild(a);
                } else {
                    fl.appendChild(document.createTextNode(it.faktur));
                }
                if (it.ts > seen) fl.appendChild(el('span', 'tag', 'BARU'));
                f.appendChild(fl);
                f.appendChild(el('span', 'ck'));       // tanda status di kanan no faktur
                row.appendChild(f);
                row.appendChild(el('div', 'm', [fmtWaktu(it.ts), it.kode, it.total ? (/^rp/i.test(it.total) ? it.total : 'Rp ' + it.total) : ''].filter(Boolean).join(' - ')));
                terapkanStatusRow(row, statusMap[it.kode] || '');
                list.appendChild(row);
            });
        } else if (src && !src.error) {
            list.appendChild(el('div', 'kosong', mode === 'hari'
                ? (cariOutlet || outletPilih ? 'Tidak ada nota untuk outlet itu.' : 'Belum ada nota web yang ditemukan.')
                : (src.totalBaris ? 'Tidak ada nota web di ' + src.totalBaris + ' baris di halaman ' + (src.halaman || 1) + '.' : 'Tabel Data Penjualan tidak terbaca (0 baris).')));
        } else if (!src || sedangFetch) {
            list.appendChild(el('div', 'kosong', 'Memuat...'));
        }
        list.scrollTop = st0;
    }

    function isiOpsi() {
        opts.textContent = '';
        const q = outletPilih ? '' : cariOutlet;
        const cocok = Array.from(ctx.per.entries()).filter(([k]) => !q || k.toLowerCase().indexOf(q.toLowerCase()) !== -1).sort((x, y) => y[1] - x[1]);
        const semua = el('div', 'opt' + (!outletPilih && !cariOutlet ? ' on' : ''));
        semua.append(el('span', '', q ? 'Semua yang cocok' : 'Semua outlet'), el('b', '', String(cocok.reduce((t, e) => t + e[1], 0))));
        semua.onclick = () => { if (!q) { outletPilih = ''; cariOutlet = ''; inp.value = ''; } else { outletPilih = ''; } opts.classList.remove('buka'); isiList(); };
        opts.appendChild(semua);
        cocok.forEach(([k, n]) => {
            const o = el('div', 'opt' + (k === outletPilih ? ' on' : ''));
            o.append(el('span', '', k), el('b', '', String(n)));
            o.onclick = () => { outletPilih = k; cariOutlet = ''; inp.value = k; opts.classList.remove('buka'); isiList(); };
            opts.appendChild(o);
        });
        if (!cocok.length) opts.appendChild(el('div', 'opt', 'Outlet tidak ditemukan'));
    }
    opts.addEventListener('mousedown', (e) => e.preventDefault());
    opts.addEventListener('pointerdown', (e) => e.preventDefault());
    inp.addEventListener('focus', () => { if (outletPilih) inp.select(); isiOpsi(); opts.classList.add('buka'); });
    // pakai nilai apa adanya (tanpa trim) supaya spasi/hapus bekerja normal
    inp.addEventListener('input', () => { outletPilih = ''; cariOutlet = inp.value; isiOpsi(); opts.classList.add('buka'); isiList(); });
    inp.addEventListener('blur', () => setTimeout(() => opts.classList.remove('buka'), 150));
    // jangan biarkan skrip/halaman Erzap menelan tombol keyboard (mis. Backspace) dari kotak ini
    ['keydown', 'keyup', 'keypress'].forEach((ev) => inp.addEventListener(ev, (e) => e.stopPropagation()));
    panah.addEventListener('click', () => { if (opts.classList.contains('buka')) opts.classList.remove('buka'); else { isiOpsi(); opts.classList.add('buka'); inp.focus(); } });

    function render() {
        if (!terbuka) return;
        zTop.textContent = '';

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
        zTop.appendChild(hd);

        const tabs = el('div', 'tabs');
        [['hari', 'Semua'], ['halaman', 'Per halaman']].forEach(([m, t]) => {
            const bt = el('button', m === mode ? 'on' : '', t);
            bt.type = 'button';
            bt.onclick = () => { if (mode === m) return; mode = m; if (m === 'hari') { if (!hari) muatHari(false); else render(); } else if (!data) muatData(true, 1); else render(); };
            tabs.appendChild(bt);
        });
        zTop.appendChild(tabs);

        const src = mode === 'hari' ? hari : data;
        const sub = el('div', 'sub' + (src && src.error ? ' err' : ''));
        if (sedangFetch) sub.textContent = 'Memindai' + (mode === 'hari' && hari ? ' · halaman ' + hari.halaman + '...' : '...');
        else if (!src) sub.textContent = 'Memuat...';
        else if (src.error) sub.textContent = 'Gagal memuat: ' + src.error + (src.waktu ? ' (data lama ' + fmtWaktu(src.waktu) + ')' : '');
        else if (mode === 'hari') sub.textContent = 'Rekap semua: ' + src.items.length + ' nota web (dipindai ' + src.totalBaris + ' baris, halaman 1-' + src.halaman + (src.selesai ? ', semua halaman' : ', masih ada halaman lain') + ') · dicek ' + fmtWaktu(src.waktu);
        else sub.textContent = src.items.length + ' nota web dari ' + src.totalBaris + ' baris · halaman ' + (src.halaman || 1) + ' Data Penjualan · dicek ' + fmtWaktu(src.waktu);
        zTop.appendChild(sub);
        legEl = el('div', 'leg');
        zTop.appendChild(legEl);

        ctx.src = src;
        ctx.adaDrop = !!(mode === 'hari' && src && src.items.length);
        ctx.per = new Map();
        if (ctx.adaDrop) src.items.forEach((it) => { const k = outletItem(it); ctx.per.set(k, (ctx.per.get(k) || 0) + 1); });
        if (outletPilih !== '' && !ctx.per.has(outletPilih)) { outletPilih = ''; if (root.activeElement !== inp) inp.value = cariOutlet; }
        rkBox.style.display = ctx.adaDrop ? '' : 'none';
        if (ctx.adaDrop) {
            inp.placeholder = 'Semua outlet (' + src.items.length + ') - ketik untuk cari';
            if (root.activeElement !== inp) inp.value = outletPilih || cariOutlet;
            if (opts.classList.contains('buka')) isiOpsi();
        }
        isiList();
        perbaruiLegenda();

        zBottom.textContent = '';
        if (mode === 'hari' && hari && !hari.selesai && !sedangFetch) {
            const lg = el('button', '', 'Pindai ' + HAL_PER_TAHAP + ' halaman berikutnya ›');
            lg.type = 'button';
            lg.style.cssText = 'display:block;width:calc(100% - 20px);margin:8px 10px 10px;padding:8px;border:1px solid #ccc;border-radius:8px;background:#f5f5f5;font-size:13px;cursor:pointer;';
            lg.onclick = () => muatHari(true);
            zBottom.appendChild(lg);
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
            zBottom.appendChild(nav);
        }
    }

    // bersihkan sisa pengaturan filter lama (fitur filter dihapus)
    ls.del(K_FILTER);

    // ---------- Tombol lonceng sebaris di halaman Data Pesanan Penjualan (sebelum tombol "Cari Pesanan Marketplace Online") ----------
    var tombolInline = null;
    if (/^\/pesanan_penjualans(\/index\/new)?\/?$/.test(location.pathname)) {
        let sejak = Date.now();
        const pasangInline = () => {
            if (tombolInline && document.contains(tombolInline)) return;
            const terlihat = (e) => !!e && e.offsetParent !== null;
            let rekap = document.getElementById('btn_cari_pesanan_marketplace_online');
            if (!terlihat(rekap)) rekap = Array.from(document.querySelectorAll('a, button')).find((e) => /marketplace/i.test(e.textContent || '') && terlihat(e) && e.id !== 'aistim_pw_inline');
            if (!rekap || !rekap.parentNode) {
                if (Date.now() - sejak > 5000) fab.style.display = '';   // jangkar tak ketemu: pakai FAB saja
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
    } else {
        fab.style.display = 'none';   // di halaman lain lonceng disembunyikan (pengecekan & bunyi tetap jalan di latar)
    }

    // ---------- Kolom "Outlet" di tabel Data Pesanan Penjualan (di samping kolom "Pemesan") ----------
    // ID pesanan dari link /pesanan_penjualans/<id> di baris; outlet dibaca dari dropdown outlet halaman detailnya.
    if (/^\/pesanan_penjualans(\/index\/new)?\/?$/.test(location.pathname)) {
        const K_OUTLET = 'aistim_pw_outlet';
        let cacheOutlet = {};
        try { cacheOutlet = JSON.parse(ls.get(K_OUTLET) || '{}') || {}; } catch (e) { cacheOutlet = {}; }
        const antriOutlet = [];
        let jalanOutlet = 0;

        const bacaOutlet = (html) => {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const sel = doc.querySelector('#pesanan_penjualan_idoutlet_own');
            if (!sel) return '';
            const op = sel.querySelector('option[selected]') || sel.options[sel.selectedIndex];
            return op && op.value ? rapih(op.textContent) : '';
        };
        const idBaris = (tr) => {
            const a = Array.from(tr.querySelectorAll('a[href]')).find((x) => /\/pesanan_penjualans\/\d+(?:[\/?#]|$)/.test(x.getAttribute('href') || ''));
            const m = a && /\/pesanan_penjualans\/(\d+)/.exec(a.getAttribute('href'));
            return m ? m[1] : '';
        };
        const isiOutlet = (td, teks) => { td.textContent = teks; };
        function prosesAntriOutlet() {
            while (jalanOutlet < 4 && antriOutlet.length) {
                const it = antriOutlet.shift();
                if (cacheOutlet[it.id]) { isiOutlet(it.td, cacheOutlet[it.id]); continue; }
                jalanOutlet++;
                fetch('/pesanan_penjualans/' + it.id, { credentials: 'same-origin', cache: 'no-store' })
                    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
                    .then((h) => {
                        const nama = bacaOutlet(h);
                        if (nama) { cacheOutlet[it.id] = nama; ls.set(K_OUTLET, JSON.stringify(cacheOutlet)); }
                        isiOutlet(it.td, nama || '(tidak terbaca)');
                    })
                    .catch(() => { isiOutlet(it.td, '(gagal)'); })
                    .then(() => { jalanOutlet--; prosesAntriOutlet(); });
            }
        }
        function tambahKolomOutlet() {
            let headBerubah = false;
            document.querySelectorAll('table').forEach((tabel) => {
                const hrow = tabel.tHead && tabel.tHead.rows[0];
                if (!hrow) return;
                const ths = Array.from(hrow.children);
                const idx = ths.findIndex((t) => /^pemesan$/i.test(rapih(t.textContent)));
                if (idx < 0) return;
                if (!hrow.querySelector('th.aistim_pw_outlet_th')) {
                    // salin th "Pemesan" (header DataTables: header terpisah + thead tersembunyi di tabel isi), ganti teksnya
                    const th = ths[idx].cloneNode(true);
                    th.className = (th.className || '').replace(/\bsorting\w*\b/g, '').trim() + ' aistim_pw_outlet_th';
                    th.removeAttribute('aria-sort');
                    th.removeAttribute('aria-label');
                    th.removeAttribute('tabindex');
                    th.style.width = '';
                    th.style.cursor = 'default';
                    setThText(th, 'Outlet');
                    ths[idx].insertAdjacentElement('afterend', th);
                    headBerubah = true;
                }
                tabel.querySelectorAll('tbody tr').forEach((tr) => {
                    if (tr.querySelector('td.aistim_pw_outlet_td')) return;
                    const tds = Array.from(tr.children).filter((c) => /^td$/i.test(c.tagName));
                    if (tds.length <= idx || tds.length < 3) return;   // baris pesan kosong ("tidak ada data")
                    const id = idBaris(tr);
                    const td = document.createElement('td');
                    td.className = 'aistim_pw_outlet_td';
                    td.textContent = id ? '...' : '-';
                    tds[idx].after(td);
                    if (id) antriOutlet.push({ id: id, td: td });
                });
            });
            // header ganda: baris header di badan tabel (pengukur lebar) harus tersembunyi, hanya header terpisah yang tampak
            document.querySelectorAll('#data_table td.aistim_pw_outlet_td').forEach((td) => {
                const t = td.closest('table');
                const w = t && t.closest('.dataTables_wrapper');
                if (t && w && !t.classList.contains('aistim_pw_body_tbl') && Array.from(w.querySelectorAll('table')).some((x) => x !== t && x.querySelector('th.aistim_pw_outlet_th'))) {
                    t.classList.add('aistim_pw_body_tbl');
                }
            });
            prosesAntriOutlet();
            if (headBerubah) {
                window.dispatchEvent(new Event('resize'));   // tabel menghitung ulang header yang tersembunyi
                [60, 300, 800].forEach((ms) => setTimeout(sinkronLebar, ms));
            }
            sinkronLebar();
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
        // Header terpisah mengikuti lebar kolom header tabel isi (sama seperti kolom Rak di Lihat Stok)
        function sinkronLebar() {
            const badan = document.querySelector('#data_table td.aistim_pw_outlet_td');
            const table = badan && badan.closest('table');
            const wrapper = table && table.closest('.dataTables_wrapper');
            if (!wrapper) return;
            const bodyThs = table.querySelectorAll('thead tr:first-child th');
            if (!bodyThs.length) return;
            const widths = Array.from(bodyThs).map((t) => t.getBoundingClientRect().width);
            if (!widths.some((w) => w > 0)) return;   // kolom tersembunyi (display:none) berlebar 0: dilewati, bukan membatalkan semua
            const total = table.getBoundingClientRect().width;
            wrapper.querySelectorAll('table').forEach((t) => {
                if (t === table || t.closest('#aistim_pw_hasil')) return;   // tabel hasil Pesanan Web mengatur lebarnya sendiri
                const ths = t.querySelectorAll('thead tr:first-child th');
                if (ths.length !== widths.length) return;
                t.style.width = total + 'px';
                const inner = t.closest('.dataTables_scrollHeadInner');
                if (inner) inner.style.width = total + 'px';
                ths.forEach((th, i) => {
                    if (!widths[i]) return;
                    th.style.boxSizing = 'border-box';
                    th.style.width = th.style.minWidth = th.style.maxWidth = widths[i] + 'px';
                });
            });
        }
        // lebar kolom Outlet dikunci supaya header & isi selalu sejajar
        const stOutlet = document.createElement('style');
        stOutlet.textContent = '.aistim_pw_outlet_th,.aistim_pw_outlet_td{min-width:150px;box-sizing:border-box}' +
            '.aistim_pw_outlet_td{white-space:normal;word-break:break-word}' +
            '@media (max-width:768px){.aistim_pw_outlet_th,.aistim_pw_outlet_td{min-width:120px;font-size:12px}}' +
            '.aistim_pw_body_tbl thead th{height:0!important;padding-top:0!important;padding-bottom:0!important;border-top-width:0!important;border-bottom-width:0!important;line-height:0!important;font-size:0!important;overflow:hidden!important;background-image:none!important}' +
            '.aistim_pw_body_tbl thead th *{height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;font-size:0!important;line-height:0!important}' +
            '.aistim_pw_outlet_th{white-space:nowrap;pointer-events:none;cursor:default;background-image:none!important}';   // bukan kolom data tabel: tanpa panah/klik urut
        document.head.appendChild(stOutlet);
        // lebar header disamakan lagi tiap ukuran jendela/tabel berubah (satu kali per frame)
        let rafSinkron = 0;
        const jadwalSinkron = () => { if (rafSinkron) return; rafSinkron = requestAnimationFrame(() => { rafSinkron = 0; sinkronLebar(); }); };
        window.addEventListener('resize', jadwalSinkron);
        window.addEventListener('orientationchange', jadwalSinkron);
        if (window.ResizeObserver) {
            const ro = new ResizeObserver(jadwalSinkron);
            let diamati = null;
            setInterval(() => {
                const t = document.querySelector('#data_table td.aistim_pw_outlet_td');
                const tb = t && t.closest('table');
                if (tb && tb !== diamati) { diamati = tb; ro.observe(tb); }
            }, 1000);
        }
        setInterval(tambahKolomOutlet, 1500);   // tabel bisa digambar ulang (pencarian/halaman berikut): kolom dipasang lagi
        tambahKolomOutlet();

    // ---------- Filter "Pesanan Web" (di bawah Status Pemesanan, form pencarian Data Pesanan Penjualan) ----------
    // Berdiri sendiri (tanpa name: tidak ikut terkirim ke server). Seperti filter Status Rak: saat dipilih, skrip
    // menelusuri halaman berikutnya (fetch tombol "Berikutnya" milik situs), mengumpulkan baris yang cocok, lalu
    // menampilkannya di tabel hasil. Pesanan web = kolom Pemesan memuat nomor faktur web (pola RE_FAKTUR).
        const K_FWEB = 'aistim_pw_fweb';
        const MAKS_HAL_WEB = 40;   // batas pengaman jumlah halaman situs yang dipindai
        const pilihWeb = () => ls.get(K_FWEB) || '';
        const cocokStatus = (teks, v) => (v === 'baru' ? /^Pesanan Baru\b/i.test(teks) : /^Pesanan Diproses\b/i.test(teks));
        const scan = { aktif: false, sesi: 0, baris: [], kunci: new Set(), sigSelesai: null, ringkas: '' };

        const idxPemesan = (tabel) => {
            const hrow = tabel && tabel.tHead && tabel.tHead.rows[0];
            return hrow ? Array.from(hrow.children).findIndex((t) => /^pemesan$/i.test(rapih(t.textContent))) : -1;
        };
        const barisCocok = (tr, idx, v) => {
            const td = tr.children[idx];
            if (!td) return false;
            const teks = rapih(td.textContent);
            return RE_FAKTUR.test(teks) && cocokStatus(teks, v);
        };
        const tabelUtama = () => document.getElementById('data_table');
        const sigTabelWeb = () => {
            const t = tabelUtama();
            return t ? Array.from(t.querySelectorAll('tbody tr')).map((tr) => idBaris(tr)).join(';') : '';
        };

        const CSS_WEB = '#aistim_pw_hasil{margin:0 0 8px}' +
            '#aistim_pw_hasil .bar{display:flex;align-items:center;gap:8px;padding:6px 10px;background:#fef2f2;border:1px solid #fecaca;font-size:13px;flex-wrap:wrap}' +
            '#aistim_pw_hasil .bar b{flex:1;font-weight:600}' +
            '#aistim_pw_hasil .bar button{border:1px solid #ccc;border-radius:6px;background:#f5f5f5;padding:3px 10px;cursor:pointer}' +
            '#aistim_pw_hasil .gulir{overflow:auto;max-height:70vh}' +
            '#aistim_pw_hasil thead th{position:sticky;top:0;z-index:2;background:#eef0f4}' +
            '.aistim_pw_mode_hasil .dataTables_scroll{display:none!important}';
        const stWeb = document.createElement('style');
        stWeb.textContent = CSS_WEB;
        document.head.appendChild(stWeb);

        function setBarWeb(teks, berjalan) {
            const box = document.getElementById('aistim_pw_hasil');
            if (!box) return;
            const b = box.querySelector('b');
            if (b && b.textContent !== teks) b.textContent = teks;
            const st = box.querySelector('.stop');
            if (st) st.style.display = berjalan ? '' : 'none';
        }
        function siapkanHasilWeb(tabel) {
            const wrap = tabel.closest('.dataTables_wrapper') || tabel.parentElement;
            if (!wrap) return null;
            let box = document.getElementById('aistim_pw_hasil');
            if (box) return box;
            box = document.createElement('div');
            box.id = 'aistim_pw_hasil';
            const bar = document.createElement('div');
            bar.className = 'bar';
            const tx = document.createElement('b');
            const stop = document.createElement('button');
            stop.type = 'button'; stop.className = 'stop'; stop.textContent = 'Berhenti';
            stop.addEventListener('click', () => { scan.sesi++; scan.aktif = false; scan.ringkas = 'Dihentikan: ' + scan.baris.length + ' pesanan web'; setBarWeb(scan.ringkas, false); });
            const tutup = document.createElement('button');
            tutup.type = 'button'; tutup.textContent = 'Tutup hasil';
            tutup.addEventListener('click', () => {
                const s = document.getElementById('aistim_pw_fweb');
                if (s) { s.value = ''; s.dispatchEvent(new Event('change')); }
            });
            bar.append(tx, stop, tutup);
            const gulir = document.createElement('div');
            gulir.className = 'gulir';
            const tb = tabel.cloneNode(false);
            tb.removeAttribute('id');
            tb.removeAttribute('style');
            tb.className = (tb.className || '').replace(/\baistim_pw_body_tbl\b/g, '').trim();
            const srcHead = wrap.querySelector('.dataTables_scrollHead thead') || tabel.querySelector('thead');
            if (srcHead) {
                const th = srcHead.cloneNode(true);
                th.querySelectorAll('th').forEach((x) => {
                    x.style.width = x.style.minWidth = x.style.maxWidth = '';
                    x.removeAttribute('aria-sort'); x.removeAttribute('aria-controls'); x.removeAttribute('tabindex');
                    x.className = (x.className || '').replace(/\bsorting\w*\b/g, '').trim();
                });
                tb.appendChild(th);
            }
            tb.appendChild(document.createElement('tbody'));
            gulir.appendChild(tb);
            box.append(bar, gulir);
            const ref = wrap.querySelector('.dataTables_scroll') || tabel;
            ref.insertAdjacentElement('beforebegin', box);
            wrap.classList.add('aistim_pw_mode_hasil');
            return box;
        }
        function hapusHasilWeb(tabel) {
            const box = document.getElementById('aistim_pw_hasil');
            if (box) box.remove();
            const wrap = tabel && (tabel.closest('.dataTables_wrapper') || tabel.parentElement);
            if (wrap) wrap.classList.remove('aistim_pw_mode_hasil');
        }
        function tambahBarisWeb(tr, tabel) {
            const k = idBaris(tr) || tr.outerHTML.length + ':' + rapih(tr.textContent).slice(0, 60);
            if (scan.kunci.has(k)) return;
            scan.kunci.add(k);
            const salin = document.importNode(tr, true);
            salin.querySelectorAll('td.aistim_pw_outlet_td').forEach((x) => x.remove());   // kolom Outlet dipasang ulang oleh skrip
            // Halaman hasil fetch (hal. 2 dst) belum diolah script tabel situs: tanpa kolom Lihat/Edit di depan, dan
            // "Show"/"Edit" tampil di ujung. Samakan dengan baris tabel asli: No | Lihat | Edit | ... | (Show, Edit tersembunyi)
            const hrow0 = tabel.tHead && tabel.tHead.rows[0];
            const kolom = hrow0 ? Array.from(hrow0.children).filter((c) => !c.classList.contains('aistim_pw_outlet_th')).length : 0;
            const sel = Array.from(salin.children).filter((c) => /^td$/i.test(c.tagName));
            const aShow = sel.length > 2 && sel[sel.length - 2].querySelector('a');
            if (aShow && /^show$/i.test(rapih(aShow.textContent)) && sel[sel.length - 2].style.display !== 'none' && (!kolom || sel.length < kolom)) {
                const show = sel[sel.length - 2], edit = sel[sel.length - 1];
                const lihat = show.cloneNode(true), edit2 = edit.cloneNode(true);
                lihat.className = edit2.className = 'textCenter undefined';
                const aL = lihat.querySelector('a');
                if (aL) aL.textContent = 'Lihat';
                sel[0].after(lihat);
                lihat.after(edit2);
                show.style.display = 'none';
                edit.style.display = 'none';
            }
            salin.style.display = '';
            delete salin.dataset.aistimPwHide;
            scan.baris.push(salin);
            const hb = document.querySelector('#aistim_pw_hasil tbody');
            if (hb) hb.appendChild(salin);
        }
        const linkBerikutWeb = (doc) => {
            const a = Array.from(doc.querySelectorAll('a.pagination_next[href], a[rel="next"][href]')).find((x) => {
                const h = (x.getAttribute('href') || '').trim();
                return h && h !== '#' && !/^javascript/i.test(h) && !x.classList.contains('disabled');
            });
            if (!a) return null;
            try { return new URL(a.getAttribute('href'), location.origin + '/pesanan_penjualans').href; } catch (e) { return null; }
        };

        async function mulaiScanWeb() {
            const tabel = tabelUtama();
            const v = pilihWeb();
            if (!tabel || !v) return;
            const sesi = ++scan.sesi;
            scan.aktif = true;
            scan.baris = [];
            scan.kunci = new Set();
            scan.ringkas = '';
            const sig = sigTabelWeb();
            siapkanHasilWeb(tabel);
            const batal = () => sesi !== scan.sesi;
            const idx0 = idxPemesan(tabel);
            let hal = 1, url = linkBerikutWeb(document);
            try {
                // halaman yang sedang tampil
                tabel.querySelectorAll('tbody tr').forEach((tr) => { if (idx0 >= 0 && barisCocok(tr, idx0, v)) tambahBarisWeb(tr, tabel); });
                setBarWeb('Pesanan Web: halaman 1, ditemukan ' + scan.baris.length, true);
                const sudah = new Set();
                while (!batal() && url && hal < MAKS_HAL_WEB && !sudah.has(url)) {
                    sudah.add(url);
                    const res = await fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'text/html' } });
                    if (batal()) return;
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
                    const t = doc.getElementById('data_table');
                    if (!t) throw new Error('respons tidak berisi tabel');
                    const idx = idxPemesan(t);
                    hal++;
                    t.querySelectorAll('tbody tr').forEach((tr) => { if (idx >= 0 && barisCocok(tr, idx, v)) tambahBarisWeb(tr, tabel); });
                    setBarWeb('Pesanan Web: halaman ' + hal + ', ditemukan ' + scan.baris.length, true);
                    url = linkBerikutWeb(doc);
                    tambahKolomOutlet();
                }
                if (batal()) return;
                scan.ringkas = 'Pesanan Web: ' + scan.baris.length + ' pesanan' + (v === 'baru' ? ' baru' : ' diproses') + ' (dipindai ' + hal + ' halaman' +
                    (!url ? ', halaman terakhir' : (hal >= MAKS_HAL_WEB ? ', batas ' + MAKS_HAL_WEB + ' halaman' : '')) + ')';
            } catch (e) {
                if (batal()) return;
                scan.ringkas = 'Pesanan Web: berhenti (' + (e.message || e) + '), ' + scan.baris.length + ' pesanan ditemukan';
            }
            scan.aktif = false;
            scan.sigSelesai = sig;
            setBarWeb(scan.ringkas, false);
            tambahKolomOutlet();
        }

        function pasangFilterWeb() {
            const sel = document.getElementById('pencarian_status_pesanan');
            const baris = sel && sel.closest('.field2');
            if (!baris) return;
            if (!document.getElementById('aistim_pw_fweb')) {
                const f = document.createElement('div');
                f.className = 'field2';
                f.innerHTML = '<label for="aistim_pw_fweb">Pesanan Web</label>' +
                    '<select id="aistim_pw_fweb"><option value="">-- Semua --</option>' +
                    '<option value="baru">Pesanan Baru</option><option value="proses">Pesanan Diproses</option></select>';
                baris.after(f);
                const s = f.querySelector('select');
                s.value = pilihWeb();
                s.addEventListener('change', () => {
                    if (s.value) ls.set(K_FWEB, s.value); else ls.del(K_FWEB);
                    scan.sesi++; scan.aktif = false; scan.sigSelesai = null;
                    if (!s.value) hapusHasilWeb(tabelUtama()); else { hapusHasilWeb(tabelUtama()); mulaiScanWeb(); }
                });
            }
            const tabel = tabelUtama();
            if (!tabel) return;
            if (!pilihWeb()) { if (document.getElementById('aistim_pw_hasil')) hapusHasilWeb(tabel); return; }
            const sig = sigTabelWeb();
            // tabel baru dari situs (cari ulang / reload): telusuri lagi
            if (!scan.aktif && sig && sig !== scan.sigSelesai) { hapusHasilWeb(tabel); mulaiScanWeb(); }
        }
        setInterval(pasangFilterWeb, 1500);
        pasangFilterWeb();
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
