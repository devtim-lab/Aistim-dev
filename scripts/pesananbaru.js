// ==UserScript==
// @name         Erzap - Rekap Pesanan Baru per Outlet (Tema Merah)
// @namespace    http://tampermonkey.net/
// @version      1.2.3
// @updateURL    https://raw.githubusercontent.com/devtim-lab/AistimScript/main/pesananbaru.js
// @downloadURL  https://raw.githubusercontent.com/devtim-lab/AistimScript/main/pesananbaru.js
// @description  [v1.2.3] Otomatis set status Pesanan Baru, rekap otomatis antar halaman, urutkan dari yang tertinggi (Tema Merah).
// @author       You
// @match        https://*.erzap.com/pesanan_penjualans*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 1. Fitur Auto Search saat Outlet Berubah (Manual di layar)
    const interval = setInterval(() => {
        const outletSelect = document.querySelector('#pencarian_idoutlet_own');
        if (outletSelect) {
            clearInterval(interval);
            outletSelect.addEventListener('change', function() {
                const form = outletSelect.closest('form');
                if (form) {
                    form.submit();
                } else {
                    outletSelect.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        }
    }, 500);

    // 2. Tambah Tombol "Rekap Pesanan" (multi-strategi, tidak tergantung 1 teks jangkar)
    function buatTombolRekap() {
        const rekapBtn = document.createElement('button');
        rekapBtn.id = 'btn-rekap-pesanan';
        rekapBtn.type = 'button';
        rekapBtn.className = 'btn btn-danger btn-sm';
        rekapBtn.style.marginRight = '8px';
        rekapBtn.innerHTML = '<i class="fa fa-list"></i> Rekap Pesanan';
        rekapBtn.addEventListener('click', mulaiRekapPesananBaru);
        return rekapBtn;
    }

    function cobaInjectTombol() {
        if (document.querySelector('#btn-rekap-pesanan')) return true; // sudah ada

        // Strategi 1: jangkar tombol/link berteks "marketplace" (variasi teks apapun)
        let anchor = Array.from(document.querySelectorAll('a, button')).find(el =>
            (el.textContent || '').toLowerCase().includes('marketplace')
        );
        if (anchor) {
            const btn = buatTombolRekap();
            btn.className = anchor.className || 'btn btn-danger btn-sm';
            btn.style.backgroundColor = '#dc3545';
            btn.style.borderColor = '#dc3545';
            btn.style.color = '#fff';
            anchor.parentNode.insertBefore(btn, anchor);
            console.log('[Aistim] Rekap Pesanan: tombol disisipkan di samping tombol marketplace');
            return true;
        }

        // Strategi 2: taruh di dekat select outlet (form pencarian)
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
            console.log('[Aistim] Rekap Pesanan: tombol disisipkan di form pencarian');
            return true;
        }

        // Strategi 3: panel heading / judul halaman
        const titleArea = document.querySelector('.panel-heading, .page-title, h1, h2, h3');
        if (titleArea) {
            const btn = buatTombolRekap();
            btn.style.marginLeft = '10px';
            titleArea.appendChild(btn);
            console.log('[Aistim] Rekap Pesanan: tombol disisipkan di judul halaman');
            return true;
        }

        return false;
    }

    const btnInterval = setInterval(() => {
        if (cobaInjectTombol()) clearInterval(btnInterval);
    }, 500);
    // MutationObserver cadangan untuk halaman yang render lambat / SPA-ish
    new MutationObserver(() => cobaInjectTombol()).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('load', () => setTimeout(cobaInjectTombol, 800));

    // 3. Fungsi Utama: Pilih Outlet -> Set Status -> Cari -> Baca Pagination -> Simpan
    async function mulaiRekapPesananBaru() {
        const outletSelect = document.querySelector('#pencarian_idoutlet_own');
        if (!outletSelect) return;

        // Mencari parameter form untuk "Status Pesanan = Pesanan Baru"
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

        // Proses setiap outlet
        for (let i = 0; i < options.length; i++) {
            const opt = options[i];
            updateLoadingStatus(`Proses [${i+1}/${options.length}]: Memeriksa Outlet ${opt.text}...`);

            try {
                const formData = new FormData(searchForm);
                formData.set('pencarian[idoutlet_own]', opt.value); // Set Outlet
                if (statusParamName && statusBaruValue) {
                    formData.set(statusParamName, statusBaruValue); // Set Pesanan Baru
                }

                let fetchUrl = formAction;
                let fetchParams = { method: formMethod };

                if (formMethod === 'GET') {
                    const searchParams = new URLSearchParams(formData);
                    fetchUrl = `${formAction}?${searchParams.toString()}`;
                } else {
                    fetchParams.body = formData;
                }

                // Setup untuk Pagination
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
                            // Jika berhasil baca dari teks (Misal: "dari 45 data"), hentikan pencarian halaman
                            outletTotal = hasilParse.total;
                            break;
                        } else {
                            // Jika gagal baca teks, mulai hitung manual dari tabel halaman 1
                            outletTotal += hasilParse.total;
                        }
                    } else {
                        // Jika ada halaman ke-2, ke-3 dst, hitung baris secara manual
                        let countHalaman = 0;
                        doc.querySelectorAll('table tbody tr').forEach(row => {
                            if (row.querySelectorAll('td').length > 3) countHalaman++;
                        });
                        outletTotal += countHalaman;
                    }

                    // Cari tombol halaman berikutnya (Hanya terjadi jika ekstrakTotalDariTeks Gagal)
                    let nextLink = cariLinkNext(doc);
                    if (nextLink) {
                        currentUrl = nextLink;
                        currentFetchParams = { method: 'GET' }; // Permintaan halaman selanjutnya biasanya via GET URL
                        isFirstPage = false;
                        updateLoadingStatus(`Proses [${i+1}/${options.length}]: Menghitung halaman selanjutnya untuk ${opt.text}...`);
                    } else {
                        hasNextPage = false; // Tidak ada halaman lagi
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

        // Pola 1: "Menampilkan 1 sampai 10 dari 45 data" atau "Menampilkan 1 - 10 dari 45 data"
        const regexDari = /dari\s+([\d.,]+)\s+data/i;
        const matchDari = textBody.match(regexDari);
        if (matchDari) {
            return { total: parseInt(matchDari[1].replace(/[.,]/g, ''), 10), exact: true };
        }

        // Pola 2: "Menampilkan 15 data"
        const regexMenampilkan = /Menampilkan\s+([\d.,]+)\s+data/i;
        const matchMenampilkan = textBody.match(regexMenampilkan);
        if (matchMenampilkan) {
            return { total: parseInt(matchMenampilkan[1].replace(/[.,]/g, ''), 10), exact: true };
        }

        // Fallback: Jika teks tidak terdeteksi, hitung manual baris yang ada di tabel
        let countBaris = 0;
        doc.querySelectorAll('table tbody tr').forEach(row => {
            if (row.querySelectorAll('td').length > 3) countBaris++;
        });

        return { total: countBaris, exact: false };
    }

    function cariLinkNext(doc) {
        let path = null;

        // 1. Coba deteksi berdasarkan standar atribut rel="next"
        let relNext = doc.querySelector('a[rel="next"]');
        if (relNext) path = relNext.getAttribute('href');

        // 2. Coba deteksi teks ikon panah (>) atau kata Next / Selanjutnya di area navigasi pagination
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
            // Gabungkan URL menjadi absolute url jika link yang didapat relatif
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
            <div style="background: #fff; width: 450px; border-radius: 6px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); font-family: sans-serif; text-align: center; padding: 30px;">
                <h3 style="margin-top: 0; color: #333;">Memproses Rekap Data...</h3>
                <p id="loading-status" style="color: #666; margin-bottom: 20px; font-size: 13px;">Mempersiapkan pengaturan pencarian...</p>
                <div style="width: 100%; background: #eee; height: 10px; border-radius: 5px; overflow: hidden;">
                    <!-- Loading Bar Merah -->
                    <div style="width: 100%; height: 100%; background: #dc3545; animation: progress 1s infinite linear;"></div>
                </div>
            </div>
            <style>@keyframes progress { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }</style>
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

        // MENGURUTKAN DATA DARI JUMLAH TERTINGGI KE TERENDAH
        rekapData.sort((a, b) => b.jumlah - a.jumlah);

        let tableContent = '';
        rekapData.forEach(data => {
            // Angka menggunakan warna merah #dc3545
            tableContent += `<tr><td style="padding: 8px; border-bottom: 1px solid #ddd;">${data.nama}</td><td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center; font-weight: bold; color: #dc3545;">${data.jumlah}</td></tr>`;
        });

        if (rekapData.length === 0) {
            tableContent = `<tr><td colspan="2" style="text-align: center; padding: 15px;">Tidak ada <b>Pesanan Baru</b> di semua outlet.</td></tr>`;
        }

        modalOverlay.innerHTML = `
            <div style="background: #fff; width: 500px; border-radius: 6px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); overflow: hidden; font-family: sans-serif;">
                <!-- Header Modal Merah -->
                <div style="background: #dc3545; color: #fff; padding: 12px 15px; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; font-size: 16px;">Rekap (Filter: Pesanan Baru)</h3>
                    <button id="close-rekap-modal" style="background: none; border: none; color: #fff; font-size: 20px; cursor: pointer;">&times;</button>
                </div>
                <div style="padding: 15px; max-height: 350px; overflow-y: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f4f4f4;">
                                <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Nama Outlet</th>
                                <th style="padding: 8px; text-align: center; border-bottom: 2px solid #ddd;">Jumlah Pesanan</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableContent}
                        </tbody>
                    </table>
                    <div style="margin-top: 15px; padding-top: 10px; font-weight: bold; text-align: right; font-size: 16px; border-top: 2px solid #333;">
                        Total Pesanan Baru Keseluruhan: <span style="color: #dc3545;">${totalSemua}</span>
                    </div>
                </div>
                <div style="background: #f9f9f9; padding: 10px 15px; text-align: right; border-top: 1px solid #ddd;">
                    <button id="btn-close-footer" style="padding: 6px 14px; background: #6c757d; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Tutup</button>
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
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6); z-index: 9999; display: flex;
            justify-content: center; align-items: center;
        `;
        return overlay;
    }

    function hapusModalUI() {
        const existing = document.querySelector('#erzap-rekap-modal-overlay');
        if (existing) existing.remove();
    }
})();
