// ==UserScript==
// @name         devtool
// @namespace    http://tampermonkey.net/
// @version      1.4.0
// @description  [v1.4.0] Hasil rekaman kini memuat struktur halaman (tabel, filter, kata 'website'). Tombol 🔍 partdistro: intip halaman partdistro.com (lewat jembatan ekstensi). Tombol merekam klik & request (fetch/XHR) di SEMUA halaman Erzap untuk dikirim ke developer. TERSEMBUNYI secara default: aktif hanya setelah buka halaman dengan ?rekam=1 (matikan lagi dengan ?rekam=0). Token/cookie tidak ikut direkam.
// @match        https://*.erzap.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @world        main
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    if (window.__aistimRekam) return;
    window.__aistimRekam = true;

    // Default tersembunyi & tidak mengubah fetch/XHR. Aktifkan: tambahkan ?rekam=1 di URL
    // halaman (disimpan di browser), matikan: ?rekam=0.
    const FLAG = 'aistim_rekam_aktif';
    try {
        const q = new URLSearchParams(location.search).get('rekam');
        if (q === '1') localStorage.setItem(FLAG, '1');
        else if (q === '0') localStorage.removeItem(FLAG);
        if (localStorage.getItem(FLAG) !== '1') return;
    } catch (e) { return; }

    let merekam = false;
    let log = [];
    const MAKS_SNIPPET = 300;

    const t0 = () => new Date().toTimeString().slice(0, 8);
    const rapih = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    const sensor = (s) => String(s || '')
        .replace(/(authenticity_token=)[^&\s"']*/gi, '$1***')
        .replace(/(csrf[-_]?token["']?\s*[:=]\s*["']?)[^&\s"']*/gi, '$1***');

    function snippet(teks) {
        const t = rapih(teks);
        const i = t.search(/Penempatan Rak/i);
        if (i >= 0) return '...' + t.slice(Math.max(0, i - 40), i + 160) + '...';
        return t.slice(0, MAKS_SNIPPET);
    }

    function catat(baris) {
        if (!merekam) return;
        log.push(t0() + ' ' + baris);
        perbaruiTombol();
    }

    // ----- fetch -----
    const asliFetch = window.fetch;
    window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const method = (init && init.method) || (input && input.method) || 'GET';
        const body = init && typeof init.body === 'string' ? sensor(init.body).slice(0, 300) : '';
        const p = asliFetch.apply(this, arguments);
        if (merekam && sama_origin(url)) {
            p.then((res) => {
                res.clone().text().then((txt) => {
                    catat('FETCH ' + method + ' ' + sensor(url) + (body ? ' body=' + body : '') +
                        ' -> ' + res.status + ' [' + (res.headers.get('content-type') || '') + '] ' + txt.length + ' char | ' + snippet(txt));
                }).catch(() => {});
            }).catch((e) => catat('FETCH ' + method + ' ' + sensor(url) + ' -> ERROR ' + e));
        }
        return p;
    };

    // ----- XHR (jQuery $.ajax milik situs) -----
    const asliOpen = XMLHttpRequest.prototype.open;
    const asliSend = XMLHttpRequest.prototype.send;
    const asliSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.open = function (method, url) {
        this.__rk = { method: method, url: url, headers: [] };
        return asliOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
        if (this.__rk && /^(accept|content-type|x-requested-with)$/i.test(k)) this.__rk.headers.push(k + ': ' + v);
        return asliSetHeader.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
        const info = this.__rk;
        if (merekam && info && sama_origin(info.url)) {
            const b = typeof body === 'string' ? sensor(body).slice(0, 300) : '';
            this.addEventListener('loadend', function () {
                let txt = '';
                try { txt = typeof this.responseText === 'string' ? this.responseText : ''; } catch (e) { /* abaikan */ }
                catat('XHR ' + info.method + ' ' + sensor(info.url) + (b ? ' body=' + b : '') +
                    ' hdr{' + info.headers.join('; ') + '} -> ' + this.status + ' ' + txt.length + ' char | ' + snippet(txt));
            });
        }
        return asliSend.apply(this, arguments);
    };

    function sama_origin(url) {
        try { return new URL(url, location.href).origin === location.origin; } catch (e) { return false; }
    }

    // ----- klik -----
    document.addEventListener('click', (e) => {
        if (!merekam) return;
        const el = e.target;
        if (!el || !el.closest || el.closest('#rk_rekam_ui')) return;
        const dasar = el.closest('a, button, td, th, input, label') || el;
        const data = Array.from(dasar.attributes || [])
            .filter((a) => /^data-/.test(a.name)).map((a) => a.name + '=' + a.value).join(' ');
        catat('KLIK <' + dasar.tagName.toLowerCase() + (dasar.className ? ' class="' + rapih(dasar.className).slice(0, 80) + '"' : '') +
            (dasar.id ? ' id="' + dasar.id + '"' : '') + '> ' + (data ? '{' + data.slice(0, 200) + '} ' : '') + '"' + rapih(dasar.textContent).slice(0, 40) + '"');
    }, true);

    // ----- UI -----
    const ui = document.createElement('div');
    ui.id = 'rk_rekam_ui';
    ui.style.cssText = 'position:fixed;left:8px;bottom:70px;z-index:99990;font-family:sans-serif;';
    ui.innerHTML = '<button id="rk_btn" type="button" style="padding:8px 12px;border:none;border-radius:20px;background:#343a40;color:#fff;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.4);">&#9210; Rekam</button>' +
        ' <button id="rk_pd" type="button" style="padding:8px 12px;border:none;border-radius:20px;background:#0d6efd;color:#fff;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.4);">&#128269; partdistro</button>';
    const btn = ui.firstChild;
    const btnPd = ui.querySelector('#rk_pd');

    function perbaruiTombol() {
        btn.innerHTML = merekam ? '&#9209; Stop (' + log.length + ')' : '&#9210; Rekam';
        btn.style.background = merekam ? '#dc3545' : '#343a40';
    }

    function logRak() {
        const v = document.documentElement.getAttribute('data-aistim-rak-log');
        return 'LOG SCRIPT LIHAT STOK (rakstok.js: rak & gambar):\n' + (v || '(kosong)');
    }

    // Ringkasan gambar di tabel halaman (untuk mencari asal gambar produk)
    function laporanGambar() {
        const out = ['== GAMBAR DI HALAMAN =='];
        const semua = document.querySelectorAll('img');
        out.push('Total <img> di halaman: ' + semua.length);
        let n = 0;
        document.querySelectorAll('tbody tr').forEach((tr) => {
            if (n >= 8) return;
            const imgs = tr.querySelectorAll('img');
            if (!imgs.length) return;
            n++;
            const sel = Array.from(tr.children).slice(0, 4).map((td) => rapih(td.textContent).slice(0, 30)).join(' | ');
            const src = Array.from(imgs).slice(0, 3).map((im) =>
                'src=' + (im.getAttribute('src') || '') + (im.getAttribute('data-src') ? ' data-src=' + im.getAttribute('data-src') : '') +
                (im.className ? ' class=' + rapih(im.className).slice(0, 40) : '')).join(' ; ');
            out.push('BARIS: ' + sel + '\n   ' + src);
        });
        if (!n) out.push('(tidak ada <img> di baris tabel)');
        return out.join('\n');
    }

    function tampilModal(teks, judul) {
        const bd = document.createElement('div');
        bd.style.cssText = 'position:fixed;inset:0;z-index:99995;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;';
        bd.innerHTML = '<div style="background:#fff;width:94%;max-width:640px;border-radius:8px;padding:12px;display:flex;flex-direction:column;max-height:88vh;">' +
            '<div id="rk_judul" style="font-weight:bold;margin-bottom:6px;"></div>' +
            '<textarea id="rk_out" readonly style="flex:1;min-height:260px;font:11px monospace;"></textarea>' +
            '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">' +
            '<button id="rk_tutup" type="button" style="padding:6px 14px;">Tutup</button>' +
            '<button id="rk_salin" type="button" style="padding:6px 14px;background:#28a745;color:#fff;border:none;border-radius:4px;">Salin</button></div></div>';
        document.body.appendChild(bd);
        bd.querySelector('#rk_judul').textContent = judul;
        const ta = bd.querySelector('#rk_out');
        ta.value = teks;
        bd.querySelector('#rk_tutup').onclick = () => bd.remove();
        bd.querySelector('#rk_salin').onclick = async () => {
            try { await navigator.clipboard.writeText(teks); }
            catch (e) { ta.select(); document.execCommand('copy'); }
            bd.querySelector('#rk_salin').textContent = 'Tersalin ✓';
        };
    }

    function tampilkanHasil() {
        const teks = ['PEREKAM AISTIM ' + location.href, 'Waktu: ' + new Date().toString(), '', '== KLIK & REQUEST HALAMAN ==']
            .concat(log.length ? log : ['(tidak ada yang terekam)'])
            .concat(['', laporanGambar(), '', logRak(), '', '== STRUKTUR HALAMAN INI ==', ringkasDoc(document)]).join('\n');
        tampilModal(teks, 'Hasil rekaman (' + log.length + ' baris)');
    }

    // ----- intip halaman partdistro.com (lewat jembatan ekstensi Aistim; memakai login partdistro di browser ini) -----
    let seqX = 0;
    function xfetch(url) {
        return new Promise((resolve, reject) => {
            if (document.documentElement.getAttribute('data-aistim-xfetch') !== '1') {
                reject(new Error('Jembatan ekstensi Aistim tidak aktif di halaman ini'));
                return;
            }
            const id = 'rkx' + (++seqX) + '_' + Date.now();
            const timer = setTimeout(() => { window.removeEventListener('message', onMsg); reject(new Error('timeout (30 detik)')); }, 30000);
            function onMsg(ev) {
                if (ev.source !== window || !ev.data || !ev.data.aistimFetchResult || ev.data.aistimFetchResult.id !== id) return;
                clearTimeout(timer);
                window.removeEventListener('message', onMsg);
                const r = ev.data.aistimFetchResult;
                if (r.error) reject(new Error(r.error)); else resolve(r);
            }
            window.addEventListener('message', onMsg);
            window.postMessage({ aistimFetch: { id: id, url: url, opts: {} } }, location.origin);
        });
    }

    function ringkasHalaman(html) {
        return ringkasDoc(new DOMParser().parseFromString(html, 'text/html'));
    }

    function ringkasDoc(doc) {
        const out = [];
        out.push('Judul: ' + rapih(doc.title));
        if (doc.querySelector('input[type=password]')) out.push('!! Tampaknya HALAMAN LOGIN (ada kolom password). Login dulu di partdistro.com, lalu ulangi.');
        const hs = Array.from(doc.querySelectorAll('h1,h2,h3,h4')).map((h) => rapih(h.textContent)).filter(Boolean).slice(0, 12);
        out.push('Heading: ' + (hs.join(' | ') || '-'));

        const seen = {};
        const links = [];
        doc.querySelectorAll('a[href]').forEach((a) => {
            const t = rapih(a.textContent).slice(0, 40);
            const h = a.getAttribute('href') || '';
            if (!t || !h || h.charAt(0) === '#' || /^javascript/i.test(h)) return;
            const k = t + '>' + h;
            if (seen[k]) return;
            seen[k] = 1;
            links.push(t + ' -> ' + sensor(h).slice(0, 110));
        });
        out.push('Link menu/halaman (' + links.length + ' unik, 45 pertama):');
        links.slice(0, 45).forEach((l) => out.push('  ' + l));

        const tabel = Array.from(doc.querySelectorAll('table'));
        out.push('Jumlah tabel: ' + tabel.length);
        tabel.slice(0, 4).forEach((t, i) => {
            const th = Array.from(t.querySelectorAll('th')).map((x) => rapih(x.textContent).slice(0, 25));
            const rows = Array.from(t.querySelectorAll('tbody tr'));
            out.push('TABEL ' + (i + 1) + ' id=' + (t.id || '-') + ' class=' + rapih(t.className).slice(0, 50) + ' baris=' + rows.length);
            out.push('  header: ' + th.join(' | '));
            rows.slice(0, 3).forEach((r) => {
                out.push('  baris: ' + Array.from(r.children).map((td) => rapih(td.textContent).slice(0, 30)).join(' | '));
                const a = r.querySelector('a[href]');
                if (a) out.push('    link: ' + sensor(a.getAttribute('href')).slice(0, 110));
            });
        });

        const st = Array.from(doc.querySelectorAll('[class*=badge],[class*=label],[class*=status],[class*=notif],[class*=count]'))
            .map((e) => rapih(e.className).slice(0, 30) + '="' + rapih(e.textContent).slice(0, 30) + '"')
            .filter((v, i, a) => a.indexOf(v) === i).slice(0, 15);
        out.push('Badge/status: ' + (st.join(' ; ') || '-'));

        // Form pencarian/filter: kolom & pilihan (mis. filter sumber/via/website)
        const forms = Array.from(doc.querySelectorAll('form'));
        out.push('Jumlah form: ' + forms.length);
        forms.slice(0, 4).forEach((f, i) => {
            out.push('FORM ' + (i + 1) + ' id=' + (f.id || '-') + ' method=' + (f.getAttribute('method') || 'get') + ' action=' + sensor(f.getAttribute('action') || '').slice(0, 80));
            f.querySelectorAll('select').forEach((sel) => {
                const opsi = Array.from(sel.options).slice(0, 15).map((o) => rapih(o.text).slice(0, 22) + '=' + String(o.value).slice(0, 18)).join(' ; ');
                out.push('  select name=' + (sel.name || '-') + ' id=' + (sel.id || '-') + ' opsi: ' + opsi);
            });
            Array.from(f.querySelectorAll('input:not([type=hidden]):not([type=password]):not([type=submit])')).slice(0, 15).forEach((inp) => {
                out.push('  input name=' + (inp.name || '-') + ' type=' + (inp.type || 'text') + (inp.placeholder ? ' placeholder=' + rapih(inp.placeholder).slice(0, 25) : ''));
            });
        });

        // Di mana kata "website"/"partdistro" muncul (cara nota dari web dibedakan)
        const cocok = [];
        doc.querySelectorAll('body *').forEach((el) => {
            if (cocok.length >= 12 || /^(script|style|noscript|option)$/i.test(el.tagName) || (el.closest && el.closest('#rk_rekam_ui'))) return;
            const t = rapih(el.textContent);
            if (t.length > 0 && t.length <= 60 && /website|partdistro|olzap/i.test(t) && !Array.from(el.children).some((c) => /website|partdistro|olzap/i.test(c.textContent || ''))) {
                cocok.push('<' + el.tagName.toLowerCase() + (el.className ? ' class="' + rapih(el.className).slice(0, 40) + '"' : '') + (el.id ? ' id="' + el.id + '"' : '') + '> "' + t + '"');
            }
        });
        out.push('Kata website/partdistro/olzap muncul di: ' + (cocok.length ? '' : '-'));
        cocok.forEach((c) => out.push('  ' + c));
        return out.join('\n');
    }

    async function intipPartdistro() {
        const u = prompt('Alamat halaman partdistro.com yang mau diintip (mis. halaman daftar pesanan). Kosongkan = halaman depan:', 'https://partdistro.com/');
        if (u === null) return;
        let url;
        try { url = new URL(u.trim() || 'https://partdistro.com/', 'https://partdistro.com/'); } catch (e) { alert('Alamat tidak valid'); return; }
        if (!/(^|\.)partdistro\.com$/i.test(url.hostname)) { alert('Hanya partdistro.com yang diizinkan'); return; }
        btnPd.textContent = '⏳ ...';
        let teks;
        try {
            const r = await xfetch(url.href);
            teks = ['INTIP PARTDISTRO ' + sensor(url.href), 'Waktu: ' + new Date().toString(),
                'Status: ' + r.status + (r.url && r.url !== url.href ? ' | dialihkan ke ' + sensor(r.url) : '') + ' | ' + (r.text || '').length + ' char', '',
                ringkasHalaman(r.text || ''), '',
                '(Catatan: baris contoh tabel bisa memuat nama pelanggan. Hapus bagian itu bila perlu sebelum dikirim.)'].join('\n');
        } catch (e) {
            teks = 'GAGAL mengintip ' + url.href + '\n' + (e && e.message || e);
        }
        btnPd.innerHTML = '&#128269; partdistro';
        tampilModal(teks, 'Hasil intip partdistro.com');
    }
    btnPd.addEventListener('click', intipPartdistro);

    btn.addEventListener('click', () => {
        if (!merekam) {
            log = [];
            merekam = true;
            perbaruiTombol();
        } else {
            merekam = false;
            perbaruiTombol();
            tampilkanHasil();
        }
    });

    function pasang() {
        if (document.body && !document.getElementById('rk_rekam_ui')) document.body.appendChild(ui);
    }
    new MutationObserver(pasang).observe(document.documentElement, { childList: true, subtree: true });
    pasang();
})();
