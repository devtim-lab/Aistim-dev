// ==UserScript==
// @name         Auto Koreksi, Simpan, & Reload - Erzap
// @namespace    http://tampermonkey.net/
// @version      1.3.2
// @updateURL    https://raw.githubusercontent.com/devtim-lab/AistimScript/main/koreksiso.js
// @downloadURL  https://raw.githubusercontent.com/devtim-lab/AistimScript/main/koreksiso.js
// @description  [v1.3.1] Alur: KOREKSI (Koreksi teratas = Hasil SO, Koreksi ke-2 dst = 0) -> SIMPAN -> RELOAD
// @author       You
// @match        https://*.erzap.com/stok_opnams/proses_koreksi_so/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let isRunning = sessionStorage.getItem('erzap_auto_running') === 'true';

    function getCurrentPageNumber() {
        const urlParams = new URLSearchParams(window.location.search);
        let page = urlParams.get('page');
        if (page) {
            return parseInt(page);
        }
        return 1;
    }

    let maxVisitedPage = parseInt(sessionStorage.getItem('erzap_max_page') || '1');
    let currentPage = getCurrentPageNumber();
    if (currentPage > maxVisitedPage) {
        maxVisitedPage = currentPage;
        sessionStorage.setItem('erzap_max_page', maxVisitedPage);
    }

    let pageLogs = JSON.parse(sessionStorage.getItem('erzap_page_logs') || '{}');

    function showPaginatedSummaryPopup(message, logs) {
        const existingModal = document.getElementById('customAlertModal');
        if (existingModal) existingModal.remove();

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'customAlertModal';
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modalOverlay.style.zIndex = '99999';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.alignItems = 'center';

        const modalBox = document.createElement('div');
        modalBox.style.backgroundColor = '#fff';
        modalBox.style.padding = '25px 30px';
        modalBox.style.borderRadius = '8px';
        modalBox.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
        modalBox.style.textAlign = 'center';
        modalBox.style.minWidth = '380px';
        modalBox.style.maxWidth = '450px';

        const modalText = document.createElement('p');
        modalText.textContent = message;
        modalText.style.fontSize = '16px';
        modalText.style.color = '#333';
        modalText.style.marginBottom = '15px';
        modalText.style.fontWeight = 'bold';

        let logKeys = Object.keys(logs).sort((a, b) => parseInt(a) - parseInt(b));
        let currentPopupPage = 1;
        const itemsPerPage = 10;
        let totalPopupPages = Math.ceil(logKeys.length / itemsPerPage) || 1;

        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.marginBottom = '15px';

        const thead = document.createElement('thead');
        thead.innerHTML = `<tr style="background-color: #f8f9fa; border-bottom: 2px solid #dee2e6;">
            <th style="padding: 8px; border: 1px solid #dee2e6; text-align: center;">Halaman (Page)</th>
            <th style="padding: 8px; border: 1px solid #dee2e6; text-align: center;">Status Save</th>
        </tr>`;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        table.appendChild(tbody);

        const paginationDiv = document.createElement('div');
        paginationDiv.style.display = 'flex';
        paginationDiv.style.justifyContent = 'space-between';
        paginationDiv.style.alignItems = 'center';
        paginationDiv.style.marginBottom = '20px';

        const prevBtn = document.createElement('button');
        prevBtn.textContent = '‹ Sebelumnya';
        prevBtn.className = 'btn btn-default btn-sm';
        prevBtn.style.padding = '5px 10px';
        prevBtn.style.fontSize = '12px';

        const pageInfo = document.createElement('span');
        pageInfo.style.fontSize = '13px';
        pageInfo.style.color = '#555';

        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Selanjutnya ›';
        nextBtn.className = 'btn btn-default btn-sm';
        nextBtn.style.padding = '5px 10px';
        nextBtn.style.fontSize = '12px';

        function renderTablePage(p) {
            tbody.innerHTML = '';
            let start = (p - 1) * itemsPerPage;
            let end = start + itemsPerPage;
            let slicedKeys = logKeys.slice(start, end);

            if (slicedKeys.length === 0) {
                let row = document.createElement('tr');
                row.innerHTML = `<td colspan="2" style="padding: 10px; text-align: center; color: #777;">Tidak ada data.</td>`;
                tbody.appendChild(row);
            } else {
                slicedKeys.forEach(pageNum => {
                    let status = logs[pageNum];
                    let statusColor = status === 'Berhasil' ? '#28a745' : '#dc3545';

                    const row = document.createElement('tr');
                    row.innerHTML = `<td style="padding: 8px; border: 1px solid #dee2e6; text-align: center;">Page ${pageNum}</td>
                                     <td style="padding: 8px; border: 1px solid #dee2e6; text-align: center; color: ${statusColor}; font-weight: bold;">${status}</td>`;
                    tbody.appendChild(row);
                });
            }

            pageInfo.textContent = `Hal ${p} dari ${totalPopupPages}`;
            prevBtn.disabled = p <= 1;
            prevBtn.style.opacity = p <= 1 ? '0.5' : '1';
            nextBtn.disabled = p >= totalPopupPages;
            nextBtn.style.opacity = p >= totalPopupPages ? '0.5' : '1';
        }

        prevBtn.addEventListener('click', function() {
            if (currentPopupPage > 1) {
                currentPopupPage--;
                renderTablePage(currentPopupPage);
            }
        });

        nextBtn.addEventListener('click', function() {
            if (currentPopupPage < totalPopupPages) {
                currentPopupPage++;
                renderTablePage(currentPopupPage);
            }
        });

        paginationDiv.appendChild(prevBtn);
        paginationDiv.appendChild(pageInfo);
        paginationDiv.appendChild(nextBtn);

        renderTablePage(currentPopupPage);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'OK';
        closeBtn.className = 'btn btn-success';
        closeBtn.style.padding = '8px 25px';
        closeBtn.style.fontSize = '14px';
        closeBtn.style.backgroundColor = '#28a745';
        closeBtn.style.color = '#fff';
        closeBtn.style.border = 'none';
        closeBtn.style.borderRadius = '4px';
        closeBtn.style.cursor = 'pointer';

        closeBtn.addEventListener('click', function() {
            modalOverlay.remove();
            sessionStorage.removeItem('erzap_max_page');
            sessionStorage.removeItem('erzap_page_logs');
        });

        modalBox.appendChild(modalText);
        modalBox.appendChild(table);
        modalBox.appendChild(paginationDiv);
        modalBox.appendChild(closeBtn);
        modalOverlay.appendChild(modalBox);
        document.body.appendChild(modalOverlay);
    }

    function injectResponsiveStyle() {
        if (document.getElementById('autoKoreksiStyle')) return;
        const style = document.createElement('style');
        style.id = 'autoKoreksiStyle';
        style.textContent = `
            /* Desktop: tombol inline di samping tombol FIFO */
            #autoKoreksiGroup {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                margin-right: 5px;
                vertical-align: middle;
            }
            #autoKoreksiGroup button {
                white-space: nowrap;
            }

            /* Mobile / layar kecil: tombol jadi bar mengambang di bawah layar */
            @media (max-width: 768px) {
                #autoKoreksiGroup {
                    position: fixed !important;
                    left: 8px !important;
                    right: 8px !important;
                    bottom: 8px !important;
                    top: auto !important;
                    z-index: 99998 !important;
                    display: flex !important;
                    gap: 8px !important;
                    margin: 0 !important;
                    padding: 8px !important;
                    background: rgba(255, 255, 255, 0.97) !important;
                    border-radius: 10px !important;
                    box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.25) !important;
                }
                #autoKoreksiGroup button {
                    flex: 1 1 0 !important;
                    min-width: 0 !important;
                    min-height: 44px !important;   /* standar sentuh mobile */
                    font-size: 14px !important;
                    font-weight: bold !important;
                    margin: 0 !important;
                    border-radius: 6px !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function initControls() {
        if (document.getElementById('autoKoreksiGroup')) return;

        injectResponsiveStyle();

        let targetBtn = null;
        const allElements = document.querySelectorAll('a, button');
        for (let el of allElements) {
            if (el.textContent.trim() === 'FIFO') {
                targetBtn = el;
                break;
            }
        }

        if (targetBtn) {
            const groupDiv = document.createElement('div');
            groupDiv.id = 'autoKoreksiGroup';

            // Samakan ukuran & gaya dengan tombol FIFO supaya rata/sejajar di desktop
            const cs = window.getComputedStyle(targetBtn);
            function matchBtnStyle(btn) {
                btn.style.paddingTop = cs.paddingTop;
                btn.style.paddingBottom = cs.paddingBottom;
                btn.style.paddingLeft = cs.paddingLeft;
                btn.style.paddingRight = cs.paddingRight;
                btn.style.fontSize = cs.fontSize;
                btn.style.lineHeight = cs.lineHeight;
                btn.style.fontWeight = cs.fontWeight;
                btn.style.borderRadius = cs.borderRadius;
                btn.style.borderWidth = cs.borderWidth;
                btn.style.height = cs.height;
                btn.style.verticalAlign = 'middle';
                btn.style.display = 'inline-flex';
                btn.style.alignItems = 'center';
                btn.style.justifyContent = 'center';
            }

            const startBtn = document.createElement('button');
            startBtn.id = 'startAutoBtn';
            startBtn.type = 'button';
            startBtn.className = targetBtn.className ? targetBtn.className : 'btn btn-default';
            startBtn.textContent = isRunning ? 'KOREKSI...' : 'START AUTO';
            matchBtnStyle(startBtn);
            startBtn.style.backgroundColor = '#28a745';
            startBtn.style.color = '#fff';
            startBtn.style.borderColor = '#28a745';
            startBtn.style.minWidth = '130px';
            startBtn.style.textAlign = 'center';

            const stopBtn = document.createElement('button');
            stopBtn.id = 'stopAutoBtn';
            stopBtn.type = 'button';
            stopBtn.className = targetBtn.className ? targetBtn.className : 'btn btn-default';
            stopBtn.textContent = 'STOP';
            matchBtnStyle(stopBtn);
            stopBtn.style.backgroundColor = '#dc3545';
            stopBtn.style.color = '#fff';
            stopBtn.style.borderColor = '#dc3545';
            stopBtn.style.minWidth = '70px';

            startBtn.addEventListener('click', function() {
                if (!isRunning) {
                    sessionStorage.setItem('erzap_auto_running', 'true');
                    sessionStorage.setItem('erzap_max_page', '1');
                    sessionStorage.removeItem('erzap_page_logs');
                    isRunning = true;
                    runAutoProcess(startBtn);
                }
            });

            stopBtn.addEventListener('click', function() {
                sessionStorage.setItem('erzap_auto_running', 'false');
                isRunning = false;
                startBtn.textContent = 'START AUTO';
                startBtn.style.backgroundColor = '#28a745';
                let finalLogs = JSON.parse(sessionStorage.getItem('erzap_page_logs') || '{}');
                showPaginatedSummaryPopup('Proses Auto Koreksi dihentikan.', finalLogs);
            });

            groupDiv.appendChild(startBtn);
            groupDiv.appendChild(stopBtn);
            targetBtn.parentNode.insertBefore(groupDiv, targetBtn);

            if (isRunning) {
                setTimeout(() => runAutoProcess(startBtn), 1500);
            }
        }
    }

    function runAutoProcess(btnElement) {
        if (sessionStorage.getItem('erzap_auto_running') !== 'true') return;

        let currentP = getCurrentPageNumber();
        let storedMax = parseInt(sessionStorage.getItem('erzap_max_page') || '1');
        if (currentP > storedMax) {
            sessionStorage.setItem('erzap_max_page', currentP);
        }

        // --- TAHAP 1: KOREKSI ---
        if (btnElement) {
            btnElement.textContent = 'KOREKSI...';
            btnElement.style.backgroundColor = '#28a745';
            btnElement.style.borderColor = '#28a745';
        }

        setTimeout(function() {
            if (sessionStorage.getItem('erzap_auto_running') !== 'true') return;

            // 1. Isi Pengkoreksi dengan 'AISTIM'
            const pengkoreksiInput = document.getElementById('stok_opnam_pengkoreksi');
            if (pengkoreksiInput) {
                pengkoreksiInput.value = 'AISTIM';
                pengkoreksiInput.dispatchEvent(new Event('input', { bubbles: true }));
                pengkoreksiInput.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // 2. Isi Tanggal Koreksi dengan hari ini.
            //    Deteksi otomatis format:
            //    - <input type="date">  -> wajib YYYY-MM-DD (umumnya desktop)
            //    - input teks + datepicker -> DD-MM-YYYY (umumnya HP)
            //      (separator mengikuti placeholder bila ada: dd-mm-yyyy / dd/mm/yyyy)
            const tanggalKoreksiInput = document.getElementById('stok_opnam_tanggal_koreksi');
            if (tanggalKoreksiInput) {
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');

                const isDateType = (tanggalKoreksiInput.type || '').toLowerCase() === 'date';
                let dateVal;
                if (isDateType) {
                    dateVal = `${yyyy}-${mm}-${dd}`;
                } else {
                    const ph = (tanggalKoreksiInput.placeholder || '').toLowerCase();
                    const sep = ph.indexOf('/') !== -1 ? '/' : '-';
                    dateVal = `${dd}${sep}${mm}${sep}${yyyy}`;
                }
                tanggalKoreksiInput.value = dateVal;

                // Trigger event lengkap agar datepicker (jQuery/bootstrap-datepicker/dll) ikut membaca
                tanggalKoreksiInput.dispatchEvent(new Event('focus', { bubbles: true }));
                tanggalKoreksiInput.dispatchEvent(new Event('input', { bubbles: true }));
                tanggalKoreksiInput.dispatchEvent(new Event('change', { bubbles: true }));
                tanggalKoreksiInput.dispatchEvent(new Event('blur', { bubbles: true }));
                tanggalKoreksiInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Tab' }));
            }

            // 3. Isi input jumlah koreksi per produk:
            //    - Input PALING ATAS dalam grup produk = nilai Hasil SO
            //    - Input ke-2, ke-3, dst dalam grup yang sama = 0
            const koreksiSelector = 'input[type="text"][name*="jumlah_koreksi"]';
            const processedInputs = new Set();

            function setInputValue(inp, val) {
                if (processedInputs.has(inp)) return;
                processedInputs.add(inp);
                inp.value = val;
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
            }

            const soCells = document.querySelectorAll('td[id^="so"]');
            soCells.forEach(soCell => {
                // Ambil angka Hasil SO (dukung minus & koma, mis. "-1,5" / "12.000")
                let valText = soCell.textContent.trim();
                const match = valText.match(/-?[\d.,]+/);
                let hasilSOVal = match ? match[0] : '0';

                let currentRow = soCell.closest('tr');
                if (!currentRow) return;

                // Jumlah baris yang dicakup produk ini diambil dari atribut rowspan
                // pada kolom Hasil SO (lebih andal daripada menebak id <tr>).
                let span = parseInt(soCell.getAttribute('rowspan') || '1', 10);
                if (isNaN(span) || span < 1) span = 1;

                let inputsInGroup = [];
                let row = currentRow;
                let rowsChecked = 0;
                while (row && rowsChecked < span) {
                    let inps = row.querySelectorAll(koreksiSelector);
                    inps.forEach(i => { if (!processedInputs.has(i)) inputsInGroup.push(i); });
                    row = row.nextElementSibling;
                    rowsChecked++;
                }

                // Fallback: jika rowspan tidak dipakai, gabungkan baris-baris berikutnya
                // selama baris tersebut TIDAK punya cell Hasil SO sendiri (berarti masih
                // produk yang sama / baris lanjutan).
                if (span === 1) {
                    let sib = currentRow.nextElementSibling;
                    while (sib && !sib.querySelector('td[id^="so"]')) {
                        let inps = sib.querySelectorAll(koreksiSelector);
                        if (inps.length === 0) break;
                        inps.forEach(i => { if (!processedInputs.has(i)) inputsInGroup.push(i); });
                        sib = sib.nextElementSibling;
                    }
                }

                // Isi nilai: index 0 (paling atas) = Hasil SO, sisanya = 0
                inputsInGroup.forEach((inp, idx) => {
                    setInputValue(inp, idx === 0 ? hasilSOVal : '0');
                });
            });

            // Fallback terakhir: input koreksi yang tidak masuk grup mana pun
            // (mis. struktur tabel tak terduga) -> isi 0 agar tidak ikut terkirim
            // dengan nilai lama/kosong.
            document.querySelectorAll(koreksiSelector).forEach(inp => {
                if (!processedInputs.has(inp)) {
                    setInputValue(inp, '0');
                }
            });

            // --- TAHAP 2: SIMPAN ---
            setTimeout(function() {
                if (sessionStorage.getItem('erzap_auto_running') !== 'true') return;

                const divSimpan = document.getElementById('simpan');
                let currentLogs = JSON.parse(sessionStorage.getItem('erzap_page_logs') || '{}');

                if (divSimpan) {
                    if (btnElement) {
                        btnElement.textContent = 'SIMPAN...';
                        btnElement.style.backgroundColor = '#007bff';
                        btnElement.style.borderColor = '#007bff';
                    }

                    divSimpan.click();
                    if (typeof submit_form_koreksi_so === 'function') {
                        submit_form_koreksi_so();
                    }
                    currentLogs[currentP] = 'Berhasil';
                } else {
                    currentLogs[currentP] = 'Gagal Save';
                    if (btnElement) {
                        btnElement.textContent = 'SKIP...';
                        btnElement.style.backgroundColor = '#6c757d';
                        btnElement.style.borderColor = '#6c757d';
                    }
                }
                sessionStorage.setItem('erzap_page_logs', JSON.stringify(currentLogs));

                // --- TAHAP 3: RELOAD / PINDAH HALAMAN BERIKUTNYA ---
                setTimeout(function() {
                    if (sessionStorage.getItem('erzap_auto_running') !== 'true') return;

                    if (btnElement) {
                        btnElement.textContent = 'RELOAD...';
                        btnElement.style.backgroundColor = '#ffc107';
                        btnElement.style.borderColor = '#ffc107';
                    }

                    let nextLink = null;
                    const allLinks = document.querySelectorAll('a');
                    for (let link of allLinks) {
                        let text = link.textContent.trim();
                        if (text.includes('Selanjutnya') || text.includes('›') || text.includes('»') || link.getAttribute('rel') === 'next') {
                            if (!link.parentElement.classList.contains('disabled') && link.offsetParent !== null) {
                                nextLink = link;
                                break;
                            }
                        }
                    }

                    if (nextLink) {
                        nextLink.click();
                        setTimeout(() => runAutoProcess(btnElement), 2500);
                    } else {
                        let finalLogs = JSON.parse(sessionStorage.getItem('erzap_page_logs') || '{}');

                        sessionStorage.setItem('erzap_auto_running', 'false');
                        if (btnElement) {
                            btnElement.textContent = 'SELESAI';
                            btnElement.style.backgroundColor = '#17a2b8';
                            btnElement.style.borderColor = '#17a2b8';
                        }

                        showPaginatedSummaryPopup('Rangkuman Hasil Koreksi & Save:', finalLogs);
                    }
                }, 2000);

            }, 1500);

        }, 1200);
    }

    window.addEventListener('load', function() {
        setTimeout(initControls, 1200);
    });

    const observer = new MutationObserver(function() {
        if (!document.getElementById('autoKoreksiGroup')) {
            initControls();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

})();
