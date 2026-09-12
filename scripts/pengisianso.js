// ==UserScript==
// @name         Erzap - Stok Opname Stok 1, 2 & 3
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  Tambah kolom Stok custom per ID SO (atur via tombol di atas tabel) setelah Kategori, auto-jumlah ke Stok Aktual, simpan ke localStorage per ID SO + barcode
// @match        https://*.erzap.com/stok_opnams/proses_pengisian_hasil_so*
// @run-at       document-idle
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    var LS_PREFIX = 'so_stok_';
    var CONFIG_PREFIX = 'so_stok_kolom_config_';
    var DEFAULT_KOLOM = ['Stok 1', 'Stok 2', 'Stok 3'];

    function loadKolomConfig(idSo) {
        try {
            var raw = localStorage.getItem(CONFIG_PREFIX + idSo);
            if (raw) {
                var arr = JSON.parse(raw);
                if (Array.isArray(arr) && arr.length) return arr;
            }
        } catch (e) {}
        return DEFAULT_KOLOM.slice();
    }

    function saveKolomConfig(idSo, arr) {
        try { localStorage.setItem(CONFIG_PREFIX + idSo, JSON.stringify(arr)); } catch (e) {}
    }

    var KOLOM_STOK = DEFAULT_KOLOM.slice();
    var sudahJalan = false;
    var ID_SO = '';
    var idSoTerakhir = '';

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

    function hapusKolomLama(tabel) {
        tabel.querySelectorAll('th[class^="th_stok_"]').forEach(function(th) { th.remove(); });
        tabel.querySelectorAll('td.td_stok').forEach(function(td) { td.remove(); });
    }

    function tambahKolom() {
        var container = document.querySelector('#stok_opnam_details');
        if (!container) return false;
        ID_SO = container.getAttribute('data-idstok_opnam') || '';
        if (!ID_SO) return false;

        if (ID_SO !== idSoTerakhir) {
            KOLOM_STOK = loadKolomConfig(ID_SO);
            idSoTerakhir = ID_SO;
        }

        var tabel = container.querySelector('table');
        if (!tabel) return false;

        var header = tabel.querySelector('thead tr');
        if (!header) return false;
        var idxKategori = getIndexKategori(header);
        if (idxKategori === -1) return false;

        if (!header.querySelector('.th_stok_0')) {
            var thKategori = header.querySelectorAll('th')[idxKategori];
            var refTh = thKategori;
            KOLOM_STOK.forEach(function(nama, i) {
                var th = document.createElement('th');
                th.className = 'th_stok_' + i;
                th.style.width = '70px';
                th.textContent = nama;
                refTh.after(th);
                refTh = th;
            });
        }

        tabel.querySelectorAll('tbody tr').forEach(function(tr) {
            if (tr.id === 'new_baris') return;
            if (tr.querySelector('.stok_input')) return;

            var tdKategori = tr.children[idxKategori];
            if (!tdKategori) return;

            var barcode = getBarcode(tr);
            var tersimpan = barcode ? ambilStok(barcode) : null;

            var refTd = tdKategori;
            KOLOM_STOK.forEach(function(nama, i) {
                var td = document.createElement('td');
                td.className = 'td_stok';
                td.style.textAlign = 'right';
                var input = document.createElement('input');
                input.type = 'text';
                input.className = 'stok_input number';
                input.dataset.stokIndex = i;
                input.style.textAlign = 'right';
                input.style.width = '60px';

                if (tersimpan && tersimpan[i] !== undefined) {
                    input.value = tersimpan[i];
                }

                input.addEventListener('input', function() { updateStokAktual(tr); });
                td.appendChild(input);
                refTd.after(td);
                refTd = td;
            });

            if (tersimpan) updateStokAktual(tr);
        });

        console.log('[Stok123] kolom ditambahkan, ID SO = ' + ID_SO);
        return true;
    }

    function rebuildKolom() {
        var container = document.querySelector('#stok_opnam_details');
        if (!container) return;
        var tabel = container.querySelector('table');
        if (!tabel) return;
        hapusKolomLama(tabel);
        tambahKolom();
    }

    // Hapus index tertentu dari array nilai stok yg tersimpan di localStorage
    // KHUSUS untuk ID SO yang sedang aktif (formulir lain tidak ikut kesentuh),
    // dipanggil saat sebuah kolom benar-benar dihapus (bukan sekadar rename/tambah)
    // supaya nilai kolom yg tersisa tidak salah geser posisi.
    function migrasiHapusKolom(idxDihapus) {
        if (!idxDihapus.length) return;
        var prefixSesi = LS_PREFIX + ID_SO + '_';
        var urut = idxDihapus.slice().sort(function(a, b) { return b - a; });
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (!key || key.indexOf(prefixSesi) !== 0) continue;
            try {
                var arr = JSON.parse(localStorage.getItem(key));
                if (!Array.isArray(arr)) continue;
                urut.forEach(function(idx) {
                    if (idx < arr.length) arr.splice(idx, 1);
                });
                localStorage.setItem(key, JSON.stringify(arr));
            } catch (e) {}
        }
    }

    // ================= Tombol + Modal CRUD kolom =================
    function buatTombolAtur() {
        if (document.querySelector('#stok123_btn')) return;

        var container = document.querySelector('#stok_opnam_details');
        if (!container) return;
        var tabel = container.querySelector('table');
        if (!tabel) return;

        var btn = document.createElement('button');
        btn.id = 'stok123_btn';
        btn.type = 'button';
        btn.textContent = '⚙ Atur Kolom Stok';
        btn.style.cssText = 'margin-bottom:8px;padding:6px 14px;border-radius:4px;' +
            'background:#dc2626;color:#fff;border:none;font-size:13px;cursor:pointer;' +
            'box-shadow:0 3px 10px rgba(220,38,38,.5);';
        btn.addEventListener('click', bukaModal);
        tabel.parentNode.insertBefore(btn, tabel);
    }

    function bukaModal() {
        if (document.querySelector('#stok123_modal_overlay')) return;

        var overlay = document.createElement('div');
        overlay.id = 'stok123_modal_overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);' +
            'display:flex;align-items:center;justify-content:center;z-index:100000;';

        var box = document.createElement('div');
        box.style.cssText = 'background:#fff;border-radius:8px;padding:20px;width:320px;' +
            'max-height:80vh;overflow:auto;font-family:sans-serif;box-sizing:border-box;' +
            'box-shadow:0 8px 30px rgba(220,38,38,.45);border-top:4px solid #dc2626;';

        var judul = document.createElement('h3');
        judul.textContent = 'Atur Kolom Stok';
        judul.style.cssText = 'margin:0 0 12px;font-size:16px;';
        box.appendChild(judul);

        var list = document.createElement('div');
        box.appendChild(list);

        var kerja = KOLOM_STOK.slice();
        var kerjaIdxAsal = KOLOM_STOK.map(function(_, i) { return i; });

        function renderList() {
            list.innerHTML = '';
            kerja.forEach(function(nama, i) {
                var row = document.createElement('div');
                row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';

                var input = document.createElement('input');
                input.type = 'text';
                input.value = nama;
                input.style.cssText = 'flex:1;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;';
                input.addEventListener('input', function() { kerja[i] = input.value; });

                var btnHapus = document.createElement('button');
                btnHapus.textContent = '✕';
                btnHapus.title = 'Hapus kolom';
                btnHapus.style.cssText = 'background:#dc2626;color:#fff;border:none;' +
                    'border-radius:4px;width:32px;cursor:pointer;flex-shrink:0;' +
                    'box-shadow:0 2px 6px rgba(220,38,38,.5);';
                btnHapus.addEventListener('click', function() {
                    kerja.splice(i, 1);
                    kerjaIdxAsal.splice(i, 1);
                    renderList();
                });

                row.appendChild(input);
                row.appendChild(btnHapus);
                list.appendChild(row);
            });
        }
        renderList();

        var btnTambah = document.createElement('button');
        btnTambah.textContent = '+ Tambah Kolom';
        btnTambah.style.cssText = 'width:100%;padding:8px;margin-top:6px;background:#f3f4f6;' +
            'border:1px dashed #999;border-radius:4px;cursor:pointer;box-sizing:border-box;';
        btnTambah.addEventListener('click', function() {
            kerja.push('Stok ' + (kerja.length + 1));
            kerjaIdxAsal.push(-1);
            renderList();
        });
        box.appendChild(btnTambah);

        var aksi = document.createElement('div');
        aksi.style.cssText = 'display:flex;gap:8px;margin-top:16px;';

        var btnBatal = document.createElement('button');
        btnBatal.textContent = 'Batal';
        btnBatal.style.cssText = 'flex:1;padding:8px;border:1px solid #ccc;border-radius:4px;' +
            'background:#fff;cursor:pointer;';
        btnBatal.addEventListener('click', function() { overlay.remove(); });

        var btnSimpan = document.createElement('button');
        btnSimpan.textContent = 'Simpan';
        btnSimpan.style.cssText = 'flex:1;padding:8px;border:none;border-radius:4px;' +
            'background:#dc2626;color:#fff;cursor:pointer;box-shadow:0 3px 10px rgba(220,38,38,.5);';
        btnSimpan.addEventListener('click', function() {
            var final = [], finalIdx = [];
            for (var k = 0; k < kerja.length; k++) {
                var t = kerja[k].trim();
                if (t.length) { final.push(t); finalIdx.push(kerjaIdxAsal[k]); }
            }
            if (!final.length) { alert('Minimal 1 kolom.'); return; }

            var idxDihapus = [];
            KOLOM_STOK.forEach(function(_, i) {
                if (finalIdx.indexOf(i) === -1) idxDihapus.push(i);
            });

            migrasiHapusKolom(idxDihapus);
            KOLOM_STOK = final;
            saveKolomConfig(ID_SO, KOLOM_STOK);
            rebuildKolom();
            overlay.remove();
        });

        aksi.appendChild(btnBatal);
        aksi.appendChild(btnSimpan);
        box.appendChild(aksi);

        overlay.appendChild(box);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }

    function mulai() {
        if (sudahJalan) return;
        if (tambahKolom()) {
            sudahJalan = true;
            buatTombolAtur();
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
