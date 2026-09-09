// ==UserScript==
// @name         Rekap Stok Minus - Lihat Stok
// @namespace    http://tampermonkey.net/
// @version      2026-09-09
// @description  Scan stok minus outlet dengan tema warna merah dan tombol di sebelah kanan.
// @match        https://*.erzap.com/produk_gudangs/lihat_stok/new*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let stopRequested = false;

    // 1. Styling Tampilan Modal & Posisi Tombol Kanan
    const style = document.createElement('style');
    style.innerHTML = `
        #erzap-modal-backdrop {
            display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.5); z-index: 10000; justify-content: center; align-items: center; font-family: inherit;
        }
        #erzap-modal-box {
            background: #fff; width: 750px; max-width: 95%; border-radius: 6px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3); overflow: hidden; display: flex; flex-direction: column; max-height: 90vh;
        }
        #erzap-modal-header { background: #dc3545; color: white; padding: 12px 15px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; }
        #erzap-modal-close { background: none; border: none; color: white; font-size: 18px; cursor: pointer; }
        #erzap-modal-body { padding: 20px; overflow-y: auto; flex-grow: 1; scroll-behavior: smooth; }
        .erzap-table-outlet { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
        .erzap-table-outlet th, .erzap-table-outlet td { border: 1px solid #dee2e6; padding: 8px 12px; text-align: left; }
        .erzap-table-outlet th { background-color: #f8f9fa; font-weight: bold; }
        #erzap-modal-footer { padding: 10px 20px; background: #f1f1f1; display: flex; justify-content: space-between; align-items: center; }
        .erzap-btn { padding: 8px 15px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px; }
        .erzap-btn-secondary { background: #6c757d; color: white; }
        .erzap-btn-stop { background: #343a40; color: white; display: none; }
        .erzap-btn-scan { background: #dc3545; color: white; }
        .erzap-btn-scan:hover { background: #c82333; }
        .container-btn-stokmin { margin-bottom: 10px; display: flex; justify-content: flex-end; }
        #btn-buka-modal { background-color: #dc3545; color: white; border: none; padding: 8px 14px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        #btn-buka-modal:hover { background-color: #c82333; }
        .scan-status { font-size: 12px; color: #666; font-style: italic; }
        .text-danger-minus { color: red; font-weight: bold; }
    `;
    document.head.appendChild(style);

    // 2. Struktur HTML Modal
    const modalHTML = `
        <div id="erzap-modal-backdrop">
            <div id="erzap-modal-box">
                <div id="erzap-modal-header">
                    <span>Rekap Stok Minus Outlet (< 0)</span>
                    <button id="erzap-modal-close">&times;</button>
                </div>
                <div id="erzap-modal-body">
                    <p style="margin-top:0; font-size:13px; color:#555;">
                        Sistem sedang memproses sinkronisasi tabel per outlet...
                    </p>
                    <button class="erzap-btn erzap-btn-scan" id="btn-jalankan-scan">▶️ Mulai Scan</button>
                    <div style="margin-top: 15px;">
                        <table class="erzap-table-outlet" id="tabel-hasil-scan">
                            <thead>
                                <tr>
                                    <th style="width:30px">No</th>
                                    <th>Outlet / Cabang</th>
                                    <th>Barcode</th>
                                    <th>Nama Produk</th>
                                    <th style="width:50px;text-align:center">Stok</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr><td colspan="5" style="text-align: center; color: #888;">Klik tombol mulai di atas.</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                <div id="erzap-modal-footer">
                    <span class="scan-status" id="scan-status-text">Siap...</span>
                    <div style="display: flex; gap: 8px;">
                        <button class="erzap-btn erzap-btn-stop" id="modal-stop">🛑 Stop</button>
                        <button class="erzap-btn erzap-btn-secondary" id="modal-tutup">Tutup</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer);

    function scrollToBottom() {
        const modalBody = document.getElementById('erzap-modal-body');
        if (modalBody) modalBody.scrollTop = modalBody.scrollHeight;
    }

    // Fungsi membaca produk stok minus dari tabel Erzap
    function bacaProdukMinusDariTabel() {
        const rows = document.querySelectorAll('#data_table_produk tbody tr');
        if (!rows || rows.length === 0) return [];

        let hasilMinus = [];
        rows.forEach(row => {
            if (row.querySelector('.dataTables_empty')) return;

            const tdStok = row.querySelector('td.bt_dialog_aktifitas_stok');
            if (!tdStok) return;

            let nilaiStok = NaN;
            const dataOrder = tdStok.getAttribute('data-order');
            if (dataOrder !== null && dataOrder !== '') {
                nilaiStok = parseFloat(dataOrder);
            }
            if (isNaN(nilaiStok)) {
                const linkEl = tdStok.querySelector('a');
                if (linkEl) nilaiStok = parseFloat(linkEl.innerText.trim());
            }
            if (isNaN(nilaiStok)) {
                nilaiStok = parseFloat(tdStok.innerText.trim());
            }

            if (isNaN(nilaiStok) || nilaiStok >= 0) return;

            const tdBarcode = row.querySelector('td.barcode_produk');
            const barcode = tdBarcode ? tdBarcode.innerText.trim() : '-';

            const tdNama = row.querySelector('td.nama_produk');
            const nama = tdNama ? tdNama.innerText.trim() : '-';

            hasilMinus.push({ barcode, nama, stok: Math.floor(nilaiStok) });
        });

        return hasilMinus;
    }

    // Injeksi Tombol ke Halaman (Pojok Kanan)
    function injectButton() {
        const tabIndexProduk = document.getElementById('tab_index_produk');
        if (tabIndexProduk && !document.getElementById('btn-buka-modal')) {
            const wrapperDiv = document.createElement('div');
            wrapperDiv.className = 'container-btn-stokmin';

            const btn = document.createElement('button');
            btn.id = 'btn-buka-modal';
            btn.innerHTML = '🌐 Rekap Stok Min';

            wrapperDiv.appendChild(btn);
            tabIndexProduk.insertBefore(wrapperDiv, tabIndexProduk.firstChild);

            const backdrop = document.getElementById('erzap-modal-backdrop');
            const btnStop = document.getElementById('modal-stop');

            btn.onclick = () => backdrop.style.display = 'flex';
            document.getElementById('erzap-modal-close').onclick = () => { stopRequested = true; backdrop.style.display = 'none'; };
            document.getElementById('modal-tutup').onclick = () => { stopRequested = true; backdrop.style.display = 'none'; };
            backdrop.onclick = (e) => { if (e.target === backdrop) { stopRequested = true; backdrop.style.display = 'none'; } };
            btnStop.onclick = () => { stopRequested = true; document.getElementById('scan-status-text').innerText = "Proses dihentikan."; };

            document.getElementById('btn-jalankan-scan').onclick = async () => {
                const statusText = document.getElementById('scan-status-text');
                const tbody = document.querySelector('#tabel-hasil-scan tbody');
                const btnScan = document.getElementById('btn-jalankan-scan');

                stopRequested = false;
                btnScan.disabled = true;
                btnScan.style.opacity = '0.6';
                btnStop.style.display = 'inline-block';

                const checkboxOutlets = document.querySelectorAll('.checkbox_list_outlets');
                let outletsList = [];

                checkboxOutlets.forEach(chk => {
                    const spanName = chk.nextElementSibling;
                    if (spanName && spanName.tagName === 'SPAN') {
                        outletsList.push({ id: chk.id, nama: spanName.innerText.trim() });
                    }
                });

                if (outletsList.length === 0) {
                    statusText.innerText = "Daftar outlet tidak ditemukan!";
                    btnScan.disabled = false; btnScan.style.opacity = '1'; btnStop.style.display = 'none';
                    return;
                }

                tbody.innerHTML = '';
                let counterNo = 1;
                let adaDataDitemukan = false;

                for (let i = 0; i < outletsList.length; i++) {
                    if (stopRequested) break;

                    let outlet = outletsList[i];
                    statusText.innerText = `Memproses outlet [${i + 1}/${outletsList.length}]: ${outlet.nama}...`;

                    // 1. Uncheck semua checkbox outlet
                    checkboxOutlets.forEach(c => {
                        if (c.checked) {
                            c.checked = false;
                            c.dispatchEvent(new Event('change', { bubbles: true }));
                            c.dispatchEvent(new Event('click', { bubbles: true }));
                        }
                    });

                    // 2. Centang 1 outlet tujuan
                    let currentCheckbox = document.getElementById(outlet.id);
                    if (currentCheckbox) {
                        currentCheckbox.checked = true;
                        currentCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
                        currentCheckbox.dispatchEvent(new Event('click', { bubbles: true }));

                        if (typeof window.jQuery !== 'undefined') {
                            window.jQuery(currentCheckbox).trigger('change');
                            window.jQuery(currentCheckbox).trigger('click');
                        }
                    }

                    await new Promise(resolve => setTimeout(resolve, 500));

                    // 3. Eksekusi klik tombol pencarian
                    let clicked = false;
                    const possibleSearchBtns = document.querySelectorAll('button, a, input[type="submit"]');
                    for (let el of possibleSearchBtns) {
                        let html = el.innerHTML.toLowerCase();
                        let cls = el.className.toLowerCase();
                        let id = el.id.toLowerCase();
                        if (html.includes('fa-search') || cls.includes('search') || cls.includes('cari') || id.includes('search') || id.includes('cari')) {
                            el.click();
                            clicked = true;
                            break;
                        }
                    }

                    if (!clicked) {
                        const defaultBtn = document.querySelector('.btn-primary, button[type="submit"]');
                        if (defaultBtn) defaultBtn.click();
                    }

                    // 4. Jeda waktu tunggu respons tabel
                    await new Promise(resolve => setTimeout(resolve, 3500));

                    if (stopRequested) break;

                    // 5. Baca data tabel
                    const produkMinus = bacaProdukMinusDariTabel();

                    if (produkMinus.length > 0) {
                        adaDataDitemukan = true;

                        produkMinus.forEach((produk, idx) => {
                            let tr = document.createElement('tr');
                            const tdOutlet = idx === 0 ? `<td rowspan="${produkMinus.length}" style="vertical-align:middle;font-weight:bold">${outlet.nama}</td>` : '';
                            const tdNo = idx === 0 ? `<td rowspan="${produkMinus.length}" style="vertical-align:middle;text-align:center">${counterNo++}</td>` : '';

                            tr.innerHTML = `
                                ${tdNo}
                                ${tdOutlet}
                                <td style="font-size:11px;color:#555">${produk.barcode}</td>
                                <td>${produk.nama}</td>
                                <td style="text-align:center"><span class="text-danger-minus">${produk.stok}</span></td>
                            `;
                            tbody.appendChild(tr);
                        });

                        scrollToBottom();
                    }
                }

                if (!adaDataDitemukan && !stopRequested) {
                    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #555;">✅ Tidak ada outlet yang memiliki stok minus.</td></tr>`;
                }

                if (!stopRequested) {
                    statusText.innerText = "Scan selesai!";
                }

                btnScan.disabled = false;
                btnScan.style.opacity = '1';
                btnStop.style.display = 'none';
                scrollToBottom();
            };
        }
    }

    window.addEventListener('load', () => { setTimeout(injectButton, 500); });
    const observer = new MutationObserver(() => { injectButton(); });
    observer.observe(document.body, { childList: true, subtree: true });

})();
