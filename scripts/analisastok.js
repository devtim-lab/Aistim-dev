// ==UserScript==
// @name         Erzap - Analisa Stok
// @namespace    http://tampermonkey.net/
// @version      1.8.5
// @description  v1.8.5 - Fix modal kepotong di HP, kamera kotak berbingkai + laser, nada beep saat barcode terbaca
// @author       aistim
// @match        https://*.erzap.com/produk_gudangs/lihat_stok/new*
// @world        main
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    if (document.getElementById('az_btn')) return;

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    /* ================= CSS ================= */
    const css = `
    #az_btn{background:linear-gradient(135deg,#e63946,#b30d1c);color:#fff;border:none;
        border-radius:8px;padding:8px 18px;font:600 13px/1 'Segoe UI',Arial,sans-serif;
        cursor:pointer;box-shadow:0 2px 8px rgba(230,57,70,.4);white-space:nowrap;
        margin-left:12px;align-self:center}
    #az_btn:active{transform:scale(.95)}
    #az_overlay{display:none;position:fixed;inset:0;z-index:99998;
        background:rgba(0,0,0,.55)}
    #az_overlay.az_open{display:flex;align-items:center;justify-content:center}
    #az_modal{background:#fff;border-radius:12px;width:560px;max-width:94vw;
        max-height:92vh;display:flex;flex-direction:column;overflow:hidden;
        box-shadow:0 10px 40px rgba(0,0,0,.35);font-family:'Segoe UI',Arial,sans-serif}
    #az_head{display:flex;align-items:center;justify-content:space-between;
        background:linear-gradient(135deg,#e63946,#b30d1c);color:#fff;
        padding:12px 16px;font-weight:700;font-size:15px}
    #az_close{background:rgba(255,255,255,.2);border:none;color:#fff;
        width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:14px}
    #az_body{padding:14px 16px;overflow-y:auto}
    .az_row{margin-bottom:12px}
    .az_row>label{display:block;font-size:12px;font-weight:600;color:#444;margin-bottom:4px}
    .az_row input[type=text],.az_row select{width:100%;box-sizing:border-box;
        padding:9px 10px;border:1px solid #ccc;border-radius:8px;font-size:14px}
    .az_row input:focus,.az_row select:focus{outline:none;border-color:#e63946;
        box-shadow:0 0 0 2px rgba(230,57,70,.15)}
    #az_scan{width:100%;padding:11px;border:none;border-radius:8px;cursor:pointer;
        background:linear-gradient(135deg,#1d3557,#457b9d);color:#fff;
        font:700 14px 'Segoe UI',Arial,sans-serif}
    #az_scan:active{transform:scale(.98)}
    #az_scan:disabled{opacity:.6}
    /* hasil */
    #az_hasil{margin-top:14px}
    #az_info{font-size:12px;color:#666;margin-bottom:6px}
    #az_tbl{width:100%;border-collapse:collapse;font-size:12px}
    #az_tbl td{padding:7px 6px;border-bottom:1px solid #eee;vertical-align:top}
    #az_tbl tr:nth-child(even) td{background:#f9f9f9}
    .az-minus{color:#e63946;font-weight:700}
    .az-harga{color:#b58900;font-weight:600;white-space:nowrap}
    .az-nama{word-break:break-word}
    .az-stok-link{cursor:pointer;color:#1d3557;font-weight:700;text-decoration:underline}
    .az-stok-link:hover{color:#e63946}
    /* panel analisa aktifitas */
    #az_analisa{margin-top:14px}
    .az_analisa_box{border:1px solid #f0c36d;background:#fffdf5;
        border-radius:8px;padding:10px 12px;margin-bottom:10px}
    .az_analisa_box h4{margin:0 0 8px;font-size:13px;color:#8a5a00}
    .az_chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
    .az_chip{background:#fff;border:1px solid #f0c36d;border-radius:20px;
        padding:4px 10px;font-size:11px;font-weight:600;color:#555}
    .az_chip b{color:#1d3557}
    .az_chip_red b{color:#e63946}
    .az_chip_green b{color:#2a9d3f}
    .az_jenis_tbl{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px}
    .az_jenis_tbl td{padding:5px 6px;border-bottom:1px solid #f0e6cc}
    .az_trx_wrap{max-height:180px;overflow:auto;border:1px solid #f0e6cc;border-radius:6px}
    .az_trx_tbl{width:100%;border-collapse:collapse;font-size:11px}
    .az_trx_tbl td{padding:5px 6px;border-bottom:1px solid #f2f2f2;vertical-align:top}
    .az_out{color:#e63946;font-weight:700;white-space:nowrap}
    .az_in{color:#2a9d3f;font-weight:700;white-space:nowrap}
    /* semua header tabel di modal = MERAH + shadow merah */
    #az_tbl th,.az_trx_tbl th,.az_jenis_tbl th{
        background:linear-gradient(135deg,#e63946,#b30d1c) !important;
        color:#fff !important;
        text-align:left;
        box-shadow:0 3px 6px rgba(230,57,70,.45);
        border:1px solid #b30d1c}
    #az_tbl th{padding:7px 6px;position:sticky;top:0}
    .az_trx_tbl th{padding:5px 6px;position:sticky;top:0}
    .az_jenis_tbl th{padding:5px 6px}
    /* barcode input + tombol scan kamera */
    #az_barcode_wrap{display:flex;gap:6px;align-items:stretch}
    #az_barcode_wrap input{flex:1;min-width:0}
    #az_btn_barcode{flex:0 0 auto;width:44px;border:1px solid #ccc;border-radius:8px;
        background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;
        padding:0;color:#1d3557}
    #az_btn_barcode:active{transform:scale(.93);background:#f0f0f0}
    #az_btn_barcode svg{width:24px;height:24px}
    /* overlay kamera scanner */
    #az_cam_overlay{display:none;position:fixed;inset:0;z-index:999999;
        background:rgba(0,0,0,.85);align-items:center;justify-content:center}
    #az_cam_box{background:#111;border-radius:14px;overflow:hidden;width:420px;max-width:92vw;
        max-height:86vh;max-height:86dvh;
        border:3px solid #e63946;box-shadow:0 0 0 4px rgba(255,255,255,.12),0 12px 40px rgba(0,0,0,.6);
        display:flex;flex-direction:column;font-family:'Segoe UI',Arial,sans-serif}
    #az_cam_head{display:flex;align-items:center;justify-content:space-between;
        background:linear-gradient(135deg,#e63946,#b30d1c);color:#fff;
        padding:10px 14px;font-weight:700;font-size:14px}
    #az_cam_close{background:rgba(255,255,255,.2);border:none;color:#fff;
        width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:14px}
    #az_cam_video{width:100%;aspect-ratio:4/3;background:#000;object-fit:cover}
    #az_cam_status{padding:10px 14px;color:#ddd;font-size:12px;text-align:center}
    /* ===== ANIMASI VIEWFINDER SCANNER ===== */
    #az_cam_overlay{animation:azFadeIn .25s ease}
    #az_cam_box{animation:azPopIn .3s cubic-bezier(.2,1.4,.4,1)}
    @keyframes azFadeIn{from{opacity:0}to{opacity:1}}
    @keyframes azPopIn{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:scale(1)}}
    #az_cam_view{position:relative;overflow:hidden}
    /* sudut-sudut viewfinder */
    .az_corner{position:absolute;width:34px;height:34px;border:3px solid #e63946;
        z-index:2;animation:azCornerPulse 2s ease-in-out infinite}
    .az_corner.tl{top:12px;left:12px;border-right:none;border-bottom:none;border-radius:8px 0 0 0}
    .az_corner.tr{top:12px;right:12px;border-left:none;border-bottom:none;border-radius:0 8px 0 0}
    .az_corner.bl{bottom:12px;left:12px;border-right:none;border-top:none;border-radius:0 0 0 8px}
    .az_corner.br{bottom:12px;right:12px;border-left:none;border-top:none;border-radius:0 0 8px 0}
    @keyframes azCornerPulse{0%,100%{opacity:1}50%{opacity:.45}}
    /* garis laser scan bergerak naik-turun */
    #az_laser{position:absolute;left:8%;right:8%;height:3px;z-index:2;
        background:linear-gradient(90deg,transparent,#e63946 20%,#ff6b78 50%,#e63946 80%,transparent);
        border-radius:3px;box-shadow:0 0 12px 3px rgba(230,57,70,.7);
        animation:azLaser 2.2s ease-in-out infinite}
    @keyframes azLaser{0%,100%{top:12%}50%{top:85%}}
    /* area bidik semi-transparan di tengah */
    #az_reticle{position:absolute;left:8%;right:8%;top:25%;bottom:25%;z-index:1;
        border:1px dashed rgba(255,255,255,.35);border-radius:10px;
        animation:azReticle 2.2s ease-in-out infinite}
    @keyframes azReticle{0%,100%{border-color:rgba(255,255,255,.35)}50%{border-color:rgba(230,57,70,.8)}}
    /* flash hijau saat barcode berhasil terbaca */
    #az_cam_view.az_success::after{content:'';position:absolute;inset:0;z-index:3;
        background:rgba(42,157,63,.45);animation:azSuccess .5s ease}
    #az_cam_view.az_success #az_laser{animation:none;top:50%;background:#2a9d3f;
        box-shadow:0 0 16px 4px rgba(42,157,63,.8)}
    @keyframes azSuccess{from{opacity:0}to{opacity:1}}
    /* ===== RESPONSIF MOBILE ===== */
    @media (max-width:600px){
        /* 100dvh = tinggi viewport real di HP (tidak kepotong toolbar browser) */
        #az_modal{width:100vw;max-width:100vw;height:100vh;height:100dvh;
            max-height:100vh;max-height:100dvh;border-radius:0}
        #az_body{padding:12px}
        /* baris barcode+outlet jadi vertikal */
        .az_row[style*="display:flex"]{flex-direction:column;gap:12px !important}
        /* input 16px supaya HP tidak auto-zoom saat fokus */
        .az_row input[type=text],.az_row select{font-size:16px !important;padding:12px 10px}
        #az_btn_barcode{width:52px}
        /* tombol scan besar & mudah disentuh */
        #az_scan{padding:14px;font-size:16px}
        /* tabel lebih rapat di layar kecil */
        #az_tbl{font-size:11px}
        #az_tbl td,#az_tbl th{padding:5px 4px}
        .az_trx_tbl,.az_jenis_tbl{font-size:10px}
        .az_chip{font-size:10px;padding:4px 8px}
        /* tombol Analisa utama lebih kecil di HP */
        #az_btn{padding:7px 12px;font-size:12px;margin-left:6px}
        /* kamera: tetap kotak berbingkai di HP (tidak full layar) */
        #az_cam_box{width:92vw;max-width:92vw}
        #az_cam_view{display:flex;flex-direction:column}
        #az_cam_video{aspect-ratio:3/4}
    }
    /* desktop lebar: modal sedikit lebih lega */
    @media (min-width:900px){
        #az_modal{width:640px}
    }`;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    /* ================= HTML ================= */
    const wrap = document.createElement('div');
    wrap.innerHTML = `
    <div id="az_overlay">
      <div id="az_modal">
        <div id="az_head"><span>📊 Analisa Stok</span><button id="az_close">✕</button></div>
        <div id="az_body">
          <div class="az_row" style="display:flex;gap:10px">
            <div style="flex:1.4;min-width:0">
              <label>Barcode</label>
              <div id="az_barcode_wrap">
                <input type="text" id="az_barcode" placeholder="Scan / ketik barcode lalu Enter" autocomplete="off" inputmode="numeric">
                <button type="button" id="az_btn_barcode" title="Scan barcode dengan kamera">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
                    <line x1="7" y1="8" x2="7" y2="16"/><line x1="10.5" y1="8" x2="10.5" y2="16"/>
                    <line x1="13.5" y1="8" x2="13.5" y2="16"/><line x1="17" y1="8" x2="17" y2="16"/>
                  </svg>
                </button>
              </div>
            </div>
            <div style="flex:1;min-width:0">
              <label>Outlet (kosong = semua)</label>
              <select id="az_outlet"><option value="">-- Semua outlet --</option></select>
            </div>
          </div>
          <!-- Perkiraan Jumlah: hidden, tetap dipakai internal (< 0) -->
          <div class="az_row" style="display:none">
            <label>Perkiraan Jumlah</label>
            <div style="display:flex;gap:6px">
              <select id="az_cmp" style="flex:0 0 80px">
                <option value="<" selected>&lt;</option>
                <option value=">">&gt;</option>
                <option value="<=">&lt;=</option>
                <option value=">=">&gt;=</option>
                <option value="=">=</option>
                <option value="!=">!=</option>
              </select>
              <input type="text" id="az_jml" value="0" style="flex:1" autocomplete="off">
            </div>
          </div>
          <button type="button" id="az_scan">🔍 SCAN / CARI</button>
          <div id="az_hasil"></div>
          <div id="az_analisa"></div>
        </div>
      </div>
    </div>
    <div id="az_cam_overlay">
      <div id="az_cam_box">
        <div id="az_cam_head"><span>📷 Scan Barcode</span><button id="az_cam_close">✕</button></div>
        <div id="az_cam_view">
          <video id="az_cam_video" playsinline muted></video>
          <div class="az_corner tl"></div><div class="az_corner tr"></div>
          <div class="az_corner bl"></div><div class="az_corner br"></div>
          <div id="az_reticle"></div>
          <div id="az_laser"></div>
        </div>
        <div id="az_cam_status">Arahkan kamera ke barcode...</div>
      </div>
    </div>`;
    document.body.appendChild(wrap);

    // Tombol Analisa → tepat di samping kanan <h1> "Lihat Stok..."
    const azBtn = document.createElement('button');
    azBtn.id = 'az_btn';
    azBtn.textContent = '📊 Analisa';
    const h1Judul = Array.from(document.querySelectorAll('h1')).find(h => h.textContent.includes('Lihat Stok'));
    const headBox = h1Judul ? h1Judul.parentElement : null;
    if (headBox) {
        headBox.style.display = 'flex';
        headBox.style.alignItems = 'center';
        headBox.appendChild(azBtn);
    } else {
        azBtn.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999';
        document.body.appendChild(azBtn);
    }

    /* ================= DATA OUTLET ================= */
    const outlets = [];
    $('#checkbox_outlet .checkbox_list_outlets').each(function () {
        const nama = $(this).nextAll('span').first().text().trim();
        if (nama) outlets.push({ id: $(this).val(), nama: nama });
    });

    const selOutlet = $('#az_outlet');
    outlets.forEach(o => {
        selOutlet.append(`<option value="${o.id}">${o.nama}</option>`);
    });

    /* ================= EVENT ================= */
    let lastCari = '';
    let renderTimer = null;
    let autoToken = '';

    $('#az_btn').on('click', function () {
        $('#az_overlay').addClass('az_open');
        $('#az_hasil').html('');
        $('#az_barcode').trigger('focus');
    });
    $('#az_close').on('click', closeModal);
    $('#az_overlay').on('click', function (e) { if (e.target === this) closeModal(); });
    function closeModal() { $('#az_overlay').removeClass('az_open'); }

    $('#az_barcode').on('keydown', function (e) { if (e.key === 'Enter') doScan(); });
    $('#az_scan').on('click', doScan);

    /* ================= SCAN BARCODE VIA KAMERA ================= */
    let camStream = null;
    let camScanning = false;

    // Nada beep sukses (Web Audio API — tanpa file eksternal, aman dari CSP)
    function playBeepSukses() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g);
            g.connect(ctx.destination);
            o.type = 'sine';
            // Nada ganda: bip-bip naik (seperti scanner kasir)
            o.frequency.setValueAtTime(880, ctx.currentTime);
            o.frequency.setValueAtTime(1318, ctx.currentTime + 0.09);
            g.gain.setValueAtTime(0.3, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
            o.start();
            o.stop(ctx.currentTime + 0.3);
            o.onended = () => ctx.close();
        } catch (e) { /* audio tidak tersedia, abaikan */ }
    }

    function stopCamScanner() {
        camScanning = false;
        if (camStream) {
            camStream.getTracks().forEach(t => t.stop());
            camStream = null;
        }
        const ov = document.getElementById('az_cam_overlay');
        if (ov) ov.style.display = 'none';
    }

    async function startCamScanner() {
        const overlay = document.getElementById('az_cam_overlay');
        const video = document.getElementById('az_cam_video');
        const status = document.getElementById('az_cam_status');
        overlay.style.display = 'flex';

        // Cek dukungan API native (Chrome Android & desktop modern)
        if (!('BarcodeDetector' in window)) {
            status.textContent = '⚠️ Browser tidak support scan kamera. Ketik manual atau pakai scanner USB/Bluetooth.';
            return;
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            status.textContent = '⚠️ Kamera tidak tersedia di browser ini.';
            return;
        }

        status.textContent = 'Membuka kamera...';
        try {
            camStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }, // kamera belakang di HP
                audio: false
            });
            video.srcObject = camStream;
            await video.play();
            status.textContent = 'Arahkan kamera ke barcode...';

            const detector = new BarcodeDetector({
                formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code', 'codabar', 'itf']
            });

            camScanning = true;
            const tick = async () => {
                if (!camScanning) return;
                try {
                    const codes = await detector.detect(video);
                    if (codes && codes.length > 0) {
                        const val = codes[0].rawValue;
                        camScanning = false;
                        playBeepSukses(); // nada bip-bip saat barcode ketemu
                        // Animasi sukses: flash hijau + laser berhenti di tengah
                        const view = document.getElementById('az_cam_view');
                        if (view) view.classList.add('az_success');
                        status.textContent = '✅ Barcode terbaca: ' + val;
                        setTimeout(() => {
                            stopCamScanner();
                            if (view) view.classList.remove('az_success');
                            $('#az_barcode').val(val);
                            doScan(); // langsung cari setelah barcode terbaca
                        }, 650);
                        return;
                    }
                } catch (e) { /* frame belum siap, lanjut */ }
                setTimeout(tick, 250);
            };
            tick();
        } catch (e) {
            status.textContent = '⚠️ Kamera gagal dibuka: ' + (e.message || e.name) + '. Pastikan izin kamera diberikan.';
        }
    }

    document.getElementById('az_btn_barcode').addEventListener('click', startCamScanner);
    document.getElementById('az_cam_close').addEventListener('click', stopCamScanner);
    document.getElementById('az_cam_overlay').addEventListener('click', function (e) {
        if (e.target === this) stopCamScanner();
    });

    /* ================= SCAN ================= */
    function doScan() {
        const cari = $('#az_barcode').val().trim();
        const outletId = $('#az_outlet').val();
        const cmp = $('#az_cmp').val();
        const jml = $('#az_jml').val().trim();

        if (!cari) { alert('Isi barcode dulu.'); return; }
        lastCari = cari;
        autoToken = '';

        $('#az_hasil').html('<div id="az_info">⏳ Mencari data...</div>');
        $('#az_analisa').html('');
        $('#az_scan').prop('disabled', true);
        clearTimeout(renderTimer);

        // 1) Bersihkan sisa filter manual di sidebar
        $('#pencarian_sn').val('');
        $('#pencarian_tmp_no_batch').val('');
        $('#pencarian_idproduk_kategori').val('');
        $('#produk_kategori_nama').val('');
        $('#pencarian_idproduk_sub_kategori').val('');
        $('#produk_sub_kategori_nama').val('');
        $('#pencarian_idproduk_merek').val('');
        $('#produk_merek_nama').val('');
        $('#pencarian_idwarna').val('');
        $('#warna_nama').val('');
        $('#pencarian_idproduk_ukuran').val('');
        $('#produk_ukuran_nama').val('');
        $('#pencarian_idproduk_satuan').val('');
        $('#produk_satuan_nama').val('');
        $('#pencarian_idsupplier').val('');
        $('#pencarian_idoutlet').val('');
        $('#pencarian_nama_supplier').val('');
        $('#pencarian_umur_produk').val('');
        $('#pencarian_perbandingan_umur_produk').val('');

        // 2) Isi form pencarian
        $('#pencarian_nama').val(cari);
        $('#pencarian_idgudang').val('');
        $('#pencarian_perbandingan_jumlah').val(cmp);
        $('#pencarian_jumlah').val(jml);

        // 3) Outlet: terpilih = hanya itu, kosong = semua
        const boxes = $('.checkbox_list_outlets');
        boxes.prop('checked', !outletId);
        if (outletId) $('#outlet_list_' + outletId).prop('checked', true);

        // 4) Klik tombol Cari
        setTimeout(function () {
            $('#cari').click();
            renderTimer = setTimeout(renderHasil, 3000);
        }, 200);
    }

    // Tangkap hasil filter (jalur 1: ajaxComplete)
    $(document).ajaxComplete(function (e, xhr, settings) {
        if (settings.url && settings.url.indexOf('/produk_gudangs/lihat_stok/new') !== -1) {
            renderHasil();
        }
        // Jalur manual: dialog Aktifitas Stok dibuka sendiri oleh user
        if (settings.url && settings.url.indexOf('/produk_gudangs/aktifitas_stok/new') !== -1) {
            setTimeout(renderAnalisaManual, 500);
        }
    });

    // Tangkap hasil filter (jalur 2: event remote form Rails UJS)
    $(document).on('ajax:success', '#form_pencarian_lihat_stok', function () {
        clearTimeout(renderTimer);
        renderTimer = setTimeout(renderHasil, 300);
    });

    function getMatchedRows() {
        let rows = $('#data_table_produk tbody tr');
        if (/^\d+$/.test(lastCari)) {
            rows = rows.filter(function () {
                return $(this).find('td').eq(1).text().trim() === lastCari;
            });
        }
        return rows;
    }

    function renderHasil() {
        $('#az_scan').prop('disabled', false);
        clearTimeout(renderTimer);
        const rows = getMatchedRows();

        if ($('#data_table_produk tbody tr').length === 0) {
            renderTimer = setTimeout(renderHasil, 800);
            return;
        }

        let html = `<div id="az_info">Menampilkan <b>${rows.length}</b> data (stok ${$('#az_cmp').val()} ${$('#az_jml').val()})</div>`;

        if (rows.length === 0) {
            html += `<div id="az_info" style="color:#e63946">❌ Data tidak ditemukan.</div>`;
            $('#az_hasil').html(html);
            return;
        }

        html += `<div style="overflow:auto;max-height:35vh;border:1px solid #ddd;border-radius:8px">
        <table id="az_tbl">
          <thead><tr>
            <th>Barcode</th><th>Nama</th><th>Harga Jual</th><th>Total Stok</th><th>Umur</th><th>Merek</th>
          </tr></thead><tbody>`;

        rows.each(function () {
            const td = $(this).find('td');
            const barcode = td.eq(1).text().trim();
            const nama = td.eq(2).text().trim();
            const harga = td.eq(3).clone().children('br').remove().end().text().trim().replace(/\s+/g, ' ');
            const stok = td.eq(4).text().trim();
            const umur = td.eq(6).text().trim();
            const merek = td.eq(7).text().trim();
            const clsStok = parseFloat(stok) < 0 ? 'az-minus' : '';
            html += `<tr>
                <td>${barcode}</td>
                <td class="az-nama">${nama}</td>
                <td class="az-harga">${harga}</td>
                <td class="${clsStok}"><span class="az-stok-link" data-barcode="${barcode}">${stok}</span></td>
                <td>${umur}</td>
                <td>${merek}</td>
            </tr>`;
        });

        html += `</tbody></table></div>`;
        $('#az_hasil').html(html);

        // Analisa otomatis (sekali per scan, maks 3 produk)
        const token = lastCari + '|' + rows.length;
        if (autoToken !== token && rows.length > 0) {
            autoToken = token;
            setTimeout(autoAnalisa, 600);
        }
    }

    /* ============================================================ */
    /* KLIK STOK → DETAIL GUDANG → AKTIFITAS (manual, tetap ada)    */
    /* ============================================================ */
    let modalSuspended = false;

    $(document).on('click', '.az-stok-link', function () {
        const barcode = $(this).data('barcode');

        const $cell = $('#data_table_produk tbody tr').filter(function () {
            return $(this).find('td').eq(1).text().trim() === String(barcode);
        }).first().find('td.bt_dialog_aktifitas_stok');

        if ($cell.length === 0) {
            alert('Baris produk tidak ditemukan di tabel utama.');
            return;
        }

        modalSuspended = true;
        $('#az_overlay').hide();
        $cell.trigger('click');
    });

    setInterval(function () {
        if (!modalSuspended) return;
        const popUpHidden = $('#div_pop_up_detail_stok').is(':hidden');
        const dialogClosed = !$('#dialog_form_aktifitas_stok').is(':visible');
        if (popUpHidden && dialogClosed) {
            modalSuspended = false;
            $('#az_overlay').show();
        }
    }, 500);

    /* ============================================================ */
    /* PARSER AKTIFITAS + RENDER PANEL (dipakai manual & otomatis)  */
    /* ============================================================ */
    function parseAktifitasRows($scope) {
        const rows = $scope.find('table tbody tr').filter(function () {
            return $(this).find('td').length >= 7 && $(this).find('.dataTables_empty').length === 0;
        });
        if (rows.length === 0) return null;

        let totalTrx = 0, totalKeluar = 0, totalMasuk = 0;
        let jualCount = 0, jualQty = 0;
        const perJenis = {};
        const listTrx = [];

        rows.each(function () {
            const td = $(this).find('td');
            const tanggal = td.eq(0).text().trim();
            const kode = td.eq(1).text().trim();
            const jenis = td.eq(2).text().trim();
            const jmlText = td.eq(4).text().trim();
            const keterangan = td.eq(6).text().trim();
            const operator = td.eq(7).length ? td.eq(7).text().trim() : '';

            const m = jmlText.match(/([+-])\s*([\d.,]+)/);
            const qty = m ? parseFloat(m[2].replace(',', '.')) : 0;
            const isKeluar = m ? (m[1] === '-') : false;

            totalTrx++;
            if (isKeluar) totalKeluar += qty; else totalMasuk += qty;

            if (!perJenis[jenis]) perJenis[jenis] = { count: 0, qty: 0 };
            perJenis[jenis].count++;
            perJenis[jenis].qty += qty;

            if (/^penjualan$/i.test(jenis)) { jualCount++; jualQty += qty; }

            listTrx.push({ tanggal, kode, jenis, jmlText, keterangan, operator, isKeluar });
        });

        const stokAkhir = rows.first().find('td').eq(5).text().trim();
        return { totalTrx, totalKeluar, totalMasuk, jualCount, jualQty, perJenis, listTrx, stokAkhir };
    }

    function analisaSectionHtml(a, gudang, barcode, nama) {
        let html = `<div class="az_analisa_box">
            <h4>📈 ${barcode} — ${gudang}</h4>`;
        if (nama) {
            html = `<div class="az_analisa_box">
            <h4>📈 ${barcode} — ${nama}<br><span style="font-weight:400;font-size:11px">${gudang}</span></h4>`;
        }

        html += `<div class="az_chips">
            <span class="az_chip">Transaksi: <b>${a.totalTrx}</b></span>
            <span class="az_chip az_chip_red">Keluar: <b>-${a.totalKeluar}</b></span>
            <span class="az_chip az_chip_green">Masuk: <b>+${a.totalMasuk}</b></span>
            <span class="az_chip">Stok Akhir: <b>${a.stokAkhir}</b></span>
            <span class="az_chip">Penjualan: <b>${a.jualCount}x</b> (${a.jualQty} pcs)</span>
        </div>`;

        html += `<table class="az_jenis_tbl">
            <thead><tr><th>Jenis</th><th style="width:80px;text-align:center">Jml Trx</th><th style="width:80px;text-align:right">Total Qty</th></tr></thead>
            <tbody>`;
        Object.keys(a.perJenis).forEach(j => {
            html += `<tr><td>${j}</td><td style="text-align:center">${a.perJenis[j].count}</td><td style="text-align:right">${a.perJenis[j].qty}</td></tr>`;
        });
        html += `</tbody></table>`;

        html += `<div class="az_trx_wrap"><table class="az_trx_tbl">
            <thead><tr><th>Tanggal</th><th>Kode</th><th>Jenis</th><th>Jml</th><th>Keterangan</th><th>Operator</th></tr></thead>
            <tbody>`;
        a.listTrx.forEach(t => {
            const cls = t.isKeluar ? 'az_out' : 'az_in';
            html += `<tr>
                <td style="white-space:nowrap">${t.tanggal}</td>
                <td>${t.kode}</td>
                <td>${t.jenis}</td>
                <td class="${cls}">${t.jmlText}</td>
                <td>${t.keterangan}</td>
                <td>${t.operator}</td>
            </tr>`;
        });
        html += `</tbody></table></div></div>`;
        return html;
    }

    // Jalur manual: baca dari dialog Aktifitas yang sedang terbuka
    function renderAnalisaManual() {
        const $t = $('#target_aktifitas_aktifitas_stok');
        if ($t.length === 0) return;
        const a = parseAktifitasRows($t);
        if (!a) return;
        const gudang = ($('#gudang_aktifitas').text() || '').trim();
        const barcode = ($('#barcode_produk_aktifitas').text() || '').trim();
        const nama = ($('#nama_produk_aktifitas').text() || '').trim();
        $('#az_analisa').html(analisaSectionHtml(a, gudang, barcode, nama));
    }

    /* ============================================================ */
    /* ANALISA OTOMATIS PER GUDANG                                  */
    /* ============================================================ */
    async function autoAnalisa() {
        const rows = getMatchedRows();
        if (rows.length === 0) return;

        $('#az_analisa').html('<div class="az_analisa_box"><h4>⏳ Menganalisa aktifitas gudang...</h4></div>');

        const rowsArr = rows.slice(0, 3).toArray();
        const sections = [];

        for (const row of rowsArr) {
            const $row = $(row);
            const td = $row.find('td');
            const barcode = td.eq(1).text().trim();
            const nama = td.eq(2).text().trim();
            const $cell = $row.find('td.bt_dialog_aktifitas_stok');
            const idproduk = $cell.data('prd');
            const idoutlet = $cell.data('otl');

            try {
                const detailHtml = await $.ajax({
                    url: '/produk_gudangs/detail_stok/new',
                    dataType: 'text',
                    data: { idproduk: idproduk, idgudang: '', idoutlet: idoutlet }
                });
                const $detail = $('<div>').html(detailHtml);

                const gudangs = [];
                $detail.find('.bt_detail_stok_aktifitas').each(function () {
                    gudangs.push({
                        id: $(this).data('gdn'),
                        nama: $(this).data('gudang-nama') || ''
                    });
                });
                if (gudangs.length === 0) {
                    gudangs.push({ id: $cell.data('gdn') || '', nama: '(gudang tunggal)' });
                }

                for (const g of gudangs) {
                    try {
                        const aktHtml = await $.ajax({
                            url: '/produk_gudangs/aktifitas_stok/new',
                            dataType: 'text',
                            data: {
                                idproduk: idproduk,
                                idgudang: g.id,
                                idoutlet: idoutlet,
                                hide_stok_awal_stok_akhir: $('#hide_stok_awal_stok_akhir').val() || 'false'
                            }
                        });
                        const a = parseAktifitasRows($('<div>').html(aktHtml));
                        if (a) {
                            sections.push(analisaSectionHtml(a, g.nama || g.id, barcode, nama));
                        }
                    } catch (e) { /* gudang tanpa aktifitas, lanjut */ }
                    await sleep(400);
                }
            } catch (e) {
                console.log('autoAnalisa error:', e);
            }
        }

        if (sections.length > 0) {
            $('#az_analisa').html(sections.join(''));
        } else {
            $('#az_analisa').html('<div class="az_analisa_box"><h4>ℹ️ Tidak ada data aktifitas.</h4></div>');
        }
    }
})();
