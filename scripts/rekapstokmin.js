// ==UserScript==
// @name         Rekap Stok Minus - Lihat Stok
// @namespace    http://tampermonkey.net/
// @version      1.2.1
// @description  Scan stok minus outlet, tunggu tabel stabil (bukan delay tetap), fallback teks tampilan aware format angka Indonesia (titik ribuan/koma desimal). ID unik prefix rsm_.
// @match        https://*.erzap.com/produk_gudangs/lihat_stok/new*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let stopRequested = false;

    function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    // 1. Styling Tampilan Modal & Posisi Tombol Kanan
    const style = document.createElement('style');
    style.innerHTML = `
        #rsm_backdrop {
            display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.5); z-index: 10000; justify-content: center; align-items: center; font-family: inherit;
        }
        #rsm_box {
            background: #fff; width: 750px; max-width: 95%; border-radius: 6px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3); overflow: hidden; display: flex; flex-direction: column; max-height: 90vh;
        }
        #rsm_header { background: #dc3545; color: white; padding: 12px 15px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; }
        #rsm_close { background: none; border: none; color: white; font-size: 18px; cursor: pointer; }
        #rsm_body { padding: 20px; overflow-y: auto; flex-grow: 1; scroll-behavior: smooth; }
        .rsm_table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
        .rsm_table th, .rsm_table td { border: 1px solid #dee2e6; padding: 8px 12px; text-align: left; }
        .rsm_table th { background-color: #f8f9fa; font-weight: bold; }
        #rsm_footer { padding: 10px 20px; background: #f1f1f1; display: flex; justify-content: space-between; align-items: center; }
        .rsm_btn { padding: 8px 15px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px; }
        .rsm_btn_secondary { background: #6c757d; color: white; }
        .rsm_btn_stop { background: #343a40; color: white; display: none; }
        .rsm_btn_scan { background: #dc3545; color: white; }
        .rsm_btn_scan:hover { background: #c82333; }
        .rsm_wrap_btn { margin-bottom: 10px; display: flex; justify-content: flex-end; }
        #rsm_btn_buka { background: linear-gradient(135deg,#e63946,#b30d1c); color: #fff; border: none; padding: 8px 18px; border-radius: 8px; cursor: pointer; font: 600 13px/1 'Segoe UI',Arial,sans-serif; box-shadow: 0 2px 8px rgba(230,57,70,.4); white-space: nowrap; }
        #rsm_btn_buka:hover { background: linear-gradient(135deg,#d63040,#a50c1a); }
        #rsm_btn_buka:active { transform: scale(.95); }
        .rsm_scan_status { font-size: 12px; color: #666; font-style: italic; }
        .rsm_minus { color: red; font-weight: bold; }
    `;
    document.head.appendChild(style);

    // 2. Struktur HTML Modal
    const modalHTML = `
        <div id="rsm_backdrop">
            <div id="rsm_box">
                <div id="rsm_header">
                    <span>Rekap Stok Minus Outlet (< 0)</span>
                    <button id="rsm_close">&times;</button>
                </div>
                <div id="rsm_body">
                    <p style="margin-top:0; font-size:13px; color:#555;">
                        Sistem sedang memproses sinkronisasi tabel per outlet...
                    </p>
                    <button class="rsm_btn rsm_btn_scan" id="rsm_jalankan_scan">▶️ Mulai Scan</button>
                    <div style="margin-top: 15px;">
                        <table class="rsm_table" id="rsm_tabel_hasil">
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
                <div id="rsm_footer">
                    <span class="rsm_scan_status" id="rsm_status_text">Siap...</span>
                    <div style="display: flex; gap: 8px;">
                        <button class="rsm_btn rsm_btn_stop" id="rsm_stop">🛑 Stop</button>
                        <button class="rsm_btn rsm_btn_secondary" id="rsm_tutup">Tutup</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer);

    function scrollToBottom() {
        const modalBody = document.getElementById('rsm_body');
        if (modalBody) modalBody.scrollTop = modalBody.scrollHeight;
    }

    // === TUNGGU TABEL STABIL (bukan delay tetap) ===
    // Poll jumlah baris #data_table_produk sampai nggak berubah 2x berturut-turut,
    // atau sampai batas maksimal tercapai (jaring pengaman kalau ajax gagal/lambat).
    async function tungguTabelStabil(maxTries = 15, jedaMs = 300) {
        await sleep(400); // beri waktu request tabel mulai jalan dulu
        let jumlahSebelum = -1;
        let stabil = 0;
        for (let i = 0; i < maxTries; i++) {
            const jumlahSekarang = document.querySelectorAll('#data_table_produk tbody tr').length;
            if (jumlahSekarang === jumlahSebelum) {
                stabil++;
                if (stabil >= 2) return;
            } else {
                stabil = 0;
            }
            jumlahSebelum = jumlahSekarang;
            await sleep(jedaMs);
        }
    }

    // === SET FILTER STOK < 0 DI HALAMAN ERZAP ===
    // Auto-deteksi kontrol filter stok (select/radio/operator+nilai) dan set ke "minus / kurang dari 0"
    function triggerChange(el) {
        el.dispatchEvent(new Event('change', { bubbles: true }));
        if (typeof window.jQuery !== 'undefined') {
            try { window.jQuery(el).trigger('change'); } catch (e) {}
            try { window.jQuery(el).trigger('select2:select'); } catch (e) {}
        }
    }

    function setFilterStokMinus() {
        let sudahDiset = false;
        const reMinusText = /(minus|kurang\s*dari|negatif|<\s*0|di\s*bawah\s*0)/i;
        const reMinusVal = /(minus|negatif|lt|less|^<$|_lt_|kurang)/i;

        // 1. SELECT yang id/name/label-nya berhubungan dengan stok
        document.querySelectorAll('select').forEach(sel => {
            if (sudahDiset) return;
            if (sel.id === 'pencarian_idoutlet_own') return; // jangan sentuh select outlet
            const ident = ((sel.id || '') + ' ' + (sel.name || '')).toLowerCase();
            const labelEl = sel.closest('.form-group, .form-inputs, div, td')?.querySelector('label');
            const labelTxt = (labelEl ? labelEl.innerText : '').toLowerCase();
            const isStokFilter = /stok|stock|qty|jumlah|quantity/.test(ident) || /stok|stock|qty|jumlah/.test(labelTxt);
            if (!isStokFilter) return;

            const opts = Array.from(sel.options);
            const target = opts.find(o => reMinusText.test(o.text) || reMinusVal.test(o.value));
            if (target && !target.disabled) {
                sel.value = target.value;
                triggerChange(sel);
                sudahDiset = true;
            }
        });

        // 2. Pola OPERATOR + NILAI: select berisi <,>,= di dekat input angka stok
        if (!sudahDiset) {
            document.querySelectorAll('select').forEach(sel => {
                if (sudahDiset) return;
                if (sel.id === 'pencarian_idoutlet_own') return;
                const opts = Array.from(sel.options);
                const hasOperator = opts.some(o => ['<', '&lt;'].includes(o.text.trim()) || o.value === '<' || /(^|_)lt(_|$)/.test(o.value));
                if (!hasOperator) return;
                // Cari input angka terdekat (operator stok biasanya sepasang dengan input nilai)
                const scope = sel.closest('.form-group, .row, td, div');
                const numInput = scope ? scope.querySelector('input[type="number"], input[type="text"]') : null;
                const scopeTxt = (scope ? scope.innerText : '').toLowerCase();
                if (!/stok|stock|qty|jumlah/.test(scopeTxt)) return;

                const opTarget = opts.find(o => ['<', '&lt;'].includes(o.text.trim()) || o.value === '<' || /(^|_)lt(_|$)/.test(o.value));
                sel.value = opTarget.value;
                triggerChange(sel);
                if (numInput) {
                    numInput.value = '0';
                    numInput.dispatchEvent(new Event('input', { bubbles: true }));
                    triggerChange(numInput);
                }
                sudahDiset = true;
            });
        }

        // 3. RADIO / CHECKBOX bertuliskan "minus"
        if (!sudahDiset) {
            document.querySelectorAll('input[type="radio"]').forEach(radio => {
                if (sudahDiset) return;
                const lbl = radio.closest('label') || document.querySelector(`label[for="${radio.id}"]`);
                const txt = ((lbl ? lbl.innerText : '') + ' ' + (radio.value || '')).toLowerCase();
                if (reMinusText.test(txt) || reMinusVal.test(txt)) {
                    radio.checked = true;
                    radio.dispatchEvent(new Event('click', { bubbles: true }));
                    triggerChange(radio);
                    sudahDiset = true;
                }
            });
        }

        return sudahDiset;
    }

    // === KOSONGKAN SEMUA FILTER DI HALAMAN ERZAP ===
    // Cek setiap filter; yang masih terisi dikembalikan ke kosong / "-- Semua --".
    // Select outlet & checkbox outlet TIDAK disentuh (diatur oleh logika scan).
    function kosongkanSemuaFilter() {
        const diModalKita = el => el.closest('#rsm_backdrop, #az_overlay, #az_modal');

        // 1. Input teks / angka / pencarian → kosongkan
        document.querySelectorAll('input[type="text"], input[type="number"], input[type="search"]').forEach(inp => {
            if (diModalKita(inp)) return;
            if (inp.value !== '') {
                inp.value = '';
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                triggerChange(inp);
            }
        });

        // 2. Select → kembali ke opsi kosong / "-- Semua --" (atau opsi pertama)
        document.querySelectorAll('select').forEach(sel => {
            if (diModalKita(sel)) return;
            if (sel.id === 'pencarian_idoutlet_own') return; // outlet diatur logika scan
            const opts = Array.from(sel.options);
            const optKosong = opts.find(o => o.value === '' || /semua|all|--/i.test(o.text));
            const target = optKosong || opts[0];
            if (target && sel.value !== target.value) {
                sel.value = target.value;
                triggerChange(sel);
            }
        });

        // 3. Radio → pilih yang value kosong / bertuliskan "Semua"
        const radioGroups = {};
        document.querySelectorAll('input[type="radio"]').forEach(r => {
            if (diModalKita(r)) return;
            (radioGroups[r.name] = radioGroups[r.name] || []).push(r);
        });
        Object.values(radioGroups).forEach(group => {
            const def = group.find(r => {
                const lbl = r.closest('label') || document.querySelector(`label[for="${r.id}"]`);
                const txt = ((lbl ? lbl.innerText : '') + ' ' + (r.value || '')).toLowerCase();
                return r.value === '' || /semua|all/.test(txt);
            });
            if (def && !def.checked) {
                def.checked = true;
                def.dispatchEvent(new Event('click', { bubbles: true }));
                triggerChange(def);
            }
        });

        // 4. Checkbox filter (selain checkbox outlet) → uncheck
        document.querySelectorAll('input[type="checkbox"]').forEach(chk => {
            if (diModalKita(chk)) return;
            if (chk.classList.contains('checkbox_list_outlets')) return;
            if (chk.checked) {
                chk.checked = false;
                chk.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }

    // Set jumlah baris tabel ke maksimal supaya semua stok minus tampil 1 halaman
    function setTabelTampilSemua() {
        document.querySelectorAll('select').forEach(sel => {
            const ident = ((sel.id || '') + ' ' + (sel.name || '')).toLowerCase();
            if (!/length|per_page|perpage|limit|entries/.test(ident)) return;
            const opts = Array.from(sel.options);
            const target = opts.find(o => /semua|all/i.test(o.text)) || opts[opts.length - 1];
            if (target && sel.value !== target.value) {
                sel.value = target.value;
                triggerChange(sel);
            }
        });
    }

    // Klik tombol pencarian/filter utama Erzap
    function klikTombolCari() {
        const known = document.getElementById('bt_filter_pencarian_gudang')
            || document.querySelector('input[type="submit"][name="commit"]');
        if (known) { known.click(); return true; }

        const possible = document.querySelectorAll('button, a, input[type="submit"]');
        for (let el of possible) {
            const html = (el.innerHTML || '').toLowerCase();
            const cls = (el.className || '').toLowerCase();
            const id = (el.id || '').toLowerCase();
            if (html.includes('fa-search') || cls.includes('search') || cls.includes('cari') || id.includes('search') || id.includes('cari')) {
                el.click();
                return true;
            }
        }
        const def = document.querySelector('.btn-primary, button[type="submit"]');
        if (def) { def.click(); return true; }
        return false;
    }

    // Parse angka format tampilan Indonesia (titik = ribuan, koma = desimal), mis. "-1.234,5" -> -1234.5
    // Dipakai HANYA untuk fallback teks tampilan; data-order tetap parseFloat biasa (nilai mentah DataTables).
    function parseAngkaTampilan(teks) {
        if (teks === null || teks === undefined) return NaN;
        let t = String(teks).trim().replace(/[^\d.,-]/g, '');
        if (t === '') return NaN;
        t = t.replace(/\./g, '').replace(',', '.');
        return parseFloat(t);
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
                nilaiStok = parseFloat(dataOrder); // nilai mentah DataTables, bukan format tampilan
            }
            if (isNaN(nilaiStok)) {
                const linkEl = tdStok.querySelector('a');
                if (linkEl) nilaiStok = parseAngkaTampilan(linkEl.innerText.trim());
            }
            if (isNaN(nilaiStok)) {
                nilaiStok = parseAngkaTampilan(tdStok.innerText.trim());
            }

            if (isNaN(nilaiStok) || nilaiStok >= 0) return;

            const tdBarcode = row.querySelector('td.barcode_produk');
            const barcode = tdBarcode ? tdBarcode.innerText.trim() : '-';

            const tdNama = row.querySelector('td.nama_produk');
            const nama = tdNama ? tdNama.innerText.trim() : '-';

            hasilMinus.push({ barcode, nama, stok: Math.trunc(nilaiStok) });
        });

        return hasilMinus;
    }

    // Injeksi Tombol ke Halaman (Pojok Kanan)
    function injectButton() {
        const tabIndexProduk = document.getElementById('tab_index_produk');
        if (tabIndexProduk && !document.getElementById('rsm_btn_buka')) {
            const wrapperDiv = document.createElement('div');
            wrapperDiv.className = 'rsm_wrap_btn';

            const btn = document.createElement('button');
            btn.id = 'rsm_btn_buka';
            btn.innerHTML = '🌐 Rekap Stok Min';

            wrapperDiv.appendChild(btn);
            tabIndexProduk.insertBefore(wrapperDiv, tabIndexProduk.firstChild);

            const backdrop = document.getElementById('rsm_backdrop');
            const btnStop = document.getElementById('rsm_stop');

            btn.onclick = () => backdrop.style.display = 'flex';
            document.getElementById('rsm_close').onclick = () => { stopRequested = true; backdrop.style.display = 'none'; };
            document.getElementById('rsm_tutup').onclick = () => { stopRequested = true; backdrop.style.display = 'none'; };
            backdrop.onclick = (e) => { if (e.target === backdrop) { stopRequested = true; backdrop.style.display = 'none'; } };
            btnStop.onclick = () => { stopRequested = true; document.getElementById('rsm_status_text').innerText = "Proses dihentikan."; };

            document.getElementById('rsm_jalankan_scan').onclick = async () => {
                const statusText = document.getElementById('rsm_status_text');
                const tbody = document.querySelector('#rsm_tabel_hasil tbody');
                const btnScan = document.getElementById('rsm_jalankan_scan');

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

                // LANGKAH 1: Kosongkan dulu SEMUA filter (teks, select, radio, checkbox)
                statusText.innerText = "Mengosongkan semua filter...";
                kosongkanSemuaFilter();
                await sleep(500);

                // LANGKAH 2: Setelah semua filter kosong, baru set filter perkiraan jumlah < 0
                statusText.innerText = "Mengatur filter perkiraan jumlah < 0...";
                const filterTerSet = setFilterStokMinus();
                setTabelTampilSemua();
                await sleep(300);
                if (!filterTerSet) {
                    statusText.innerText = "⚠️ Filter stok < 0 tidak ditemukan di halaman, scan tetap jalan (filter manual via baca tabel)...";
                    await sleep(1200);
                }

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

                    await sleep(500);

                    // 3. Pastikan filter stok < 0 tetap ter-set, lalu klik tombol pencarian
                    setFilterStokMinus();
                    setTabelTampilSemua();
                    await sleep(300);
                    klikTombolCari();

                    // 4. Tunggu tabel stabil (bukan delay tetap 3.5 detik)
                    statusText.innerText = `Memproses outlet [${i + 1}/${outletsList.length}]: ${outlet.nama}... (menunggu tabel)`;
                    await tungguTabelStabil();

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
                                <td style="text-align:center"><span class="rsm_minus">${produk.stok}</span></td>
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
