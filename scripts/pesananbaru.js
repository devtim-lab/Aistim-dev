// ==UserScript==
// @name         Erzap - Rekap Pesanan Baru per Outlet (Tema Merah)
// @namespace    http://tampermonkey.net/
// @version      1.2.6
// @description  [v1.2.6] Fix: cegah error tak jelas kalau elemen outlet bukan <select> lagi (perubahan tampilan filter outlet ERZAP)
// @author       You
// @match        https://*.erzap.com/pesanan_penjualans*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
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
        rekapBtn.type = 'button';
        rekapBtn.className = 'btn btn-danger';
        rekapBtn.innerHTML = '<i class="fa fa-bars" style="margin-right: 5px;"></i> Rekap Pesanan Baru';
        rekapBtn.addEventListener('click', mulaiRekapPesananBaru);
        return rekapBtn;
    }

    function pasangTombolRekap() {
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

    // 3. Fungsi Utama: Pilih Outlet -> Set Status -> Cari -> Baca Pagination -> Simpan
    async function mulaiRekapPesananBaru() {
        const outletSelect = document.querySelector('#pencarian_idoutlet_own');
        // ERZAP sempat mengganti #pencarian_idoutlet_own dari <select> ke widget lain (popup "Daftar Data Outlet"),
        // sehingga .options bisa undefined -> Array.from melempar error tanpa pesan yang jelas. Cek dulu supaya tidak macet diam-diam.
        if (!outletSelect || outletSelect.tagName !== 'SELECT' || !outletSelect.options) {
            alert("Pilihan Outlet (select) tidak ditemukan di halaman ini! (ERZAP mungkin mengganti tampilan filter outlet, rekap per-outlet perlu disesuaikan lagi)");
            return;
        }

        let statusParamName = '';
        let statusBaruValue = '';
        document.querySelectorAll('select').forEach(sel => {
            Array.from(sel.options).forEach(opt => {
                if(opt.text.toLowerCase().trim() === 'pesanan baru') {
                    statusParamName = sel.name;
                    statusBaruValue = opt.value;
                }
            });
        });

        const options = Array.from(outletSelect.options).filter(opt => opt.value !== "");
        const rekapData = [];
        let totalSemua = 0;

        const searchForm = outletSelect.closest('form');
        const formMethod = searchForm ? (searchForm.method || 'GET').toUpperCase() : 'GET';
        const formAction = searchForm ? searchForm.action : window.location.href;

        tampilkanModalLoadingUI();

        for (let i = 0; i < options.length; i++) {
            const opt = options[i];
            updateLoadingStatus(`Proses [${i+1}/${options.length}]: Memeriksa Outlet ${opt.text}...`);

            try {
                const formData = new FormData(searchForm);
                formData.set('pencarian[idoutlet_own]', opt.value);
                if (statusParamName && statusBaruValue) {
                    formData.set(statusParamName, statusBaruValue);
                }

                let fetchUrl = formAction;
                let fetchParams = { method: formMethod };

                if (formMethod === 'GET') {
                    const searchParams = new URLSearchParams(formData);
                    fetchUrl = `${formAction}?${searchParams.toString()}`;
                } else {
                    fetchParams.body = formData;
                }

                let currentUrl = fetchUrl;
                let currentFetchParams = fetchParams;
                let outletTotal = 0;
                let hasNextPage = true;
                let isFirstPage = true;

                while (hasNextPage && currentUrl) {
                    const response = await fetch(currentUrl, currentFetchParams);
                    const htmlText = await response.text();
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(htmlText, 'text/html');

                    if (isFirstPage) {
                        const hasilParse = ekstrakTotalDariTeks(doc);
                        if (hasilParse.exact) {
                            outletTotal = hasilParse.total;
                            break;
                        } else {
                            outletTotal += hasilParse.total;
                        }
                    } else {
                        let countHalaman = 0;
                        doc.querySelectorAll('table tbody tr').forEach(row => {
                            if (row.querySelectorAll('td').length > 3) countHalaman++;
                        });
                        outletTotal += countHalaman;
                    }

                    let nextLink = cariLinkNext(doc);
                    if (nextLink) {
                        currentUrl = nextLink;
                        currentFetchParams = { method: 'GET' };
                        isFirstPage = false;
                        updateLoadingStatus(`Proses [${i+1}/${options.length}]: Menghitung halaman selanjutnya untuk ${opt.text}...`);
                    } else {
                        hasNextPage = false;
                    }
                }

                if (outletTotal > 0) {
                    rekapData.push({ nama: opt.text, jumlah: outletTotal });
                    totalSemua += outletTotal;
                }
            } catch (error) {
                console.error("Gagal memproses data untuk: " + opt.text, error);
            }
        }

        tampilkanHasilModalUI(rekapData, totalSemua);
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

    function tampilkanHasilModalUI(rekapData, totalSemua) {
        hapusModalUI();
        const modalOverlay = buatOverlayUI();

        rekapData.sort((a, b) => b.jumlah - a.jumlah);

        let tableContent = '';
        rekapData.forEach(data => {
            tableContent += `<tr><td>${data.nama}</td><td class="rp_jml">${data.jumlah}</td></tr>`;
        });

        if (rekapData.length === 0) {
            tableContent = `<tr><td colspan="2" style="text-align: center; padding: 15px;">Tidak ada <b>Pesanan Baru</b> di semua outlet.</td></tr>`;
        }

        modalOverlay.innerHTML = `
            <div class="rp_box">
                <div class="rp_head">
                    <h3>Rekap (Filter: Pesanan Baru)</h3>
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
