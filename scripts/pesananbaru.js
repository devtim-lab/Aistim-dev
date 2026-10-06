// ==UserScript==
// @name         Erzap - Rekap Pesanan Baru per Outlet (Tema Merah)
// @namespace    http://tampermonkey.net/
// @version      1.4.0
// @description  [v1.4.0] Rekap Pesanan Baru kini membaca semua halaman daftar pesanan dan menghitung pesanan yang tombol Edit-nya aktif (Edit nonaktif = bukan pesanan baru), per outlet + daftar invoice. [v1.3.1] Sembunyikan badge debug 'Aistim: ...' di pojok kanan bawah (dari content.js ekstensi). [v1.3.0] Sekaligus menghapus tombol hijau 'Rekap Pesanan' lama bawaan ekstensi di halaman Erzap mana pun (menggantikan script bersihkan_tombol_lama.js). [v1.2.6] Fix: cegah error tak jelas kalau elemen outlet bukan <select> lagi (perubahan tampilan filter outlet ERZAP)
// @author       You
// @match        https://*.erzap.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Tombol hijau "Rekap Pesanan" lama (bawaan content.js ekstensi <= v2.9.8) memakai ID yang sama dengan
    // tombol di script ini dan tidak berfungsi. Buang yang lama saja; tombol milik script lain (ber-data-aistim) aman.
    function hapusTombolLama() {
        document.querySelectorAll('#btn-rekap-pesanan').forEach(b => {
            const teks = (b.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
            // tombol lama: tanpa penanda data-aistim dan persis berteks "Rekap Pesanan"
            if (!b.hasAttribute('data-aistim') && teks === 'rekap pesanan') b.remove();
        });
    }

    // Badge debug "Aistim: ..." di pojok kanan bawah (dibuat content.js ekstensi <= v2.9.8): sembunyikan lewat CSS
    // supaya tetap tersembunyi walau dibuat ulang belakangan.
    if (!document.getElementById('aistim_sembunyi_badge')) {
        const sb = document.createElement('style');
        sb.id = 'aistim_sembunyi_badge';
        sb.textContent = '#aistim-debug { display: none !important; }';
        (document.head || document.documentElement).appendChild(sb);
    }

    // @match mencakup semua halaman Erzap karena tombol lama bisa muncul di halaman mana pun.
    // Di luar daftar pesanan, tugas script ini hanya membersihkan tombol lama (60 detik pertama), lalu selesai.
    if (!/^\/pesanan_penjualans/.test(location.pathname)) {
        hapusTombolLama();
        const obs = new MutationObserver(hapusTombolLama);
        obs.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => obs.disconnect(), 60000);
        return;
    }

    console.log("[Aistim] Script Rekap Pesanan berhasil dimuat dan sedang berjalan...");

    // 0. CSS terpusat (prefix rp_) + responsif mobile
    function pasangStyle() {
        if (document.getElementById('rp_style')) return;
        const st = document.createElement('style');
        st.id = 'rp_style';
        st.textContent = `
            #btn-rekap-pesanan { white-space: nowrap; margin: 4px 8px 4px 0; background: #dc3545 !important; border-color: #dc3545 !important; color: #fff !important; }
            #erzap-rekap-modal-overlay { position: fixed; inset: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 9999999;
                display: flex; justify-content: center; align-items: center; padding: 12px; box-sizing: border-box; font-family: sans-serif; }
            .rp_box { background: #fff; width: 500px; max-width: 100%; max-height: 90vh; max-height: 90dvh; border-radius: 6px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2); overflow: hidden; display: flex; flex-direction: column; box-sizing: border-box; }
            .rp_box.rp_loading { width: 450px; text-align: center; padding: 30px 20px; }
            .rp_box.rp_loading h3 { margin-top: 0; color: #333; }
            #loading-status { color: #666; margin-bottom: 20px; font-size: 13px; word-break: break-word; }
            .rp_bar { width: 100%; background: #eee; height: 10px; border-radius: 5px; overflow: hidden; }
            .rp_bar div { width: 100%; height: 100%; background: #dc3545; animation: rp_progress 1s infinite linear; }
            @keyframes rp_progress { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
            .rp_head { background: #dc3545; color: #fff; padding: 12px 15px; display: flex; justify-content: space-between; align-items: center; flex: 0 0 auto; }
            .rp_head h3 { margin: 0; font-size: 16px; }
            #close-rekap-modal { background: none; border: none; color: #fff; font-size: 24px; line-height: 1; cursor: pointer; padding: 0 4px; }
            .rp_body { padding: 15px; overflow-y: auto; flex: 1 1 auto; -webkit-overflow-scrolling: touch; }
            .rp_table { width: 100%; border-collapse: collapse; font-size: 14px; }
            .rp_table th { padding: 8px; border-bottom: 2px solid #ddd; background: #f4f4f4; position: sticky; top: -15px; }
            .rp_table td { padding: 8px; border-bottom: 1px solid #ddd; word-break: break-word; }
            .rp_table .rp_jml { text-align: center; font-weight: bold; color: #dc3545; white-space: nowrap; }
            .rp_total { margin-top: 15px; padding-top: 10px; font-weight: bold; text-align: right; font-size: 16px; border-top: 2px solid #333; }
            .rp_total span { color: #dc3545; }
            .rp_foot { background: #f9f9f9; padding: 10px 15px; text-align: right; border-top: 1px solid #ddd; flex: 0 0 auto; }
            #btn-close-footer { padding: 8px 16px; background: #6c757d; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
            @media (max-width: 600px) {
                #erzap-rekap-modal-overlay { padding: 0; }
                .rp_box { width: 100vw; max-width: 100vw; height: 100vh; height: 100dvh; max-height: none; border-radius: 0; }
                .rp_box.rp_loading { width: calc(100vw - 32px); height: auto; border-radius: 6px; padding: 24px 16px; }
                .rp_head { padding: 12px; }
                .rp_body { padding: 12px; }
                .rp_table { font-size: 13px; }
                .rp_table th { top: -12px; }
                .rp_table th, .rp_table td { padding: 8px 6px; }
                .rp_total { font-size: 15px; }
                #btn-close-footer { width: 100%; padding: 12px; font-size: 15px; }
            }
        `;
        (document.head || document.documentElement).appendChild(st);
    }
    pasangStyle();

    // 1. Fitur Auto Search saat Outlet Berubah
    setInterval(() => {
        const outletSelect = document.querySelector('#pencarian_idoutlet_own');
        if (outletSelect && !outletSelect.hasAttribute('data-auto-search')) {
            outletSelect.setAttribute('data-auto-search', 'true');
            outletSelect.addEventListener('change', function() {
                const form = outletSelect.closest('form');
                if (form) {
                    form.submit();
                } else {
                    outletSelect.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        }
    }, 1000);

    // 2. Pasang tombol Rekap — multi-strategi (ID asli dulu, lalu cadangan)
    function buatTombolRekap() {
        const rekapBtn = document.createElement('button');
        rekapBtn.id = 'btn-rekap-pesanan';
        rekapBtn.setAttribute('data-aistim', 'pesananbaru'); // penanda: tombol milik script ini
        rekapBtn.type = 'button';
        rekapBtn.className = 'btn btn-danger';
        rekapBtn.innerHTML = '<i class="fa fa-bars" style="margin-right: 5px;"></i> Rekap Pesanan Baru';
        rekapBtn.addEventListener('click', mulaiRekapPesananBaru);
        return rekapBtn;
    }

    function pasangTombolRekap() {
        hapusTombolLama();
        if (document.getElementById('btn-rekap-pesanan')) return true; // Sudah ada
        pasangStyle();
        const terlihat = el => !!el && el.offsetParent !== null; // elemen display:none (mis. disembunyikan di mobile) dilewati

        // Strategi 1: jangkar ID asli tombol marketplace (paling akurat)
        let anchor = document.getElementById('btn_cari_pesanan_marketplace_online');
        if (terlihat(anchor)) {
            anchor.parentNode.insertBefore(buatTombolRekap(), anchor);
            console.log("[Aistim] Tombol Rekap dipasang via ID marketplace");
            return true;
        }

        // Strategi 2: cari tombol/link apa saja berteks "marketplace"
        anchor = Array.from(document.querySelectorAll('a, button')).find(el =>
            (el.textContent || '').toLowerCase().includes('marketplace') && terlihat(el)
        );
        if (anchor) {
            anchor.parentNode.insertBefore(buatTombolRekap(), anchor);
            console.log("[Aistim] Tombol Rekap dipasang via teks marketplace");
            return true;
        }

        // Strategi 3: taruh di form pencarian (dekat select outlet / tombol submit)
        const outletSelect = document.querySelector('#pencarian_idoutlet_own');
        if (outletSelect) {
            const form = outletSelect.closest('form');
            const submitBtn = form ? form.querySelector('button[type="submit"], input[type="submit"], .btn-primary') : null;
            const btn = buatTombolRekap();
            if (submitBtn && submitBtn.parentNode) {
                submitBtn.parentNode.insertBefore(btn, submitBtn);
            } else if (form) {
                form.appendChild(btn);
            } else {
                outletSelect.parentNode.appendChild(btn);
            }
            console.log("[Aistim] Tombol Rekap dipasang di form pencarian");
            return true;
        }

        // Strategi 4: judul halaman
        const titleArea = document.querySelector('.panel-heading, .page-title, h1, h2, h3');
        if (titleArea) {
            const btn = buatTombolRekap();
            btn.style.margin = '4px 0 4px 10px';
            titleArea.appendChild(btn);
            console.log("[Aistim] Tombol Rekap dipasang di judul halaman");
            return true;
        }

        return false;
    }

    // MutationObserver agar bereaksi instan saat halaman selesai loading
    const observer = new MutationObserver(() => { pasangTombolRekap(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Interval cadangan jika observer terlewat
    setInterval(pasangTombolRekap, 1500);
    window.addEventListener('load', () => setTimeout(pasangTombolRekap, 800));

    // 3. Fungsi Utama (v1.4.0): baca SEMUA halaman daftar pesanan, hitung baris yang tombol "Edit"-nya AKTIF
    //    (Edit aktif = pesanan baru; Edit abu-abu/nonaktif = dibatalkan/sudah diproses), dikelompokkan per outlet.
    function editAktif(tr) {
        const sel = Array.from(tr.querySelectorAll('a, button, input[type=button], input[type=submit], span')).filter(
            (x) => (x.textContent || x.value || '').replace(/\s+/g, ' ').trim().toLowerCase() === 'edit');
        if (!sel.length) return null;                       // baris tanpa tombol Edit sama sekali
        return sel.some((x) => {
            if (x.tagName !== 'A') return false;            // <button disabled>/<span> = nonaktif
            const href = (x.getAttribute('href') || '').trim();
            if (!href || href === '#' || /^javascript/i.test(href)) return false;
            if (x.disabled || x.hasAttribute('disabled') || x.getAttribute('aria-disabled') === 'true' || /(^|\s)disabled(\s|$)/i.test(x.className || '')) return false;
            if (x.closest('[disabled], .disabled')) return false;
            return true;
        });
    }

    function bacaHalamanPesanan(doc, hasil) {
        doc.querySelectorAll('table').forEach((tabel) => {
            const hr = (tabel.tHead && tabel.tHead.rows[0]) || null;
            const nama = hr ? Array.from(hr.children).map((t) => (t.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()) : [];
            const iOutlet = nama.findIndex((n) => /outlet/.test(n));
            if (iOutlet >= 0) hasil.adaKolomOutlet = true;
            tabel.querySelectorAll('tbody tr').forEach((tr) => {
                const aktif = editAktif(tr);
                if (aktif === null) return;
                hasil.totalBaris++;
                if (!aktif) { hasil.nonaktif++; return; }
                const tds = Array.from(tr.children);
                const teks = (tr.textContent || '').replace(/\s+/g, ' ');
                const inv = /Invoice\s*:\s*([A-Za-z0-9-]+)/i.exec(teks);
                const kode = /\b(SP[0-9]{3,6}-[0-9]+)\b/.exec(teks);
                const outlet = iOutlet >= 0 && tds[iOutlet] ? (tds[iOutlet].textContent || '').replace(/\s+/g, ' ').trim() : '';
                hasil.items.push({ invoice: inv ? inv[1] : '', kode: kode ? kode[1] : '', outlet: outlet || '(outlet tidak terbaca)' });
            });
        });
    }

    async function mulaiRekapPesananBaru() {
        const outletSelect = document.querySelector('#pencarian_idoutlet_own');
        const searchForm = outletSelect ? outletSelect.closest('form') : null;
        const formMethod = searchForm ? (searchForm.method || 'GET').toUpperCase() : 'GET';
        const formAction = searchForm ? searchForm.action : window.location.href;

        const hasil = { items: [], totalBaris: 0, nonaktif: 0, adaKolomOutlet: false };
        tampilkanModalLoadingUI();

        try {
            // semua outlet, tanpa filter status: yang menentukan "baru" adalah tombol Edit yang aktif
            let currentUrl = formAction, params = { method: 'GET' };
            if (searchForm) {
                const fd = new FormData(searchForm);
                fd.set('pencarian[idoutlet_own]', '');
                document.querySelectorAll('select').forEach((sel) => {
                    if (sel !== outletSelect && Array.from(sel.options).some((o) => o.text.toLowerCase().trim() === 'pesanan baru')) fd.set(sel.name, '');
                });
                if (formMethod === 'GET') currentUrl = formAction + (formAction.includes('?') ? '&' : '?') + new URLSearchParams(fd).toString();
                else params = { method: formMethod, body: fd };
            } else {
                currentUrl = location.href;
            }

            const sudah = new Set();
            for (let hal = 1; hal <= 200 && currentUrl && !sudah.has(currentUrl); hal++) {
                sudah.add(currentUrl);
                updateLoadingStatus('Membaca halaman ' + hal + '... (' + hasil.items.length + ' pesanan baru ditemukan)');
                const res = await fetch(currentUrl, params);
                const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
                bacaHalamanPesanan(doc, hasil);
                currentUrl = cariLinkNext(doc);
                params = { method: 'GET' };
            }
        } catch (error) {
            console.error('Gagal membaca daftar pesanan', error);
            hasil.error = (error && error.message) || String(error);
        }

        const per = new Map();
        hasil.items.forEach((it) => per.set(it.outlet, (per.get(it.outlet) || 0) + 1));
        const rekapData = Array.from(per.entries()).map(([nama, jumlah]) => ({ nama, jumlah }));
        tampilkanHasilModalUI(rekapData, hasil.items.length, hasil);
    }

    // ==========================================
    // FUNGSI LOGIKA PAGINATION
    // ==========================================

    function ekstrakTotalDariTeks(doc) {
        const textBody = doc.body.textContent || "";
        const regexDari = /dari\s+([\d.,]+)\s+data/i;
        const matchDari = textBody.match(regexDari);
        if (matchDari) return { total: parseInt(matchDari[1].replace(/[.,]/g, ''), 10), exact: true };

        const regexMenampilkan = /Menampilkan\s+([\d.,]+)\s+data/i;
        const matchMenampilkan = textBody.match(regexMenampilkan);
        if (matchMenampilkan) return { total: parseInt(matchMenampilkan[1].replace(/[.,]/g, ''), 10), exact: true };

        let countBaris = 0;
        doc.querySelectorAll('table tbody tr').forEach(row => {
            if (row.querySelectorAll('td').length > 3) countBaris++;
        });

        return { total: countBaris, exact: false };
    }

    function cariLinkNext(doc) {
        let path = null;
        let relNext = doc.querySelector('a[rel="next"]');
        if (relNext) path = relNext.getAttribute('href');

        if (!path) {
            let links = doc.querySelectorAll('.pagination a, div[class*="pagin"] a, .pager a');
            for (let a of links) {
                let text = a.textContent.toLowerCase().trim();
                if (text === '>' || text === '&gt;' || text === 'next' || text === 'selanjutnya') {
                    path = a.getAttribute('href');
                    break;
                }
            }
        }

        if (path && path !== '#' && !path.includes('javascript:')) {
            if (path.startsWith('http')) return path;
            if (path.startsWith('/')) return window.location.origin + path;
            return window.location.origin + '/' + path;
        }
        return null;
    }

    // ==========================================
    // UI MODAL TAMPILAN
    // ==========================================

    function tampilkanModalLoadingUI() {
        hapusModalUI();
        const modalOverlay = buatOverlayUI();

        modalOverlay.innerHTML = `
            <div class="rp_box rp_loading">
                <h3>Memproses Rekap Data...</h3>
                <p id="loading-status">Mempersiapkan pengaturan pencarian...</p>
                <div class="rp_bar"><div></div></div>
            </div>
        `;
        document.body.appendChild(modalOverlay);
    }

    function updateLoadingStatus(text) {
        const statusEl = document.getElementById('loading-status');
        if (statusEl) statusEl.innerText = text;
    }

    function tampilkanHasilModalUI(rekapData, totalSemua, hasil) {
        hapusModalUI();
        const modalOverlay = buatOverlayUI();

        rekapData.sort((a, b) => b.jumlah - a.jumlah);

        let tableContent = '';
        rekapData.forEach(data => {
            tableContent += `<tr><td>${data.nama}</td><td class="rp_jml">${data.jumlah}</td></tr>`;
        });

        if (rekapData.length === 0) {
            tableContent = `<tr><td colspan="2" style="text-align: center; padding: 15px;">Tidak ada <b>Pesanan Baru</b> (tombol Edit aktif) di semua outlet.</td></tr>`;
        }

        modalOverlay.innerHTML = `
            <div class="rp_box">
                <div class="rp_head">
                    <h3>Rekap Pesanan Baru (Edit aktif)</h3>
                    <button id="close-rekap-modal" type="button" aria-label="Tutup">&times;</button>
                </div>
                <div class="rp_body">
                    <table class="rp_table">
                        <thead>
                            <tr>
                                <th style="text-align:left">Nama Outlet</th>
                                <th style="text-align:center">Jumlah Pesanan</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableContent}
                        </tbody>
                    </table>
                    <div class="rp_total">Total Pesanan Baru Keseluruhan: <span>${totalSemua}</span></div>
                    ${infoHasil(hasil)}
                </div>
                <div class="rp_foot">
                    <button id="btn-close-footer" type="button">Tutup</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalOverlay);
        document.getElementById('close-rekap-modal').onclick = () => hapusModalUI();
        document.getElementById('btn-close-footer').onclick = () => hapusModalUI();
        modalOverlay.onclick = (e) => { if (e.target === modalOverlay) hapusModalUI(); };
    }

    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
    function infoHasil(h) {
        if (!h) return '';
        let out = '<div style="margin-top:8px;font-size:12px;color:#888;">Dibaca ' + h.totalBaris + ' pesanan: ' + h.items.length + ' Edit aktif, ' + h.nonaktif + ' Edit nonaktif.' +
            (h.adaKolomOutlet ? '' : ' Kolom "Outlet" tidak ditemukan di tabel, jadi outlet tidak terbaca.') +
            (h.error ? ' <span style="color:#b91c1c">Berhenti karena error: ' + esc(h.error) + '</span>' : '') + '</div>';
        if (h.items.length) {
            out += '<details style="margin-top:10px"><summary style="cursor:pointer;font-weight:bold">Daftar invoice (' + h.items.length + ')</summary><div style="font-size:13px;margin-top:6px;">' +
                h.items.map((it) => '<div style="padding:4px 0;border-bottom:1px solid #eee;word-break:break-all">' + esc(it.invoice || '-') + (it.kode ? ' · ' + esc(it.kode) : '') + ' · ' + esc(it.outlet) + '</div>').join('') + '</div></details>';
        }
        return out;
    }

    function buatOverlayUI() {
        const overlay = document.createElement('div');
        overlay.id = 'erzap-rekap-modal-overlay';
        pasangStyle();
        return overlay;
    }

    function hapusModalUI() {
        const existing = document.querySelector('#erzap-rekap-modal-overlay');
        if (existing) existing.remove();
    }
})();
