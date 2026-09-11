// ==UserScript==
// @name         Erzap - Stok Opname Stok 1, 2 & 3
// @namespace    http://tampermonkey.net/
// @version      1.0.6
// @description  Tambah kolom Stok 1,2,3 setelah Kategori, auto-jumlah ke Stok Aktual, simpan ke localStorage per ID SO + barcode
// @match        https://*.erzap.com/stok_opnams/proses_pengisian_hasil_so*
// @run-at       document-idle
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    var KOLOM_STOK = ['Stok 1', 'Stok 2', 'Stok 3'];
    var LS_PREFIX = 'so_stok_';

    var sudahJalan = false;
    var ID_SO = '';

    function simpanStok(barcode, nilaiArr) {
        try {
            localStorage.setItem(LS_PREFIX + ID_SO + '_' + barcode, JSON.stringify(nilaiArr));
        } catch (e) {}
    }

    function ambilStok(barcode) {
        try {
            var data = localStorage.getItem(LS_PREFIX + ID_SO + '_' + barcode);
            return data ? JSON.parse(data) : null;
        } catch (e) { return null; }
    }

    function getIndexKategori(header) {
        var ths = header.querySelectorAll('th');
        for (var i = 0; i < ths.length; i++) {
            if (ths[i].textContent.trim() === 'Kategori') return i;
        }
        return -1;
    }

    function getBarcode(tr) {
        var td = tr.querySelectorAll('td')[1];
        return td ? td.textContent.trim() : '';
    }

    function updateStokAktual(tr) {
        var total = 0;
        var nilaiArr = [];
        tr.querySelectorAll('.stok_input').forEach(function(inp) {
            var v = parseInt(inp.value) || 0;
            nilaiArr.push(inp.value);
            total += v;
        });
        var inputSO = tr.querySelector('.jumlah_so');
        if (inputSO) {
            inputSO.value = total;
            inputSO.dispatchEvent(new Event('input', { bubbles: true }));
            inputSO.dispatchEvent(new Event('change', { bubbles: true }));
        }
        var barcode = getBarcode(tr);
        if (barcode) simpanStok(barcode, nilaiArr);
    }

    function tambahKolom() {
        var container = document.querySelector('#stok_opnam_details');
        if (!container) return false;
        ID_SO = container.getAttribute('data-idstok_opnam') || '';
        if (!ID_SO) return false;

        var tabel = container.querySelector('table');
        if (!tabel) return false;

        var header = tabel.querySelector('thead tr');
        if (!header) return false;
        var idxKategori = getIndexKategori(header);
        if (idxKategori === -1) return false;

        if (!header.querySelector('.th_stok_0')) {
            var thKategori = header.querySelectorAll('th')[idxKategori];
            KOLOM_STOK.forEach(function(nama, i) {
                var th = document.createElement('th');
                th.className = 'th_stok_' + i;
                th.style.width = '70px';
                th.textContent = nama;
                thKategori.after(th);
            });
            KOLOM_STOK.forEach(function(nama, i) {
                if (i > 0) {
                    thKategori.after(header.querySelector('.th_stok_' + i));
                }
            });
        }

        tabel.querySelectorAll('tbody tr').forEach(function(tr) {
            if (tr.id === 'new_baris') return;
            if (tr.querySelector('.stok_input')) return;

            var tdKategori = tr.children[idxKategori];
            if (!tdKategori) return;

            var barcode = getBarcode(tr);
            var tersimpan = barcode ? ambilStok(barcode) : null;

            KOLOM_STOK.forEach(function(nama, i) {
                var td = document.createElement('td');
                td.style.textAlign = 'right';
                var input = document.createElement('input');
                input.type = 'text';
                input.className = 'stok_input number';
                input.dataset.stokIndex = i;
                input.style.textAlign = 'right';
                input.style.width = '60px';

                if (tersimpan && tersimpan[i]) {
                    input.value = tersimpan[i];
                }

                input.addEventListener('input', function() { updateStokAktual(tr); });
                td.appendChild(input);

                if (i === 0) {
                    tdKategori.after(td);
                } else {
                    tdKategori.parentNode
                        .querySelector('tr#' + tr.id + ' .stok_input[data-stok-index="' + (i - 1) + '"]')
                        .parentNode.after(td);
                }
            });

            if (tersimpan) updateStokAktual(tr);
        });

        console.log('[Stok123] kolom ditambahkan, ID SO = ' + ID_SO);
        return true;
    }

    function mulai() {
        if (sudahJalan) return;
        if (tambahKolom()) {
            sudahJalan = true;
            var container = document.querySelector('#stok_opnam_details');
            if (container) {
                new MutationObserver(function() { tambahKolom(); })
                    .observe(container, { childList: true, subtree: true });
            }
        }
    }

    var percobaan = 0;
    var timer = setInterval(function() {
        percobaan++;
        mulai();
        if (sudahJalan || percobaan > 40) clearInterval(timer);
    }, 500);
})();
