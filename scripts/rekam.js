// ==UserScript==
// @name         Perekam Request (Debug)
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Tombol merekam klik & request (fetch/XHR) di Lihat Stok untuk dikirim ke developer. Token/cookie tidak ikut direkam.
// @match        https://*.erzap.com/produk_gudangs/lihat_stok/new*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @world        main
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    if (window.__aistimRekam) return;
    window.__aistimRekam = true;

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
    ui.innerHTML = '<button id="rk_btn" type="button" style="padding:8px 12px;border:none;border-radius:20px;background:#343a40;color:#fff;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.4);">&#9210; Rekam</button>';
    const btn = ui.firstChild;

    function perbaruiTombol() {
        btn.innerHTML = merekam ? '&#9209; Stop (' + log.length + ')' : '&#9210; Rekam';
        btn.style.background = merekam ? '#dc3545' : '#343a40';
    }

    function logRak() {
        const v = document.documentElement.getAttribute('data-aistim-rak-log');
        return v ? 'LOG SCRIPT RAK (rakstok.js):\n' + v : 'LOG SCRIPT RAK: (kosong / rakstok.js belum jalan)';
    }

    function tampilkanHasil() {
        const teks = ['PEREKAM AISTIM ' + location.href, 'Waktu: ' + new Date().toString(), '', '== KLIK & REQUEST HALAMAN ==']
            .concat(log.length ? log : ['(tidak ada yang terekam)'])
            .concat(['', logRak()]).join('\n');

        const bd = document.createElement('div');
        bd.style.cssText = 'position:fixed;inset:0;z-index:99995;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;';
        bd.innerHTML = '<div style="background:#fff;width:94%;max-width:640px;border-radius:8px;padding:12px;display:flex;flex-direction:column;max-height:88vh;">' +
            '<div style="font-weight:bold;margin-bottom:6px;">Hasil rekaman (' + log.length + ' baris)</div>' +
            '<textarea id="rk_out" readonly style="flex:1;min-height:260px;font:11px monospace;"></textarea>' +
            '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">' +
            '<button id="rk_tutup" type="button" style="padding:6px 14px;">Tutup</button>' +
            '<button id="rk_salin" type="button" style="padding:6px 14px;background:#28a745;color:#fff;border:none;border-radius:4px;">Salin</button></div></div>';
        document.body.appendChild(bd);
        const ta = bd.querySelector('#rk_out');
        ta.value = teks;
        bd.querySelector('#rk_tutup').onclick = () => bd.remove();
        bd.querySelector('#rk_salin').onclick = async () => {
            try { await navigator.clipboard.writeText(teks); }
            catch (e) { ta.select(); document.execCommand('copy'); }
            bd.querySelector('#rk_salin').textContent = 'Tersalin ✓';
        };
    }

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
