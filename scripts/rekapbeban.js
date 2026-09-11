// ==UserScript==
// @name         Rekap Beban
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @updateURL    https://raw.githubusercontent.com/devtim-lab/AistimScript/main/rekapbeban.js
// @downloadURL  https://raw.githubusercontent.com/devtim-lab/AistimScript/main/rekapbeban.js
// @description  [v1.1.0] Tombol rekap beban kompak, sticky header, centang pindah ke bawah, HD zoom, pop-up jurnal, dan tombol tutup (Mobile Responsive Update)
// @author       You
// @match        https://trial.erzap.com/jurnals/index_transaksi_beban/new*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function parseToInputDate(ddmmyyyy) {
        if (!ddmmyyyy) return '';
        const parts = ddmmyyyy.trim().split('-');
        if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
        return '';
    }

    function parseToErzapDate(yyyymmdd) {
        if (!yyyymmdd) return '';
        const parts = yyyymmdd.split('-');
        if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
        return '';
    }

    function triggerMainSearch() {
        const searchBtn = document.getElementById('bt_filter_pencarian_beban') || document.querySelector('input[type="submit"][name="commit"]');
        if (searchBtn) {
            searchBtn.click();
        } else {
            const form = document.querySelector('form.simple_form');
            if (form) form.submit();
        }
    }

    // CSS Styling Modal, HD Zoom Viewer, Checkbox, Popup Jurnal Frame, Shadow Merah Theme & Compact Button (Mobile Responsive Optimized)
    const style = document.createElement('style');
    style.innerHTML = `
        .tm-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0,0,0,0.65);
            z-index: 9999;
            display: none;
            justify-content: center;
            align-items: center;
            padding: 10px;
            box-sizing: border-box;
        }
        .tm-modal-content {
            background: #fff;
            width: 850px;
            max-width: 100%;
            max-height: 92vh;
            border-radius: 8px;
            box-shadow: 0 10px 30px rgba(139, 0, 0, 0.35);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            border: 1px solid #d32f2f;
        }
        .tm-modal-header {
            padding: 12px 15px;
            background: linear-gradient(135deg, #b71c1c, #880e4f);
            color: white;
            display: block;
            box-shadow: 0 4px 10px rgba(0,0,0,0.2);
        }
        .tm-header-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .tm-modal-header h4 {
            margin: 0;
            font-size: 16px;
            font-weight: bold;
            color: white;
            text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .tm-close-btn {
            background: none;
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            line-height: 1;
            transition: 0.2s;
        }
        .tm-close-btn:hover {
            color: #ffcdd2;
        }
        .tm-filter-area {
            margin-top: 10px;
            padding: 8px;
            background: rgba(0,0,0,0.15);
            border-radius: 6px;
            display: flex;
            gap: 8px;
            align-items: flex-end;
            flex-wrap: wrap;
            border: 1px solid rgba(255,255,255,0.2);
        }
        .tm-filter-group {
            display: flex;
            flex-direction: column;
            flex-grow: 1;
            min-width: 130px;
        }
        .tm-filter-group label {
            margin-bottom: 3px;
            font-size: 11px;
            font-weight: normal;
            color: #fff;
        }
        .tm-filter-group input, .tm-filter-group select {
            padding: 6px;
            border-radius: 4px;
            border: 1px solid #ccc;
            color: #333;
            font-size: 13px;
            background: #fff;
            width: 100%;
            box-sizing: border-box;
        }
        .tm-btn-cari {
            padding: 6px 15px;
            background: #d32f2f;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            height: 32px;
            transition: 0.2s;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            width: 100%;
        }
        .tm-btn-cari:hover {
            background: #b71c1c;
        }
        .tm-btn-cari:disabled {
            background: #6c757d;
            cursor: not-allowed;
        }
        .tm-modal-body {
            padding: 12px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            max-height: calc(92vh - 140px);
        }
        /* Responsive Table Wrapper */
        .tm-table-responsive {
            width: 100%;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
        }
        /* Sticky Table Header agar th tidak ikut ter-scroll */
        .tm-modal-body table {
            border-collapse: separate;
            border-spacing: 0;
            width: 100%;
            margin-bottom: 0;
            white-space: nowrap;
        }
        .tm-modal-body th {
            position: sticky;
            top: 0;
            background-color: #f8f9fa;
            z-index: 2;
            border-bottom: 2px solid #dee2e6;
            box-shadow: inset 0 -1px 0 #dee2e6;
        }
        #tmPaginationContainer {
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid #ddd;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 13px;
            flex-wrap: wrap;
            gap: 10px;
        }
        #tmPaginationContainer .paginate_lite_wrap {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
            flex-wrap: wrap;
            gap: 5px;
        }
        #tmPaginationContainer .pagination_links {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        #tmPaginationContainer a.pagination_link, #tmPaginationContainer .paginate_button {
            color: #b71c1c;
            text-decoration: none;
            padding: 5px 12px;
            border: 1px solid #b71c1c;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
            transition: 0.2s;
        }
        #tmPaginationContainer a.pagination_link:hover, #tmPaginationContainer .paginate_button:hover {
            background: #b71c1c;
            color: white;
        }
        #tmPaginationContainer .disabled {
            color: #6c757d;
            cursor: not-allowed;
            padding: 5px 12px;
            border: 1px solid #ccc;
            border-radius: 4px;
            background: #f8f9fa;
        }
        .tm-note {
            font-size: 11px;
            color: #888;
            margin-top: 8px;
            text-align: right;
            font-style: italic;
        }
        /* HD Zoomable File Viewer Styles */
        .tm-file-viewer {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0,0,0,0.92);
            z-index: 10000;
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
        .tm-file-viewer-toolbar {
            position: absolute;
            top: 10px;
            right: 10px;
            left: 10px;
            display: flex;
            gap: 6px;
            align-items: center;
            justify-content: flex-end;
            z-index: 10001;
            flex-wrap: wrap;
        }
        .tm-file-info-badge {
            background: rgba(183, 28, 28, 0.9);
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: bold;
            border: 1px solid rgba(255,255,255,0.3);
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            margin-right: auto;
        }
        .tm-check-badge {
            background: rgba(40, 167, 69, 0.9);
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            display: flex;
            align-items: center;
            gap: 5px;
            cursor: pointer;
            border: 1px solid rgba(255,255,255,0.3);
            user-select: none;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        }
        .tm-check-badge input {
            width: 15px;
            height: 15px;
            cursor: pointer;
        }
        .tm-jurnal-btn {
            background: #d32f2f;
            border: 1px solid white;
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            font-size: 12px;
            text-decoration: none;
            transition: 0.2s;
            display: inline-flex;
            align-items: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        }
        .tm-jurnal-btn:hover {
            background: #b71c1c;
            color: white;
            text-decoration: none;
        }
        .tm-zoom-btn {
            background: rgba(255,255,255,0.2);
            border: 1px solid white;
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            font-size: 12px;
            transition: 0.2s;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        }
        .tm-zoom-btn:hover {
            background: rgba(255,255,255,0.4);
        }
        .tm-view-close-btn {
            background: #495057;
            border: 1px solid white;
            color: white;
            padding: 5px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            font-size: 12px;
            transition: 0.2s;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        }
        .tm-view-close-btn:hover {
            background: #343a40;
        }
        .tm-file-container {
            width: 95%;
            height: 75vh;
            margin-top: 50px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: auto;
            position: relative;
            border-radius: 4px;
        }
        .tm-file-container img {
            max-width: 100%;
            transition: transform 0.15s ease-out;
            cursor: grab;
            user-select: none;
            image-rendering: -webkit-optimize-contrast;
            image-rendering: crisp-edges;
        }
        .tm-file-container img:active {
            cursor: grabbing;
        }
        .tm-file-container iframe {
            width: 100%;
            height: 100%;
            background: #fff;
            border: none;
            border-radius: 4px;
        }
        /* Popup Frame Jurnal Tema Merah */
        .tm-jurnal-popup {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0,0,0,0.7);
            z-index: 10005;
            display: none;
            justify-content: center;
            align-items: center;
            padding: 10px;
            box-sizing: border-box;
        }
        .tm-jurnal-popup-content {
            background: #fff;
            width: 850px;
            max-width: 100%;
            height: 85vh;
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(139, 0, 0, 0.4);
            border: 1px solid #b71c1c;
        }
        .tm-jurnal-popup-header {
            padding: 10px 15px;
            background: linear-gradient(135deg, #b71c1c, #880e4f);
            color: white;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .tm-jurnal-popup-header h4 {
            margin: 0;
            font-size: 15px;
            font-weight: bold;
            color: white;
            text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .tm-jurnal-popup-body {
            flex-grow: 1;
            width: 100%;
            background: #fff;
            border: none;
        }
        .tm-checkbox-cek {
            width: 18px;
            height: 18px;
            cursor: pointer;
        }
        tr.checked-row {
            background-color: #ffebee !important;
            color: #555;
        }

        /* Media Query Khusus Mobile Layar Kecil */
        @media(max-width: 576px) {
            .tm-filter-group {
                min-width: 100%;
            }
            .tm-file-viewer-toolbar {
                top: 5px;
                right: 5px;
                left: 5px;
                justify-content: center;
            }
            .tm-file-info-badge {
                width: 100%;
                text-align: center;
                margin-right: 0;
            }
            .tm-file-container {
                margin-top: 90px;
                height: 70vh;
            }
        }
    `;
    document.head.appendChild(style);

    const modalHTML = `
        <div class="tm-modal-overlay" id="modalRekapBeban">
            <div class="tm-modal-content">
                <div class="tm-modal-header">
                    <div class="tm-header-top">
                        <h4>Rekap Beban & Filter</h4>
                        <button class="tm-close-btn" id="closeModalRekap">&times;</button>
                    </div>
                    <div class="tm-filter-area">
                        <div class="tm-filter-group" style="flex-grow: 0; min-width: 130px;">
                            <label>Periode Awal</label>
                            <input type="date" id="tmDateStart">
                        </div>
                        <div class="tm-filter-group" style="flex-grow: 0; min-width: 130px;">
                            <label>Periode Akhir</label>
                            <input type="date" id="tmDateEnd">
                        </div>
                        <div class="tm-filter-group">
                            <label>Outlet</label>
                            <select id="tmSelectOutlet"></select>
                        </div>
                        <div class="tm-filter-group" style="flex-grow: 0; min-width: 100px;">
                            <button class="tm-btn-cari" id="tmBtnCari">Terapkan Cari</button>
                        </div>
                    </div>
                </div>
                <div class="tm-modal-body">
                    <div class="tm-table-responsive">
                        <table class="table table-bordered table-striped">
                            <thead>
                                <tr>
                                    <th>Jenis Pembayaran</th>
                                    <th style="text-align:center;">Tanggal</th>
                                    <th style="text-align:right;">Total</th>
                                    <th style="text-align:center; width: 90px;">Sudah Dicek</th>
                                </tr>
                            </thead>
                            <tbody id="tmRekapBody"></tbody>
                            <tfoot>
                                <tr>
                                    <th colspan="2"><strong>Grand Total (Halaman Ini)</strong></th>
                                    <th id="tmRekapGrandTotal" colspan="2" style="text-align:right;"><strong>Rp 0.00</strong></th>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    <div class="tm-note">*Grand Total merekap data pada halaman aktif. Header tabel terkunci.</div>
                    <div id="tmPaginationContainer"></div>
                </div>
            </div>
        </div>

        <div class="tm-file-viewer" id="modalFileViewer">
            <div class="tm-file-viewer-toolbar" id="viewerToolbar">
                <div class="tm-file-info-badge" id="fileInfoBadge">Tanggal: - | Total: -</div>
                <button class="tm-jurnal-btn" id="viewerJurnalBtn">Lihat Jurnal</button>
                <div class="tm-check-badge" id="viewerCheckContainer">
                    <input type="checkbox" id="viewerCheckbox" style="cursor: pointer;"> Sudah Dicek
                </div>
                <button class="tm-zoom-btn" id="btnZoomIn" title="Perbesar">+</button>
                <button class="tm-zoom-btn" id="btnZoomOut" title="Perkecil">-</button>
                <button class="tm-zoom-btn" id="btnZoomReset" title="Reset Ukuran">Reset</button>
                <button class="tm-view-close-btn" id="btnViewClose">Tutup</button>
                <button class="tm-close-btn" id="closeFileViewer" style="font-size: 26px; margin-left: 5px;">&times;</button>
            </div>
            <div class="tm-file-container" id="fileContainer"></div>
        </div>

        <div class="tm-jurnal-popup" id="modalJurnalPopup">
            <div class="tm-jurnal-popup-content">
                <div class="tm-jurnal-popup-header">
                    <h4>Detail Jurnal Transaksi</h4>
                    <button class="tm-close-btn" id="closeJurnalPopup">&times;</button>
                </div>
                <iframe class="tm-jurnal-popup-body" id="jurnalIframe" src=""></iframe>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    window.addEventListener('load', function() {
        const btnRekap = document.createElement('button');
        btnRekap.innerHTML = '<i class="fa fa-list"></i> Rekap Beban';
        btnRekap.className = 'btn btn-danger btn-sm';
        btnRekap.style.marginLeft = '12px';
        btnRekap.style.padding = '4px 10px';
        btnRekap.style.fontSize = '12px';
        btnRekap.type = 'button';

        const titleArea = document.querySelector('.panel-heading') || document.querySelector('h1, h2, h3');
        if (titleArea) {
            titleArea.appendChild(btnRekap);
        } else {
            document.body.prepend(btnRekap);
        }

        function updateDataTabelModal() {
            const rekapBody = document.getElementById('tmRekapBody');
            rekapBody.innerHTML = '';
            let grandTotalNum = 0;
            let dataDitemukan = false;

            const tbody = document.querySelector('#data_table tbody');
            let rowsArray = [];

            if (tbody) {
                const rows = tbody.querySelectorAll('tr');
                rows.forEach((row, index) => {
                    const cols = row.querySelectorAll('td');
                    if (cols.length >= 8 && !row.classList.contains('dataTables_empty')) {
                        const voucherCell = cols[3] ? cols[3].innerText.trim() : `row_${index}`;
                        const storageKey = `erzap_checked_${window.location.pathname}_${voucherCell}`;
                        const isChecked = localStorage.getItem(storageKey) === 'true';

                        const tampilkanLink = cols[1] ? cols[1].querySelector('a') : null;
                        const jurnalUrl = tampilkanLink ? tampilkanLink.href : '#';

                        const textTanggal = cols[4].innerText.trim();
                        const contentJP = cols[5].innerHTML.trim();
                        const textTotal = cols[7].innerText.trim();

                        let numericValue = textTotal.replace(/[^\d.]/g, '');
                        if (numericValue) {
                            grandTotalNum += parseFloat(numericValue);
                            dataDitemukan = true;
                        }

                        rowsArray.push({ storageKey, isChecked, textTanggal, contentJP, textTotal, jurnalUrl });
                    }
                });
            }

            rowsArray.sort((a, b) => (a.isChecked === b.isChecked) ? 0 : a.isChecked ? 1 : -1);

            rowsArray.forEach(item => {
                const rowClass = item.isChecked ? 'checked-row' : '';
                rekapBody.innerHTML += `
                    <tr class="${rowClass}" data-storage-key="${item.storageKey}" data-tanggal="${item.textTanggal}" data-total="${item.textTotal}" data-jurnal-url="${item.jurnalUrl}">
                        <td>${item.contentJP}</td>
                        <td style="text-align:center;">${item.textTanggal}</td>
                        <td style="text-align:right;">${item.textTotal}</td>
                        <td style="text-align:center;">
                            <input type="checkbox" class="tm-checkbox-cek" ${item.isChecked ? 'checked' : ''}>
                        </td>
                    </tr>
                `;
            });

            if (!dataDitemukan) {
                rekapBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red;">Data tidak ditemukan di halaman ini.</td></tr>';
            }

            document.getElementById('tmRekapGrandTotal').innerHTML = `<strong>Rp ${grandTotalNum.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>`;

            rekapBody.querySelectorAll('.tm-checkbox-cek').forEach(chk => {
                chk.addEventListener('change', function() {
                    const tr = this.closest('tr');
                    const key = tr.getAttribute('data-storage-key');
                    localStorage.setItem(key, this.checked ? 'true' : 'false');
                    updateDataTabelModal();
                });
            });

            const paginationContainer = document.getElementById('tmPaginationContainer');
            paginationContainer.innerHTML = '';
            const mainPagination = document.querySelector('.paginate_lite_wrap') || document.querySelector('.dataTables_paginate');

            if (mainPagination) {
                paginationContainer.innerHTML = mainPagination.innerHTML;
                const pagLinks = paginationContainer.querySelectorAll('a, .paginate_button');
                pagLinks.forEach(link => {
                    if(link.classList.contains('disabled') || link.getAttribute('disabled')) return;
                    link.addEventListener('click', function(e) {
                        e.preventDefault();
                        sessionStorage.setItem('erzap_auto_open_modal', 'yes');
                        const href = this.getAttribute('href');
                        if (href && href !== '#' && !href.includes('javascript:')) {
                            window.location.href = href;
                        } else {
                            const text = this.innerText.trim();
                            const originLinks = document.querySelectorAll('.paginate_lite_wrap a, .dataTables_paginate a, .dataTables_paginate .paginate_button');
                            for(let ol of originLinks) {
                                if (ol.innerText.trim() === text) {
                                    ol.click();
                                    break;
                                }
                            }
                        }
                    });
                });
            }
        }

        btnRekap.addEventListener('click', function(e) {
            if(e) e.preventDefault();
            const oriOutlet = document.getElementById('pencarian_idoutlet_own');
            const oriDateStart = document.getElementById('pencarian_tanggal_dari');
            const oriDateEnd = document.getElementById('pencarian_tanggal_sampai');
            const tmSelectOutlet = document.getElementById('tmSelectOutlet');

            tmSelectOutlet.innerHTML = '';
            if (oriOutlet) {
                Array.from(oriOutlet.options).forEach(opt => {
                    const newOpt = document.createElement('option');
                    newOpt.value = opt.value;
                    newOpt.text = opt.text;
                    tmSelectOutlet.appendChild(newOpt);
                });
                tmSelectOutlet.value = oriOutlet.value;
            }

            if (oriDateStart) document.getElementById('tmDateStart').value = parseToInputDate(oriDateStart.value);
            if (oriDateEnd) document.getElementById('tmDateEnd').value = parseToInputDate(oriDateEnd.value);

            updateDataTabelModal();
            document.getElementById('modalRekapBeban').style.display = 'flex';
        });

        document.getElementById('tmBtnCari').addEventListener('click', function() {
            this.innerText = 'Memproses...';
            this.disabled = true;
            sessionStorage.setItem('erzap_auto_open_modal', 'yes');

            const oriOutlet = document.getElementById('pencarian_idoutlet_own');
            const oriDateStart = document.getElementById('pencarian_tanggal_dari');
            const oriDateEnd = document.getElementById('pencarian_tanggal_sampai');

            if (oriOutlet) {
                oriOutlet.value = document.getElementById('tmSelectOutlet').value;
                oriOutlet.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof window.$ !== 'undefined') window.$(oriOutlet).trigger('change');
            }

            if (oriDateStart && document.getElementById('tmDateStart').value) {
                oriDateStart.value = parseToErzapDate(document.getElementById('tmDateStart').value);
                oriDateStart.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof window.$ !== 'undefined') window.$(oriDateStart).trigger('change');
            }

            if (oriDateEnd && document.getElementById('tmDateEnd').value) {
                oriDateEnd.value = parseToErzapDate(document.getElementById('tmDateEnd').value);
                oriDateEnd.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof window.$ !== 'undefined') window.$(oriDateEnd).trigger('change');
            }

            setTimeout(() => {
                triggerMainSearch();
            }, 100);
        });

        document.getElementById('closeModalRekap').addEventListener('click', () => {
            document.getElementById('modalRekapBeban').style.display = 'none';
        });

        let currentZoom = 1;
        let activeRowForViewer = null;

        function closeViewer() {
            document.getElementById('modalFileViewer').style.display = 'none';
            document.getElementById('fileContainer').innerHTML = '';
            currentZoom = 1;
            activeRowForViewer = null;
        }

        document.getElementById('closeFileViewer').addEventListener('click', closeViewer);
        document.getElementById('btnViewClose').addEventListener('click', closeViewer);

        document.getElementById('viewerToolbar').addEventListener('click', function(e) {
            e.stopPropagation();
        });

        const viewerJurnalBtn = document.getElementById('viewerJurnalBtn');
        viewerJurnalBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const jurnalUrl = this.getAttribute('data-url');
            if (jurnalUrl && jurnalUrl !== '#') {
                document.getElementById('jurnalIframe').src = jurnalUrl;
                document.getElementById('modalJurnalPopup').style.display = 'flex';
            }
        });

        document.getElementById('closeJurnalPopup').addEventListener('click', () => {
            document.getElementById('modalJurnalPopup').style.display = 'none';
            document.getElementById('jurnalIframe').src = '';
        });

        document.getElementById('modalJurnalPopup').addEventListener('click', function(e) {
            if (e.target === this) {
                this.style.display = 'none';
                document.getElementById('jurnalIframe').src = '';
            }
        });

        const viewerCheckContainer = document.getElementById('viewerCheckContainer');
        viewerCheckContainer.addEventListener('click', function(e) {
            e.stopPropagation();
            const checkbox = document.getElementById('viewerCheckbox');
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }
            if (activeRowForViewer) {
                const mainCheckbox = activeRowForViewer.querySelector('.tm-checkbox-cek');
                if (mainCheckbox) {
                    mainCheckbox.checked = checkbox.checked;
                    mainCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        });

        document.getElementById('viewerCheckbox').addEventListener('change', function(e) {
            e.stopPropagation();
            if (activeRowForViewer) {
                const mainCheckbox = activeRowForViewer.querySelector('.tm-checkbox-cek');
                if (mainCheckbox) {
                    mainCheckbox.checked = this.checked;
                    mainCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        });

        document.getElementById('btnZoomIn').addEventListener('click', (e) => {
            e.stopPropagation();
            currentZoom += 0.25;
            applyZoom();
        });

        document.getElementById('btnZoomOut').addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentZoom > 0.5) currentZoom -= 0.25;
            applyZoom();
        });

        document.getElementById('btnZoomReset').addEventListener('click', (e) => {
            e.stopPropagation();
            currentZoom = 1;
            applyZoom();
        });

        function applyZoom() {
            const img = document.querySelector('#fileContainer img');
            if (img) {
                img.style.transform = `scale(${currentZoom})`;
            }
        }

        document.getElementById('modalFileViewer').addEventListener('click', function(e) {
            if (e.target === this || e.target.id === 'fileContainer') {
                closeViewer();
            }
        });

        document.getElementById('tmRekapBody').addEventListener('click', function(e) {
            const aTag = e.target.closest('a');
            if (aTag && aTag.href && aTag.href !== '#' && !aTag.href.includes('javascript:')) {
                e.preventDefault();
                const fileUrl = aTag.href;
                const tr = aTag.closest('tr');
                activeRowForViewer = tr;

                const tgl = tr ? tr.getAttribute('data-tanggal') : '-';
                const tot = tr ? tr.getAttribute('data-total') : '-';
                const jurnalUrl = tr ? tr.getAttribute('data-jurnal-url') : '#';

                document.getElementById('fileInfoBadge').innerText = `Tanggal: ${tgl} | Total: ${tot}`;

                if (jurnalUrl && jurnalUrl !== '#') {
                    viewerJurnalBtn.setAttribute('data-url', jurnalUrl);
                    viewerJurnalBtn.style.display = 'inline-flex';
                } else {
                    viewerJurnalBtn.style.display = 'none';
                }

                const mainCheckbox = tr ? tr.querySelector('.tm-checkbox-cek') : null;
                const viewerCheckbox = document.getElementById('viewerCheckbox');
                if (mainCheckbox) {
                    viewerCheckbox.checked = mainCheckbox.checked;
                    document.getElementById('viewerCheckContainer').style.display = 'flex';
                } else {
                    document.getElementById('viewerCheckContainer').style.display = 'none';
                }

                const fileContainer = document.getElementById('fileContainer');
                fileContainer.innerHTML = '';
                currentZoom = 1;

                const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(fileUrl);
                if (isImage) {
                    const img = document.createElement('img');
                    img.src = fileUrl;
                    fileContainer.appendChild(img);
                } else {
                    const iframe = document.createElement('iframe');
                    iframe.src = fileUrl;
                    fileContainer.appendChild(iframe);
                }

                document.getElementById('modalFileViewer').style.display = 'flex';
            }
        });

        if (sessionStorage.getItem('erzap_auto_open_modal') === 'yes') {
            sessionStorage.removeItem('erzap_auto_open_modal');
            setTimeout(() => {
                btnRekap.click();
                const btnCari = document.getElementById('tmBtnCari');
                if (btnCari) {
                    btnCari.innerText = 'Terapkan Cari';
                    btnCari.disabled = false;
                }
            }, 1000);
        }

        const outletDropdown = document.getElementById('pencarian_idoutlet_own');
        if (outletDropdown) {
            outletDropdown.addEventListener('change', function() {
                triggerMainSearch();
            });
        }
    });
})();
