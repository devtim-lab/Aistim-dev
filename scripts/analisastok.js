// ==UserScript==
// @name         Erzap - Analisa Stok
// @namespace    http://tampermonkey.net/
// @version      1.20.3
// @description  v1.20.3 - fix: panel Analisa Aktifitas otomatis (autoAnalisa) sekarang scroll dulu sebelum baca tabel Aktifitas Stok, sama seperti dialog manual — sebelumnya cuma baca halaman pertama karena tabelnya lazy-load pas di-scroll
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
        padding:10px 14px;font-weight:700;font-size:14px}
    #az_close{background:rgba(255,255,255,.2);border:none;color:#fff;
        width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:14px}
    #az_body{padding:12px 14px;overflow-y:auto;overflow-x:hidden}
    .az_row{margin-bottom:9px}
    .az_row>label{display:block;font-size:12px;font-weight:600;color:#444;margin-bottom:4px}
    .az_row input[type=text],.az_row select{width:100%;box-sizing:border-box;
        padding:7px 9px;border:1px solid #ccc;border-radius:8px;font-size:13px}
    .az_row input:focus,.az_row select:focus{outline:none;border-color:#e63946;
        box-shadow:0 0 0 2px rgba(230,57,70,.15)}
    #az_scan{width:100%;padding:9px;border:none;border-radius:8px;cursor:pointer;
        background:linear-gradient(135deg,#e63946,#b30d1c);color:#fff;box-shadow:0 2px 8px rgba(230,57,70,.4);
        font:700 13px 'Segoe UI',Arial,sans-serif}
    #az_scan:active{transform:scale(.98)}
    #az_scan:disabled{opacity:.6;cursor:not-allowed}
    .az_row input[type=text]:disabled{background:#f3f3f3;color:#999;cursor:not-allowed}
    #az_btn_barcode:disabled{opacity:.5;cursor:not-allowed}
    #az_outlet.az_belum{border-color:#e63946;background:#fff5f5}
    #az_langkah{font-size:11px;color:#777;margin:-4px 0 8px}
    /* toggle switch filter stok minus */
    .az_switch{width:42px;height:24px;border-radius:20px;background:#ccc;position:relative;
        cursor:pointer;transition:background .2s;flex:0 0 auto;align-self:center}
    .az_switch.on{background:#e63946}
    .az_knob{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;
        background:#fff;transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.35)}
    .az_switch.on .az_knob{left:21px}
    /* hasil */
    #az_hasil{margin-top:14px}
    #az_info{font-size:12px;color:#666;margin-bottom:6px}
    #az_tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:12px}
    #az_tbl td{padding:7px 6px;border-bottom:1px solid #eee;vertical-align:top}
    #az_tbl tr:nth-child(even) td{background:#f9f9f9}
    .az-minus{color:#e63946;font-weight:700}
    .az-plus{color:#2a9d3f;font-weight:700}
    #az_tbl td.az-stok-cell{text-align:center}
    .az-harga{color:#b58900;font-weight:600;white-space:nowrap}
    .az-nama{word-break:break-word}
    .az-stok-link{cursor:pointer;color:#1d3557;font-weight:700;text-decoration:underline}
    .az-stok-link:hover{color:#e63946}
    .az-gudang{white-space:nowrap;font-size:11px;color:#333}
    .az-gudang div{padding:1px 0}
    .az-gudang b{color:#1d3557}
    .az-gudang .az-outlet{font-weight:700;color:#555;margin-top:3px}
    .az-gudang .az-gdn{padding-left:8px}
    .az-gudang .az-minus{color:#e63946}
    .az-gudang .az-muted{color:#999}
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
    .az_jenis_wrap{overflow-x:auto;margin-bottom:8px;border:1px solid #f0e6cc;border-radius:6px}
    .az_jenis_tbl{width:100%;border-collapse:collapse;font-size:11px}
    .az_jenis_tbl td{padding:5px 6px;border-bottom:1px solid #f0e6cc;white-space:nowrap}
    .az_trx_wrap{max-height:180px;overflow:auto;border:1px solid #f0e6cc;border-radius:6px}
    .az_trx_tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:11px}
    .az_trx_tbl td{padding:5px 6px;border-bottom:1px solid #f2f2f2;vertical-align:top;white-space:nowrap}
    .az_out{color:#e63946;font-weight:700;white-space:nowrap}
    .az_in{color:#2a9d3f;font-weight:700;white-space:nowrap}
    /* semua header tabel di modal = MERAH + shadow merah */
    #az_tbl th,.az_trx_tbl th,.az_jenis_tbl th{
        background-color:#e63946 !important;background:linear-gradient(135deg,#e63946,#b30d1c) !important;
        color:#fff !important;
        text-align:left;
        box-shadow:0 3px 6px rgba(230,57,70,.45);
        border:1px solid #b30d1c}
    #az_tbl th{padding:7px 6px;position:sticky;top:0;z-index:5}
    .az_trx_tbl th{padding:5px 6px;position:sticky;top:0;z-index:5}
    .az_jenis_tbl th{padding:5px 6px}
    /* barcode input + tombol scan kamera */
    #az_barcode_wrap{display:flex;gap:6px;align-items:stretch}
    #az_barcode_wrap input{flex:1;min-width:0}
    #az_btn_barcode{flex:0 0 auto;width:40px;border:1px solid #ccc;border-radius:8px;
        background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;
        padding:0;color:#1d3557}
    #az_btn_barcode:active{transform:scale(.93);background:#f0f0f0}
    #az_btn_barcode svg{width:22px;height:22px}
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
        .az_row input[type=text],.az_row select{font-size:16px !important;padding:10px}
        #az_btn_barcode{width:46px}
        /* tombol scan besar & mudah disentuh */
        #az_scan{padding:12px;font-size:15px}
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
                <input type="text" id="az_barcode" placeholder="Pilih outlet dulu" autocomplete="off" inputmode="numeric" disabled>
                <button type="button" id="az_btn_barcode" title="Scan barcode dengan kamera" disabled>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
                    <line x1="7" y1="8" x2="7" y2="16"/><line x1="10.5" y1="8" x2="10.5" y2="16"/>
                    <line x1="13.5" y1="8" x2="13.5" y2="16"/><line x1="17" y1="8" x2="17" y2="16"/>
                  </svg>
                </button>
              </div>
            </div>
            <div style="flex:1;min-width:0">
              <label>Outlet (pilih dulu)</label>
              <div style="display:flex;gap:6px;align-items:center">
                <select id="az_outlet" class="az_belum" style="flex:1;min-width:0"><option value="">-- Pilih outlet --</option><option value="all">Semua outlet</option></select>
                <div style="display:flex;flex-direction:column;align-items:center;gap:1px;flex:0 0 auto">
                  <div id="az_toggle_minus" class="az_switch on" title="Aktif = hanya stok < 0, Nonaktif = semua stok">
                    <div class="az_knob"></div>
                  </div>
                  <span style="font-size:9px;color:#888;white-space:nowrap">Stok &lt; 0</span>
                </div>
              </div>
            </div>
          </div>
          <div id="az_langkah">Pilih outlet dulu. Barcode & tombol CARI aktif setelah outlet dipilih.</div>
          <!-- Tombol cari full width -->
          <div class="az_row" style="margin-bottom:0">
            <button type="button" id="az_scan" disabled>🔍 CARI</button>
          </div>
          <!-- Nilai internal perkiraan jumlah (hidden) -->
          <input type="hidden" id="az_cmp" value="<">
          <input type="hidden" id="az_jml" value="0">
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

    /* ================= DATA OUTLET (dinamis, tanpa hardcode) ================= */
    // Dropdown Outlet dimulai kosong, terisi otomatis dari nama yang muncul
    // di kolom Gudang (lihat pastikanOutletDiDropdown). Id numerik cuma kepakai
    // kalau nanti ketemu sumber id resmi (misal dari checkbox sidebar) — untuk
    // sekarang value opsi = nama outlet itu sendiri.
    const OUTLETS = [];
    const OUTLET_NAMA = {};
    const OUTLET_ID = {}; // reverse: nama -> id (buat resolve id kalau nama sudah dikenal)

    const selOutlet = $('#az_outlet');

    // Outlet diisi SEJAK AWAL dari checkbox sidebar halaman (.checkbox_list_outlets / #outlet_list_<id>),
    // supaya user bisa pilih outlet dulu sebelum scan. Nama outlet ada di <span> tepat setelah
    // checkbox (nextElementSibling) — pola yang sama dipakai rekapstokmin.js, TERBUKTI jalan di
    // halaman ini. Bukan di <label for>, dan .parent().text() salah karena semua checkbox+span
    // ada rata sebagai sibling dalam satu wadah yang sama (bisa kebawa nama outlet lain).
    function isiOutletDariSidebar() {
        $('.checkbox_list_outlets').each(function () {
            const $cb = $(this);
            const idm = String($cb.attr('id') || '').match(/outlet_list_(\d+)/);
            const id = idm ? idm[1] : ($cb.val() || '');
            if (!id) return;
            let nama = '';
            const sib = this.nextElementSibling;
            if (sib && sib.tagName === 'SPAN') nama = sib.innerText.trim();
            if (!nama && $cb.attr('id')) nama = $('label[for="' + $cb.attr('id') + '"]').text().trim();
            nama = nama.replace(/\s+/g, ' ').trim();
            if (!nama || OUTLET_NAMA[id] !== undefined) return;
            OUTLETS.push([id, nama]);
            OUTLET_NAMA[id] = nama;
            OUTLET_ID[nama] = id;
            selOutlet.append($('<option>').val(id).text(nama));
        });
        console.log('[AnalisaStok] outlet dari sidebar:', OUTLETS.length, OUTLETS);
    }
    isiOutletDariSidebar();
    if (OUTLETS.length === 0) setTimeout(isiOutletDariSidebar, 1500); // sidebar kadang dirender belakangan

    // Outlet sudah dipilih? ('all' = semua outlet juga dianggap sudah memilih)
    const outletSudahDipilih = () => !!$('#az_outlet').val();
    function perbaruiLangkah() {
        const siap = outletSudahDipilih();
        $('#az_barcode').prop('disabled', !siap).attr('placeholder', siap ? 'Scan / ketik barcode lalu Enter' : 'Pilih outlet dulu');
        $('#az_btn_barcode').prop('disabled', !siap);
        $('#az_scan').prop('disabled', !siap);
        $('#az_outlet').toggleClass('az_belum', !siap);
        const val = $('#az_outlet').val();
        $('#az_langkah').text(!siap
            ? 'Pilih outlet dulu. Barcode & tombol CARI aktif setelah outlet dipilih.'
            : 'Outlet: ' + (val === 'all' ? 'Semua outlet' : (OUTLET_NAMA[val] || val)) + ' \u2192 Langkah 2: scan / ketik barcode lalu Enter.');
    }
    perbaruiLangkah();

    // Tambah outlet baru ke dropdown otomatis kalau namanya muncul di kolom Gudang
    // tapi belum ada sebagai opsi (misal outlet baru yang belum sempat di-update manual).
    // Kalau namanya cocok dengan OUTLET_ID (list lama), pakai id itu (filter server tetap jalan).
    // Kalau benar-benar baru/tidak dikenal, pakai nama sebagai value (filter tampilan tetap jalan,
    // tapi filter pencarian server-side dilewati untuk outlet ini).
    function pastikanOutletDiDropdown(nama) {
        if (!nama) return;
        const sudahAda = selOutlet.find('option').filter(function () {
            return $(this).text().trim() === nama;
        }).length > 0;
        if (sudahAda) return;
        const id = OUTLET_ID[nama];
        selOutlet.append($('<option>').val(id !== undefined ? id : nama).text(nama));
    }

    /* ================= EVENT ================= */
    let lastCari = '';
    let renderTimer = null;
    let autoToken = '';

    $('#az_btn').on('click', function () {
        $('#az_overlay').addClass('az_open');
        $('#az_hasil').html('');
        if (OUTLETS.length === 0) isiOutletDariSidebar();
        perbaruiLangkah();
        if (outletSudahDipilih()) $('#az_barcode').trigger('focus'); else $('#az_outlet').trigger('focus');
    });
    $('#az_close').on('click', closeModal);
    $('#az_overlay').on('click', function (e) { if (e.target === this) closeModal(); });
    function closeModal() { $('#az_overlay').removeClass('az_open'); }

    $('#az_barcode').on('keydown', function (e) { if (e.key === 'Enter') doScan(); });
    $('#az_scan').on('click', doScan);

    // Toggle filter stok minus: ON = stok < 0, OFF = semua (nilai kosong)
    $('#az_toggle_minus').on('click', function () {
        $(this).toggleClass('on');
        const on = $(this).hasClass('on');
        $('#az_cmp').val(on ? '<' : '');
        $('#az_jml').val(on ? '0' : '');
    });

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

        if (!outletSudahDipilih()) { perbaruiLangkah(); $('#az_outlet').trigger('focus'); return; }
        if (!cari) { alert('Isi barcode dulu.'); return; }
        lastCari = cari;
        autoToken = '';

        $('#az_hasil').html('<div id="az_info">⏳ Mencari data...</div>');
        $('#az_analisa').html('');
        $('#az_scan').prop('disabled', true).show();
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
        $('#pencarian_perbandingan_jumlah').val(cmp);
        $('#pencarian_jumlah').val(jml);

        // 3) Outlet: terpilih = hanya itu, kosong = semua
        // outletId bisa berupa id (dikenal) atau nama outlet baru (belum ada id-nya, lihat
        // pastikanOutletDiDropdown) — untuk kasus nama, filter server-side ini dilewati,
        // tapi filter tampilan kolom Gudang (htmlGudang) tetap jalan karena berbasis nama.
        const outletIdValid = (outletId && outletId !== 'all' && OUTLET_NAMA[outletId] !== undefined) ? outletId : '';
        $('#pencarian_idgudang').val('');
        const boxes = $('.checkbox_list_outlets');
        boxes.prop('checked', !outletIdValid);
        if (outletIdValid) $('#outlet_list_' + outletIdValid).prop('checked', true);
        // Kirim juga ke field pencarian_idoutlet supaya server-side ikut memfilter
        // (checkbox sidebar saja tidak selalu terbaca oleh pencarian AJAX #cari)
        $('#pencarian_idoutlet').val(outletIdValid || '').trigger('change');

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

        let html = `<div id="az_info">Menampilkan <b>${rows.length}</b> data</div>`;

        if (rows.length === 0) {
            html += `<div id="az_info" style="color:#e63946">❌ Data tidak ditemukan.</div>`;
            $('#az_hasil').html(html);
            return;
        }

        html += `<div style="overflow:auto;max-height:35vh;border:1px solid #ddd;border-radius:8px">
        <table id="az_tbl">
          <thead><tr>
            <th>Barcode</th><th>Nama</th><th>Harga Jual</th><th style="text-align:center">Total Stok</th><th>Umur</th><th>Merek</th>
          </tr></thead><tbody>`;

        rows.each(function () {
            const td = $(this).find('td');
            const barcode = td.eq(1).text().trim();
            const nama = td.eq(2).text().trim();
            const harga = td.eq(3).clone().children('br').remove().end().text().trim().replace(/\s+/g, ' ');
            const stok = td.eq(4).text().trim();
            const umur = td.eq(6).text().trim();
            const merek = td.eq(7).text().trim();
            const clsStok = parseFloat(stok) < 0 ? 'az-minus' : 'az-plus';
            const $cellStok = $(this).find('td.bt_dialog_aktifitas_stok');
            const idprd = $cellStok.data('prd') || '';
            const idotl = $cellStok.data('otl') || '';
            html += `<tr data-prd="${idprd}" data-otl="${idotl}">
                <td>${barcode}</td>
                <td class="az-nama">${nama}</td>
                <td class="az-harga">${harga}</td>
                <td class="az-stok-cell ${clsStok}"><span class="az-stok-link" data-barcode="${barcode}">${stok}</span></td>
                <td>${umur}</td>
                <td>${merek}</td>
            </tr>`;
        });

        html += `</tbody></table></div>`;
        $('#az_hasil').html(html);
        $('#az_scan').hide(); // data sudah ketemu, tombol CARI disembunyikan sampai pencarian baru dimulai
        isiKolomGudang();

        // Outlet sudah dipilih sebelum scan -> analisa aktifitas gudang langsung jalan
        const val = $('#az_outlet').val();
        if (val && val !== 'all') autoAnalisa(OUTLET_NAMA[val] || val);
        else $('#az_analisa').html('<div class="az_analisa_box"><h4 style="color:#888;font-weight:normal">Mode semua outlet: pilih satu outlet di atas untuk analisa aktifitas gudang.</h4></div>');
    }

    /* ============================================================ */
    /* GUDANG PER PRODUK: ambil dari detail stok, dipakai kolom     */
    /* Gudang di tabel hasil & analisa otomatis (cache per produk)  */
    /* ============================================================ */
    const gudangCache = {};
    const MAKS_BARIS_GUDANG = 15; // batas fetch detail per hasil pencarian

    function angkaDariTeks(t) {
        const m = String(t || '').match(/-?[\d.,]+/);
        if (!m) return NaN;
        return parseFloat(m[0].replace(/\./g, '').replace(',', '.'));
    }

    // -> [{id, nama, outlet, stok}] urut sesuai pop-up detail stok.
    // Markup: <label bold>OUTLET</label> (label atas) lalu <label>GUDANG</label> : <a .bt_detail_stok_aktifitas>STOK</a>
    async function ambilGudangProduk(idproduk, idoutlet) {
        const key = idproduk + '|' + idoutlet;
        if (gudangCache[key]) return gudangCache[key];
        const detailHtml = await $.ajax({
            url: '/produk_gudangs/detail_stok/new',
            dataType: 'text',
            data: { idproduk: idproduk, idgudang: '', idoutlet: idoutlet }
        });
        const $detail = $('<div>').html(detailHtml);
        const list = [];
        let outlet = '', gudangLabel = '';
        $detail.find('label, a.bt_detail_stok_aktifitas').each(function () {
            const $el = $(this);
            if (this.tagName === 'LABEL') {
                const teks = $el.text().trim();
                if (/bold/i.test($el.attr('style') || '') || $el.css('font-weight') === 'bold' || $el.css('font-weight') === '700') {
                    outlet = teks; // label atas = outlet
                    pastikanOutletDiDropdown(outlet);
                }
                else gudangLabel = teks;
                return;
            }
            const d = $el.data();
            list.push({
                id: d.gdn,
                nama: gudangLabel || d.gudangNama || $el.attr('data-gudang-nama') || '',
                outlet: outlet,
                stok: angkaDariTeks($el.text())
            });
            gudangLabel = '';
        });
        gudangCache[key] = list;
        return list;
    }

    function htmlGudang(list) {
        if (!list.length) return '<span class="az-muted">(gudang tunggal)</span>';
        const azVal = $('#az_outlet').val();
        const outletPilih = (!azVal || azVal === 'all') ? '' : (OUTLET_NAMA[azVal] || azVal);
        if (outletPilih) list = list.filter(g => g.outlet === outletPilih);
        if (!list.length) return `<span class="az-muted">tidak ada gudang di ${outletPilih}</span>`;
        const ada = outletPilih ? list : list.filter(g => !isNaN(g.stok) && g.stok !== 0);
        if (!ada.length) return `<span class="az-muted">stok 0 di semua gudang (${list.length})</span>`;
        let html = '', outletTerakhir = null;
        ada.forEach(g => {
            if (g.outlet !== outletTerakhir) { html += `<div class="az-outlet">${g.outlet || '-'}</div>`; outletTerakhir = g.outlet; }
            const cls = g.stok < 0 ? 'az-minus' : '';
            html += `<div class="az-gdn">${g.nama || g.id || '?'}: <b class="${cls}">${g.stok}</b></div>`;
        });
        const sisa = list.length - ada.length;
        if (sisa > 0) html += `<div class="az-muted">+${sisa} gudang stok 0</div>`;
        return html;
    }

    // Kolom Gudang di tabel sudah dihapus dari tampilan (v1.18.0) — fungsi ini sekarang
    // cuma prefetch data gudang di belakang layar, khusus buat isi dropdown Outlet
    // (lewat pastikanOutletDiDropdown di dalam ambilGudangProduk) dan warm cache.
    async function isiKolomGudang() {
        const trs = $('#az_tbl tbody tr').toArray();
        for (let i = 0; i < trs.length; i++) {
            if (i >= MAKS_BARIS_GUDANG) break;
            const $tr = $(trs[i]);
            const idprd = $tr.data('prd'), idotl = $tr.data('otl');
            if (!idprd) continue;
            if (!$tr.closest('body').length) return; // tabel sudah dirender ulang
            try {
                await ambilGudangProduk(idprd, idotl);
            } catch (e) { /* lanjut ke produk berikutnya */ }
            await sleep(150);
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
    /* ============================================================ */
    /* AUTO-SCROLL: paksa render semua baris di dialog Aktifitas     */
    /* yang lazy-load, sebelum di-parse                              */
    /* ============================================================ */
    function cariScrollAncestor(el) {
        let node = el;
        while (node && node !== document.body) {
            const style = window.getComputedStyle(node);
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') &&
                node.scrollHeight > node.clientHeight) {
                return node;
            }
            node = node.parentElement;
        }
        return null;
    }

    async function scrollSampaiPenuh($scope, statusEl) {
        const el = $scope.get(0);
        if (!el) return;
        const scrollEl = cariScrollAncestor(el) || el;
        const posisiAwal = scrollEl.scrollTop;
        let jumlahSebelum = -1;
        let stabil = 0;

        for (let i = 0; i < 25; i++) {
            const jumlahSekarang = $scope.find('table tbody tr').length;
            if (jumlahSekarang === jumlahSebelum) {
                stabil++;
                if (stabil >= 2) break;
            } else {
                stabil = 0;
                if (statusEl) statusEl.textContent = '⏳ Memuat aktifitas... (' + jumlahSekarang + ' baris)';
            }
            jumlahSebelum = jumlahSekarang;
            scrollEl.scrollTop = scrollEl.scrollHeight;
            scrollEl.dispatchEvent(new Event('scroll', { bubbles: true }));
            await sleep(400);
        }
        scrollEl.scrollTop = posisiAwal; // balikin posisi scroll spt semula
    }

    // Sama tujuannya dengan scrollSampaiPenuh, tapi untuk fetch AJAX autoAnalisa
    // yang tidak lewat dialog asli. HTML hasil fetch ditempel sebentar ke DOM asli
    // di luar layar (BUKAN display:none, supaya beneran punya scrollHeight) dengan
    // overflow-y:auto sendiri, supaya lazy-load tabel yang sama tetap ke-trigger
    // saat di-scroll — sebelumnya fetch ini di-parse langsung dari <div> lepas
    // (tidak nempel ke halaman) jadi cuma dapat halaman pertama dari data yang
    // sebenarnya di-load bertahap pas di-scroll. Elemen dihapus lagi sesudahnya.
    async function bacaAktifitasViaFetch(idproduk, idgudang, idoutlet) {
        const aktHtml = await $.ajax({
            url: '/produk_gudangs/aktifitas_stok/new',
            dataType: 'text',
            data: {
                idproduk: idproduk,
                idgudang: idgudang,
                idoutlet: idoutlet,
                hide_stok_awal_stok_akhir: $('#hide_stok_awal_stok_akhir').val() || 'false'
            }
        });
        const $temp = $('<div>').css({
            position: 'fixed', left: '-9999px', top: '0', zIndex: -1,
            width: '600px', height: '400px', overflowY: 'auto', overflowX: 'hidden'
        }).html(aktHtml).appendTo(document.body);
        try {
            await scrollSampaiPenuh($temp);
            return parseAktifitasRows($temp);
        } finally {
            $temp.remove();
        }
    }

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
            const jenisAsli = td.eq(2).text().trim();
            const jmlText = td.eq(4).text().trim();
            const keterangan = td.eq(6).text().trim();
            const operator = td.eq(7).length ? td.eq(7).text().trim() : '';

            const kataPertama = keterangan.split(/\s+/)[0] || '';
            const jenis = kataPertama ? (jenisAsli + ' - ' + kataPertama) : jenisAsli;

            const m = jmlText.match(/([+-])\s*([\d.,]+)/);
            const qty = m ? parseFloat(m[2].replace(',', '.')) : 0;
            const isKeluar = m ? (m[1] === '-') : false;

            totalTrx++;
            if (isKeluar) totalKeluar += qty; else totalMasuk += qty;

            if (!perJenis[jenis]) perJenis[jenis] = { count: 0, qty: 0, operators: {} };
            perJenis[jenis].count++;
            perJenis[jenis].qty += isKeluar ? -qty : qty;
            if (operator) perJenis[jenis].operators[operator] = true;

            if (/^penjualan$/i.test(jenisAsli)) { jualCount++; jualQty += qty; }

            listTrx.push({ tanggal, kode, jenis, jmlText, keterangan, operator, isKeluar });
        });

        const stokAkhir = rows.first().find('td').eq(5).text().trim();
        // "Jumlah Total pada Gudang = 200.0 PCS" (label di atas tabel aktifitas)
        let totalGudang = '';
        $scope.find('label').each(function () {
            if (/Jumlah Total pada Gudang/i.test($(this).text())) {
                const $nx = $(this).nextAll('label').first();
                if ($nx.length) totalGudang = $nx.text().trim();
                return false;
            }
        });
        return { totalTrx, totalKeluar, totalMasuk, jualCount, jualQty, perJenis, listTrx, stokAkhir, totalGudang };
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
            ${a.totalGudang ? `<span class="az_chip">Total di Gudang: <b>${a.totalGudang}</b></span>` : ''}
            <span class="az_chip">Penjualan: <b>${a.jualCount}x</b> (${a.jualQty} pcs)</span>
        </div>`;

        html += `<div class="az_jenis_wrap"><table class="az_jenis_tbl">
            <thead><tr><th>Jenis</th><th style="width:44px;text-align:center">Jml Trx</th><th style="width:56px;text-align:right">Total Qty</th><th>Operator</th></tr></thead>
            <tbody>`;
        Object.keys(a.perJenis).forEach(j => {
            const net = a.perJenis[j].qty;
            const clsQty = net < 0 ? 'az_out' : (net > 0 ? 'az_in' : '');
            const tampilQty = (net > 0 ? '+' : '') + net;
            const ops = Object.keys(a.perJenis[j].operators || {}).join(', ');
            html += `<tr><td>${j}</td><td style="text-align:center">${a.perJenis[j].count}</td><td style="text-align:right" class="${clsQty}">${tampilQty}</td><td>${ops}</td></tr>`;
        });
        html += `</tbody></table></div>`;

        html += `<div class="az_trx_wrap"><table class="az_trx_tbl">
            <thead><tr><th style="width:60px">Tanggal</th><th style="width:50px">Kode</th><th>Jenis</th><th style="width:42px">Jml</th><th>Keterangan</th><th style="width:78px">Operator</th></tr></thead>
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
    async function renderAnalisaManual() {
        const $t = $('#target_aktifitas_aktifitas_stok');
        if ($t.length === 0) return;
        await scrollSampaiPenuh($t);
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
    async function autoAnalisa(outletFilterNama) {
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
                let gudangs = (await ambilGudangProduk(idproduk, idoutlet)).slice();
                if (gudangs.length === 0) {
                    gudangs.push({ id: $cell.data('gdn') || '', nama: '(gudang tunggal)' });
                }
                if (outletFilterNama) {
                    gudangs = gudangs.filter(g => g.outlet === outletFilterNama);
                    if (gudangs.length === 0) continue; // produk ini tidak ada di outlet terpilih
                }

                for (const g of gudangs) {
                    try {
                        const a = await bacaAktifitasViaFetch(idproduk, g.id, idoutlet);
                        if (a) {
                            sections.push(analisaSectionHtml(a, (g.outlet ? g.outlet + ' › ' : '') + (g.nama || g.id), barcode, nama));
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
            const pesan = outletFilterNama
                ? 'Tidak ada data aktifitas untuk outlet <b>' + outletFilterNama + '</b>.'
                : 'Tidak ada data aktifitas.';
            $('#az_analisa').html('<div class="az_analisa_box"><h4>ℹ️ ' + pesan + '</h4></div>');
        }
    }

    // Mulai analisa begitu outlet dipilih dari dropdown (kosong = balik ke placeholder).
    $('#az_outlet').on('change', function () {
        const val = $(this).val();
        perbaruiLangkah();
        if (!val) {
            $('#az_analisa').html('');
            return;
        }
        // outlet dipilih -> siap scan
        setTimeout(() => $('#az_barcode').trigger('focus'), 30);
        // kalau sudah ada hasil pencarian, analisa ulang untuk outlet yang baru dipilih
        if (lastCari && $('#az_tbl').length) {
            if (val === 'all') $('#az_analisa').html('<div class="az_analisa_box"><h4 style="color:#888;font-weight:normal">Mode semua outlet: pilih satu outlet di atas untuk analisa aktifitas gudang.</h4></div>');
            else autoAnalisa(OUTLET_NAMA[val] || val);
        }
    });
})();
