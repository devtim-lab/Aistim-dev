// ==UserScript==
// @name         Erzap - Produk OLZAP
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Responsif mobile/desktop. Tombol di halaman daftar produk Erzap; klik -> modal, masukkan barcode -> dimasukkan ke filter tabel, dicari, hasilnya ditampilkan di modal; di bawah nama barang ada tab Lihat / Edit
// @author       You
// @match        https://*.erzap.com/produks*
// @world        main
// @run-at       document-start
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const ID_TOMBOL = 'tm_olzap_btn';
  const ID_MODAL = 'tm_olzap_modal';
  const ID_POPUP = 'tm_olzap_popup';
  const TIMEOUT_CARI_MS = 20000;     // tunggu hasil filter maksimal 20 detik
  const log = (...a) => console.log('[ProdukOLZAP]', ...a);

  // Bagian halaman Erzap yang disembunyikan saat dibuka di dalam iframe (tab Lihat / Edit)
  const CSS_IFRAME = `
    #header, #menu_action, #wrapper_menu_mobile, #wrapper_sidebar_mobile,
    #garis_penutup_atas, #garis_penutup_bawah, #version_update, .noprint.alert:empty { display: none !important; }
    #wrapper, #container, #content_full_page { margin: 0 !important; padding: 8px !important; width: auto !important; min-width: 0 !important; }
    body { padding-top: 0 !important; margin: 0 !important; overflow-x: auto !important; padding-bottom: 90px !important; }
    #tm_olzap_fab_save { position: fixed; right: 18px; bottom: 18px; z-index: 2147483000; width: 60px; height: 60px; border-radius: 50%;
      border: 0; background: #dc3545; color: #fff; font-size: 26px; line-height: 1; cursor: pointer; padding: 0;
      box-shadow: 0 6px 18px rgba(0,0,0,.35); display: flex; align-items: center; justify-content: center; }
    #tm_olzap_fab_save i.fa { font-size: 26px; line-height: 1; }
    #tm_olzap_fab_save:hover { background: #c82333; }
    #tm_olzap_fab_save:disabled { background: #999; cursor: progress; }
    #tm_olzap_fab_save .tm-fab-label { position: absolute; right: 70px; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,.75);
      color: #fff; font-size: 12px; padding: 4px 8px; border-radius: 4px; white-space: nowrap; display: none; }
    #tm_olzap_fab_save:hover .tm-fab-label { display: block; }
    @media (max-width: 640px) { #tm_olzap_fab_save { width: 56px; height: 56px; right: 14px; bottom: 14px; } }
  `;
  const PARAM_IFRAME = 'tm_olzap_frame';   // penanda di URL: halaman ini dibuka di dalam iframe modal

  const rapikan = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const tunggu = ms => new Promise(r => setTimeout(r, ms));

  // ---------- filter tabel ----------
  const KUNCI_PENDING = 'tm_olzap_pending';   // sessionStorage: barcode yang sedang dicari (kalau filter memuat ulang halaman)

  const terlihat = el => !!el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';

  // Teks label yang terkait input (label[for], label pembungkus, placeholder, title, name, id)
  function deskripsiInput(inp) {
    const bag = [inp.id, inp.name, inp.placeholder, inp.title, inp.getAttribute('aria-label')];
    if (inp.id) { const l = document.querySelector(`label[for="${CSS.escape(inp.id)}"]`); if (l) bag.push(l.textContent); }
    const lw = inp.closest('label'); if (lw) bag.push(lw.textContent);
    const td = inp.closest('td,th,div'); if (td) { const prev = td.previousElementSibling; if (prev) bag.push(prev.textContent); }
    return bag.filter(Boolean).join(' ').toLowerCase();
  }

  // Semua input teks yang bisa dipakai filter, diberi skor: "barcode" paling tinggi
  function kandidatInputFilter() {
    const semua = Array.from(document.querySelectorAll('input:not([type]),input[type="text"],input[type="search"]'))
      .filter(inp => !inp.closest('#' + ID_MODAL) && !inp.closest('#' + ID_POPUP) && !inp.readOnly && !inp.disabled);
    const skor = inp => {
      const d = deskripsiInput(inp);
      let n = 0;
      if (/barcode|bar_code|kode\s*bar/.test(d)) n += 100;
      if (inp.closest('#data_table_produk_filter,.dataTables_filter')) n += 90;
      if (/\bkode\b|sku/.test(d)) n += 40;
      if (/cari|search|filter|keyword|pencarian/.test(d)) n += 30;
      if (/nama|produk/.test(d)) n += 10;
      if (terlihat(inp)) n += 5;
      return n;
    };
    return semua.map(inp => ({ inp, skor: skor(inp), d: deskripsiInput(inp) })).filter(k => k.skor > 5).sort((a, b) => b.skor - a.skor);
  }

  // Panel filter Erzap biasanya baru tampil setelah tombol "Cari" (#cari) di menu samping diklik
  async function bukaPanelFilter() {
    let kand = kandidatInputFilter();
    if (kand.length && terlihat(kand[0].inp)) return kand;
    const btnCari = document.querySelector('#cari, #bt_cari, .button_action#cari');
    if (btnCari) {
      log('Klik tombol Cari (#cari) untuk membuka panel filter');
      btnCari.click();
      const t0 = Date.now();
      while (Date.now() - t0 < 2000) {
        await tunggu(150);
        kand = kandidatInputFilter();
        if (kand.length && terlihat(kand[0].inp)) return kand;
      }
    }
    return kandidatInputFilter();
  }

  // Tombol submit/cari yang paling dekat dengan input
  function tombolSubmitDekat(inp) {
    const wadah = inp.form || inp.closest('form, .filter, #filter, #form_filter, .panel, .card, div');
    if (!wadah) return null;
    const cand = Array.from(wadah.querySelectorAll('button, input[type=submit], input[type=button], a.btn, a.button, .button_action'));
    return cand.find(b => /cari|search|filter|tampil|ok|terapkan|submit/i.test((b.value || b.textContent || b.title || b.id || '').trim()))
      || cand.find(b => b.type === 'submit') || null;
  }

  // Isi filter dengan barcode & jalankan pencarian. Return: cara yang dipakai (untuk log), null kalau tidak ketemu.
  async function isiFilter(barcode) {
    const $ = window.jQuery;
    const tabel = document.querySelector('#data_table_produk');

    // 1) input filter di halaman (dibuka lewat #cari kalau perlu)
    const kand = await bukaPanelFilter();
    log('Kandidat input filter:', kand.map(k => `${k.skor}: ${k.inp.tagName}#${k.inp.id}[name=${k.inp.name}] "${k.d.slice(0, 60)}"`));
    const inp = kand.length ? kand[0].inp : null;

    if (inp) {
      // input DataTables (filter client-side) -> pakai API-nya langsung
      if ($ && tabel && $.fn && $.fn.DataTable && $.fn.DataTable.isDataTable(tabel) && inp.closest('#data_table_produk_filter,.dataTables_filter')) {
        inp.value = barcode;
        $(tabel).DataTable().search(barcode).draw();
        return 'DataTables API';
      }
      // kosongkan input filter lain yang mungkin masih terisi (mis. nama), supaya hasil hanya berdasarkan barcode
      for (const k of kand.slice(1)) if (k.inp.value && k.inp.closest('form') === inp.closest('form')) {
        k.inp.value = '';
        k.inp.dispatchEvent(new Event('input', { bubbles: true }));
        k.inp.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      inp.focus();
      setter.call(inp, barcode);
      for (const tipe of ['input', 'change', 'keyup']) inp.dispatchEvent(new Event(tipe, { bubbles: true }));
      if ($) $(inp).trigger('keyup').trigger('change');

      // simpan dulu: kalau submit memuat ulang halaman, setelah reload modal dibuka lagi
      sessionStorage.setItem(KUNCI_PENDING, JSON.stringify({ barcode, t: Date.now() }));

      const btn = tombolSubmitDekat(inp);
      const ev = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true };
      inp.dispatchEvent(new KeyboardEvent('keydown', ev));
      inp.dispatchEvent(new KeyboardEvent('keypress', ev));
      inp.dispatchEvent(new KeyboardEvent('keyup', ev));
      if ($) $(inp).trigger($.Event('keypress', { which: 13, keyCode: 13 }));
      if (btn) { log('Klik tombol submit:', btn.outerHTML.slice(0, 120)); btn.click(); }
      else if (inp.form) { if (inp.form.requestSubmit) inp.form.requestSubmit(); else inp.form.submit(); }
      const nama = inp.id ? '#' + inp.id : inp.name ? '[name=' + inp.name + ']' : inp.tagName;
      return 'input ' + nama + (btn ? ' + tombol' : inp.form ? ' + form' : ' + Enter');
    }

    // 2) tidak ada input, tapi tabel DataTables -> API
    if ($ && tabel && $.fn && $.fn.DataTable && $.fn.DataTable.isDataTable(tabel)) {
      $(tabel).DataTable().search(barcode).draw();
      return 'DataTables API';
    }
    return null;
  }

  // ---------- baca baris tabel ----------
  // Tidak menebak indeks kolom: ambil <tr> asli, cocokkan barcode dari span.barcode_produk
  // atau dari isi sel mana pun; yang ditampilkan di modal adalah clone baris aslinya.
  const selTeks = tr => Array.from(tr.querySelectorAll('td')).map(td => rapikan(td.textContent));
  function bacaBaris(tr) {
    const sp = tr.querySelector('span.barcode_produk');
    const tdStok = tr.querySelector('td.bt_dialog_aktifitas_stok');
    const sel = selTeks(tr);
    return {
      tr,
      sel,
      barcode: rapikan(sp && sp.textContent) || (tdStok && tdStok.dataset.barcode) || '',
      teks: sel.join(' | '),
    };
  }
  const semuaBaris = () => Array.from(document.querySelectorAll('#data_table_produk tbody tr'))
    .filter(tr => !tr.querySelector('td.dataTables_empty') && tr.querySelectorAll('td').length > 1)
    .map(bacaBaris);
  const tabelKosong = () => !!document.querySelector('#data_table_produk tbody td.dataTables_empty');
  const sedangMemuat = () => {
    const p = document.querySelector('#data_table_produk_processing, .dataTables_processing');
    return p && p.offsetParent !== null && getComputedStyle(p).display !== 'none';
  };

  // Tunggu sampai tabel menampilkan barcode yang dicari (atau tabel kosong / timeout)
  async function tungguHasil(barcode) {
    const t0 = Date.now();
    const B = barcode.toUpperCase();
    const cocok = r => r.barcode.toUpperCase() === B || r.sel.some(t => t.toUpperCase() === B);
    await tunggu(400);                                       // beri waktu request filter mulai
    while (Date.now() - t0 < TIMEOUT_CARI_MS) {
      if (!sedangMemuat()) {
        const rows = semuaBaris();
        const tepat = rows.filter(cocok);
        if (tepat.length) return { status: 'ketemu', rows: tepat, semua: rows };
        if (tabelKosong()) return { status: 'kosong', rows: [], semua: [] };
        // tabel sudah berisi hasil filter (sedikit baris) tapi barcode tidak persis sama -> tampilkan yang mirip
        if (rows.length && rows.length <= 25 && Date.now() - t0 > 2500 &&
            rows.some(r => r.teks.toUpperCase().includes(B)))
          return { status: 'mirip', rows, semua: rows };
      }
      await tunggu(300);
    }
    return { status: 'timeout', rows: [], semua: semuaBaris() };
  }

  // ---------- modal ----------
  let elIsiHasil = null, elInput = null, elBtnCari = null, elStatus = null;

  // CSS modal: desktop = kotak di tengah, mobile (<= 640px) = lembar penuh layar
  const CSS_MODAL = `
    #${ID_MODAL},#${ID_POPUP}{--tm-merah:#dc3545;--tm-merah-tua:#b02a37;--tm-merah-muda:#fde8e8;--tm-merah-pucat:#fff5f5;--tm-garis:#f1c6cb;}
    #${ID_MODAL}{position:fixed;inset:0;z-index:2147483000;background:rgba(60,0,0,.55);display:none;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;}
    #${ID_MODAL}.tm-buka{display:flex;}
    #${ID_MODAL} .tm-kotak{background:#fff;color:#222;width:min(1100px,100%);max-height:100%;border-radius:8px;border:2px solid var(--tm-merah);box-shadow:0 10px 40px rgba(0,0,0,.35);display:flex;flex-direction:column;font:14px/1.4 Arial,sans-serif;overflow:hidden;}
    #${ID_MODAL} .tm-kepala{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--tm-merah);color:#fff;border-bottom:1px solid var(--tm-merah-tua);flex:none;}
    #${ID_MODAL} .tm-kepala a{color:#fff;}
    #${ID_MODAL} .tm-tutup{border:0;background:none;color:#fff;font-size:22px;cursor:pointer;line-height:1;padding:6px 10px;min-width:44px;min-height:44px;border-radius:50%;}
    #${ID_MODAL} .tm-tutup:hover{background:rgba(255,255,255,.2);}
    #${ID_MODAL} .tm-isi{padding:16px;overflow:auto;flex:1;-webkit-overflow-scrolling:touch;}
    #${ID_MODAL} .tm-form{display:flex;gap:6px;align-items:center;margin-bottom:12px;flex-wrap:wrap;}
    #${ID_MODAL} .tm-input{flex:1 1 200px;min-width:0;padding:10px 12px;border:1px solid var(--tm-garis);border-radius:4px;font-size:16px;box-sizing:border-box;outline:none;}
    #${ID_MODAL} .tm-input:focus{border-color:var(--tm-merah);box-shadow:0 0 0 3px rgba(220,53,69,.2);}
    #${ID_MODAL} .tm-cari{flex:0 0 auto;padding:10px 18px;background:var(--tm-merah);border:1px solid var(--tm-merah);color:#fff;border-radius:4px;cursor:pointer;font-size:15px;min-height:44px;font-weight:bold;}
    #${ID_MODAL} .tm-cari:hover{background:var(--tm-merah-tua);}
    #${ID_MODAL} .tm-cari:disabled{opacity:.6;cursor:progress;}
    #${ID_MODAL} .tm-status{font-size:12px;color:#666;margin-bottom:8px;min-height:16px;word-break:break-word;}
    #${ID_MODAL} .tm-pesan{padding:12px;border-radius:4px;margin-bottom:8px;word-break:break-word;}
    #${ID_MODAL} .tm-bungkus{overflow:auto;max-width:100%;-webkit-overflow-scrolling:touch;}
    #${ID_MODAL} .tm-bungkus table{width:100%;border-collapse:collapse;font-size:13px;}
    #${ID_MODAL} .tm-bungkus th,#${ID_MODAL} .tm-bungkus td{padding:6px 8px;border-bottom:1px solid var(--tm-garis);white-space:nowrap;}
    #${ID_MODAL} .tm-bungkus thead th{background:var(--tm-merah) !important;color:#fff !important;border-color:var(--tm-merah-tua) !important;}
    #${ID_MODAL} .tm-kaki{padding:10px 16px;border-top:1px solid var(--tm-garis);background:var(--tm-merah-pucat);text-align:right;flex:none;}
    #${ID_MODAL} .tm-kaki button{min-height:44px;padding:8px 18px;background:#fff;color:var(--tm-merah);border:1px solid var(--tm-merah);border-radius:4px;cursor:pointer;font-weight:bold;}
    #${ID_MODAL} .tm-kaki button:hover{background:var(--tm-merah);color:#fff;}
    @media (max-width:640px){
      #${ID_MODAL}{padding:0;align-items:stretch;}
      #${ID_MODAL} .tm-kotak{width:100%;height:100%;max-height:none;border-radius:0;}
      #${ID_MODAL} .tm-isi{padding:12px;}
      #${ID_MODAL} .tm-form{flex-direction:column;align-items:stretch;}
      #${ID_MODAL} .tm-input{flex:none;width:100%;}
      #${ID_MODAL} .tm-cari{width:100%;}
      #${ID_MODAL} .tm-kaki{text-align:center;}
      #${ID_MODAL} .tm-kaki button{width:100%;}
      #${ID_MODAL} .tm-bungkus table{font-size:12px;}
    }
    #${ID_MODAL} .tm-produk{margin-top:14px;border:1px solid var(--tm-merah);border-radius:6px;overflow:hidden;}
    #${ID_MODAL} .tm-produk-nama{padding:10px 12px;background:var(--tm-merah);color:#fff;border-bottom:1px solid var(--tm-merah-tua);font-weight:bold;word-break:break-word;}
    #${ID_MODAL} .tm-produk-nama small{font-weight:normal;color:rgba(255,255,255,.85);margin-left:6px;}
    #${ID_MODAL} .tm-tabs{display:flex;border-bottom:1px solid var(--tm-garis);background:var(--tm-merah-pucat);}
    #${ID_MODAL} .tm-tab{flex:1;padding:10px 14px;border:0;border-bottom:3px solid transparent;background:none;cursor:pointer;font-size:14px;min-height:44px;color:#444;}
    #${ID_MODAL} .tm-tab{display:inline-flex;align-items:center;justify-content:center;gap:8px;}
    #${ID_MODAL} .tm-tab svg{flex:none;}
    #${ID_MODAL} .tm-tab:hover{background:var(--tm-merah-muda);}
    #${ID_MODAL} .tm-tab.aktif{border-bottom-color:var(--tm-merah);color:var(--tm-merah);font-weight:bold;background:#fff;}
    @media (max-width:640px){
      #${ID_MODAL} .tm-tab .tm-tab-teks{display:none;}
      #${ID_MODAL} .tm-tab svg{width:24px;height:24px;}
    }
    #${ID_MODAL} .tm-tab-alat{display:flex;align-items:center;gap:8px;padding:6px 12px;font-size:12px;color:#666;border-bottom:1px solid var(--tm-garis);}
    #${ID_MODAL} .tm-tab-alat a{color:var(--tm-merah);}
    #${ID_MODAL} .tm-tab-alat a{white-space:nowrap;}
    #${ID_MODAL} .tm-panel{display:none;position:relative;}
    #${ID_MODAL} .tm-panel.aktif{display:block;}
    #${ID_MODAL} .tm-panel iframe{width:100%;height:65vh;border:0;background:#fff;display:block;}
    #${ID_MODAL} .tm-panel .tm-muat{position:absolute;left:0;right:0;top:8px;text-align:center;color:#666;font-size:13px;pointer-events:none;}
    @media (max-width:640px){
      #${ID_MODAL} .tm-panel iframe{height:70vh;}
    }
    #${ID_POPUP}{position:fixed;inset:0;z-index:2147483001;background:rgba(60,0,0,.65);display:none;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;}
    #${ID_POPUP}.tm-buka{display:flex;}
    #${ID_POPUP} .tm-kotak{width:min(1200px,100%);height:100%;max-height:92vh;background:#fff;border:2px solid var(--tm-merah);border-radius:8px;display:flex;flex-direction:column;overflow:hidden;}
    #${ID_POPUP} .tm-kepala{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--tm-merah);color:#fff;flex:none;}
    #${ID_POPUP} .tm-kepala a{color:#fff;}
    #${ID_POPUP} .tm-tutup{border:0;background:none;color:#fff;font-size:22px;cursor:pointer;line-height:1;padding:6px 10px;min-width:44px;min-height:44px;}
    #${ID_POPUP} .tm-kepala{gap:8px;}
    #${ID_POPUP} .tm-kepala b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;}
    #${ID_POPUP} .tm-kepala a{font-size:12px;white-space:nowrap;}
    #${ID_POPUP} iframe{flex:1;width:100%;border:0;background:#fff;}
    #${ID_POPUP} .tm-muat{position:absolute;left:0;right:0;top:56px;text-align:center;padding:12px;color:#666;font-size:13px;pointer-events:none;}
    @media (max-width:640px){
      #${ID_POPUP}{padding:0;align-items:stretch;}
      #${ID_POPUP} .tm-kotak{width:100%;height:100%;max-height:none;border-radius:0;}
    }
    #${ID_TOMBOL}{white-space:nowrap;}
    @media (max-width:640px){
      #${ID_TOMBOL}:not(.tm-fixed){display:block;width:100%;margin:6px 0 0 0 !important;min-height:44px;}
      #${ID_TOMBOL}.tm-fixed{right:12px;bottom:12px;min-height:44px;}
    }
  `;
  function pasangCss() {
    if (document.getElementById(ID_MODAL + '_css')) return;
    const st = document.createElement('style');
    st.id = ID_MODAL + '_css';
    st.textContent = CSS_MODAL;
    document.head.appendChild(st);
  }

  function buatModal() {
    let overlay = document.getElementById(ID_MODAL);
    if (overlay) return overlay;
    pasangCss();

    overlay = document.createElement('div');
    overlay.id = ID_MODAL;

    const kotak = document.createElement('div');
    kotak.className = 'tm-kotak';

    // kepala
    const kepala = document.createElement('div');
    kepala.className = 'tm-kepala';
    const judul = document.createElement('b');
    judul.textContent = 'Produk OLZAP';
    const btnTutup = document.createElement('button');
    btnTutup.type = 'button';
    btnTutup.className = 'tm-tutup';
    btnTutup.textContent = '\u2715';
    btnTutup.title = 'Tutup';
    btnTutup.onclick = tutupModal;
    kepala.append(judul, btnTutup);

    // isi
    const isi = document.createElement('div');
    isi.className = 'tm-isi';

    const form = document.createElement('form');
    form.className = 'tm-form';
    elInput = document.createElement('input');
    elInput.type = 'text';
    elInput.className = 'tm-input';
    elInput.placeholder = 'Masukkan / scan barcode, lalu Enter';
    elInput.autocomplete = 'off';
    elInput.enterKeyHint = 'search';
    elBtnCari = document.createElement('button');
    elBtnCari.type = 'submit';
    elBtnCari.className = 'tm-cari';
    elBtnCari.textContent = 'Cari';
    form.append(elInput, elBtnCari);
    form.onsubmit = e => { e.preventDefault(); e.stopPropagation(); cariBarcode(); };

    elStatus = document.createElement('div');
    elStatus.className = 'tm-status';

    elIsiHasil = document.createElement('div');

    isi.append(form, elStatus, elIsiHasil);

    // kaki
    const kaki = document.createElement('div');
    kaki.className = 'tm-kaki';
    const btnOk = document.createElement('button');
    btnOk.type = 'button';
    btnOk.textContent = 'Tutup';
    btnOk.className = 'btn btn-secondary';
    btnOk.onclick = tutupModal;
    kaki.append(btnOk);

    kotak.append(kepala, isi, kaki);
    overlay.append(kotak);

    overlay.addEventListener('click', e => { if (e.target === overlay) tutupModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') tutupModal(); });

    document.body.appendChild(overlay);
    return overlay;
  }

  const layarLebar = () => window.matchMedia('(min-width:641px)').matches;

  function bukaModal() {
    buatModal().classList.add('tm-buka');
    document.body.style.overflow = 'hidden';
    // di mobile jangan auto-fokus (keyboard langsung naik menutupi hasil); di desktop fokus + pilih
    if (layarLebar()) setTimeout(() => { elInput.focus(); elInput.select(); }, 50);
  }
  function tutupModal() {
    tutupPopup();
    const m = document.getElementById(ID_MODAL);
    if (m) m.classList.remove('tm-buka');
    document.body.style.overflow = '';
  }

  // ---------- popup lihat / edit (iframe di atas modal) ----------
  let elPopupFrame = null, elPopupJudul = null, elPopupLink = null, elPopupMuat = null;

  function buatPopup() {
    let overlay = document.getElementById(ID_POPUP);
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = ID_POPUP;

    const kotak = document.createElement('div');
    kotak.className = 'tm-kotak';
    kotak.style.position = 'relative';

    const kepala = document.createElement('div');
    kepala.className = 'tm-kepala';
    elPopupJudul = document.createElement('b');
    elPopupLink = document.createElement('a');
    elPopupLink.target = '_blank';
    elPopupLink.rel = 'noopener';
    elPopupLink.textContent = 'Buka di tab baru';
    const btnTutup = document.createElement('button');
    btnTutup.type = 'button';
    btnTutup.className = 'tm-tutup';
    btnTutup.textContent = '\u2715';
    btnTutup.title = 'Tutup';
    btnTutup.onclick = tutupPopup;
    kepala.append(elPopupJudul, elPopupLink, btnTutup);

    elPopupMuat = document.createElement('div');
    elPopupMuat.className = 'tm-muat';
    elPopupMuat.textContent = 'Memuat...';

    elPopupFrame = document.createElement('iframe');
    elPopupFrame.addEventListener('load', () => { sembunyikanHeaderFrame(elPopupFrame); elPopupMuat.style.display = 'none'; });

    kotak.append(kepala, elPopupMuat, elPopupFrame);
    overlay.append(kotak);
    overlay.addEventListener('click', e => { if (e.target === overlay) tutupPopup(); });
    document.body.appendChild(overlay);
    return overlay;
  }

  function bukaPopup(url, judul) {
    const ov = buatPopup();
    elPopupJudul.textContent = judul || url;
    elPopupJudul.title = url;
    elPopupLink.href = url;
    elPopupMuat.style.display = '';
    elPopupFrame.src = tandaiUrlFrame(url);
    ov.classList.add('tm-buka');
  }
  function tutupPopup() {
    const ov = document.getElementById(ID_POPUP);
    if (!ov) return;
    ov.classList.remove('tm-buka');
    elPopupFrame.src = 'about:blank';
  }
  // Esc: tutup popup dulu, baru modal
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const ov = document.getElementById(ID_POPUP);
    if (ov && ov.classList.contains('tm-buka')) { e.stopImmediatePropagation(); tutupPopup(); }
  }, true);

  // id produk dari baris tabel (span.produk / checkbox / data-prd / link /produks/123)
  function idProduk(tr) {
    const sp = tr.querySelector('span.produk');
    if (sp && rapikan(sp.textContent)) return rapikan(sp.textContent);
    const cb = tr.querySelector('input.check_box_multi_produk');
    if (cb && cb.value) return cb.value;
    const tdStok = tr.querySelector('td.bt_dialog_aktifitas_stok');
    if (tdStok && tdStok.dataset.prd) return tdStok.dataset.prd;
    for (const a of tr.querySelectorAll('a[href]')) {
      const m = a.getAttribute('href').match(/\/produks\/(\d+)/);
      if (m) return m[1];
    }
    for (const el of tr.querySelectorAll('[data-id],[data-produk-id],[data-prd]')) {
      const v = el.dataset.id || el.dataset.produkId || el.dataset.prd;
      if (v && /^\d+$/.test(v)) return v;
    }
    return '';
  }
  const urlLihat = id => location.origin + '/produks/' + id + '?' + PARAM_IFRAME + '=1';
  const urlEdit = id => location.origin + '/produks/' + id + '/edit?' + PARAM_IFRAME + '=1';
  const tandaiUrlFrame = u => { try { const x = new URL(u, location.href); x.searchParams.set(PARAM_IFRAME, '1'); return x.href; } catch (e) { return u; } };

  // Cadangan: suntik CSS ke dokumen iframe (satu domain) setelah selesai dimuat
  function sembunyikanHeaderFrame(fr) {
    try {
      const d = fr.contentDocument;
      if (!d || !d.head || d.getElementById('tm_olzap_css_frame')) return;
      const st = d.createElement('style');
      st.id = 'tm_olzap_css_frame';
      st.textContent = CSS_IFRAME;
      d.head.appendChild(st);
    } catch (e) { /* beda origin -> abaikan */ }
  }

  const namaProduk = tr => { const t = tr.querySelector('td.nama_produk'); return rapikan(t && (t.getAttribute('title') || t.textContent)); };

  // Link di baris hasil (clone) tidak boleh pindah halaman: arahkan ke tab Lihat/Edit
  function siapkanBarisClone(trClone, blok) {
    trClone.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return;
      const abs = tandaiUrlFrame(href);
      a.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        if (blok) blok.pilihTab(/\/edit\b/.test(abs) ? 'edit' : 'lihat', abs);
        else bukaPopup(abs, rapikan(a.textContent) || a.title || abs);
      });
    });
    trClone.querySelectorAll('[class*="edit"],[class*="lihat"],[class*="show"],[class*="detail"]').forEach(el => {
      if (el.tagName === 'A' || !blok) return;
      el.style.cursor = 'pointer';
      el.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); blok.pilihTab(/edit/i.test(el.className) ? 'edit' : 'lihat'); });
    });
  }

  // Blok per produk: nama barang + 2 tab (Lihat / Edit) yang memuat halaman produk di iframe
  function buatBlokProduk(id, nama, barcode) {
    const wadah = document.createElement('div');
    wadah.className = 'tm-produk';

    const judul = document.createElement('div');
    judul.className = 'tm-produk-nama';
    judul.textContent = nama || ('Produk #' + id);
    if (barcode) { const sm = document.createElement('small'); sm.textContent = barcode; judul.appendChild(sm); }

    const tabs = document.createElement('div');
    tabs.className = 'tm-tabs';
    const alat = document.createElement('div');
    alat.className = 'tm-tab-alat';
    const linkBaru = document.createElement('a');
    linkBaru.target = '_blank';
    linkBaru.rel = 'noopener';
    linkBaru.textContent = 'Buka di tab baru';
    const btnMuatUlang = document.createElement('a');
    btnMuatUlang.href = '#';
    btnMuatUlang.textContent = 'Muat ulang';
    alat.append(linkBaru, btnMuatUlang);

    const panelWadah = document.createElement('div');
    // ikon mata (lihat) & pensil (edit), inline SVG supaya tidak bergantung font ikon halaman
    const IKON_LIHAT = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
    const IKON_EDIT = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
    const daftar = {
      lihat: { ikon: IKON_LIHAT, label: 'Lihat', url: urlLihat(id) },
      edit: { ikon: IKON_EDIT, label: 'Edit', url: urlEdit(id) },
    };
    const el = {};
    for (const k of Object.keys(daftar)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tm-tab';
      b.innerHTML = daftar[k].ikon + '<span class="tm-tab-teks">' + daftar[k].label + '</span>';
      b.title = daftar[k].label;
      b.setAttribute('aria-label', daftar[k].label);
      b.onclick = () => pilihTab(k);
      tabs.appendChild(b);

      const panel = document.createElement('div');
      panel.className = 'tm-panel';
      const muat = document.createElement('div');
      muat.className = 'tm-muat';
      muat.textContent = 'Memuat...';
      const fr = document.createElement('iframe');
      fr.addEventListener('load', () => { sembunyikanHeaderFrame(fr); if (fr.src && fr.src !== 'about:blank') muat.style.display = 'none'; });
      panel.append(muat, fr);
      panelWadah.appendChild(panel);
      el[k] = { b, panel, fr, muat, url: daftar[k].url };
    }

    let aktif = null;
    function pilihTab(k, urlKhusus) {
      aktif = k;
      for (const kk of Object.keys(el)) {
        el[kk].b.classList.toggle('aktif', kk === k);
        el[kk].panel.classList.toggle('aktif', kk === k);
      }
      const t = el[k];
      const url = urlKhusus || t.url;
      linkBaru.href = url;
      if (t.fr.getAttribute('src') !== url) {          // lazy load: iframe dimuat saat tab pertama dibuka
        t.muat.style.display = '';
        t.fr.src = url;
      }
      wadah.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    btnMuatUlang.onclick = e => {
      e.preventDefault();
      if (!aktif) return;
      el[aktif].muat.style.display = '';
      el[aktif].fr.src = el[aktif].fr.src;
    };

    wadah.append(judul, tabs, alat, panelWadah);
    pilihTab('lihat');
    return { wadah, pilihTab };
  }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function tampilkanHasil(barcode, hasil) {
    elIsiHasil.innerHTML = '';
    if (!hasil.rows.length) {
      const pesan = hasil.status === 'kosong' ? 'Tidak ditemukan di tabel (hasil filter kosong).'
        : hasil.status === 'timeout' ? 'Waktu habis: tabel tidak menampilkan barcode ini.'
        : 'Tidak ditemukan.';
      elIsiHasil.innerHTML = `<div class="tm-pesan" style="background:#fde8e8;color:#c00000;"><b>${esc(barcode)}</b> — ${pesan}</div>`;
      return;
    }
    const warna = hasil.status === 'ketemu' ? '#e6f7e6' : '#fde8e8';
    const judul = hasil.status === 'ketemu'
      ? `Ditemukan ${hasil.rows.length} baris`
      : `Barcode persis tidak ada; ${hasil.rows.length} hasil filter yang mirip`;
    const info = document.createElement('div');
    info.className = 'tm-pesan';
    info.style.background = warna;
    info.textContent = judul;

    // salin tabel asli: thead + baris yang cocok, supaya kolomnya persis sama dengan di halaman
    const asli = document.querySelector('#data_table_produk');
    const tabel = document.createElement('table');
    tabel.className = asli ? asli.className : '';
    const thead = asli && asli.querySelector('thead');
    if (thead) tabel.appendChild(thead.cloneNode(true));
    const tbody = document.createElement('tbody');
    const blokList = [];
    for (const r of hasil.rows) {
      const id = idProduk(r.tr);
      const tr = r.tr.cloneNode(true);
      tr.style.backgroundColor = warna;
      const blok = id ? buatBlokProduk(id, namaProduk(r.tr), r.barcode) : null;
      siapkanBarisClone(tr, blok);
      if (blok) blokList.push(blok.wadah);
      tbody.appendChild(tr);
    }
    tabel.appendChild(tbody);
    const bungkus = document.createElement('div');
    bungkus.className = 'tm-bungkus';
    bungkus.appendChild(tabel);
    elIsiHasil.append(info, bungkus, ...blokList);   // di bawah nama barang: tab 1 (Lihat) / 2 (Edit)
  }

  let sedangCari = false;
  async function cariBarcode() {
    if (sedangCari) return;
    const barcode = rapikan(elInput.value);
    if (!barcode) { elInput.focus(); return; }

    sedangCari = true;
    elBtnCari.disabled = true;
    elBtnCari.textContent = 'Mencari...';
    elIsiHasil.innerHTML = '';
    elStatus.textContent = 'Memasukkan barcode ke filter tabel...';
    try {
      const cara = await isiFilter(barcode);
      if (!cara) {
        elStatus.textContent = '';
        elIsiHasil.innerHTML = '<div class="tm-pesan" style="background:#fde8e8;color:#c00000;">Kolom filter/pencarian tabel tidak ditemukan di halaman ini. Buka console (F12), lihat log [ProdukOLZAP], dan kirim id/name input filternya.</div>';
        return;
      }
      log('Filter diisi via', cara, '->', barcode);
      elStatus.textContent = `Filter diisi (${cara}), menunggu hasil...`;
      const hasil = await tungguHasil(barcode);
      log('Hasil', hasil.status, hasil.rows);
      elStatus.textContent = `Filter: ${cara} | status: ${hasil.status} | baris di tabel: ${hasil.semua.length}`;
      sessionStorage.removeItem(KUNCI_PENDING);
      tampilkanHasil(barcode, hasil);
    } catch (e) {
      elStatus.textContent = '';
      elIsiHasil.innerHTML = `<div class="tm-pesan" style="background:#fde8e8;color:#c00000;">Error: ${esc(e.message)}</div>`;
      log(e);
    } finally {
      sedangCari = false;
      elBtnCari.disabled = false;
      elBtnCari.textContent = 'Cari';
      if (layarLebar()) { elInput.focus(); elInput.select(); }
    }
  }

  // ---------- tombol ----------
  function cariTombolMarketplace() {
    for (const el of document.querySelectorAll('a, button, input[type=button], input[type=submit]')) {
      const teks = (el.value || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (/tambah data marketplace/i.test(teks)) return el;
    }
    return null;
  }

  function buatTombol() {
    if (document.getElementById(ID_TOMBOL) || !document.body) return;
    pasangCss();

    const btn = document.createElement('button');
    btn.id = ID_TOMBOL;
    btn.type = 'button';
    btn.textContent = 'Produk OLZAP';
    btn.onclick = bukaModal;

    const acuan = cariTombolMarketplace();
    btn.className = acuan ? (acuan.className || 'btn') : 'btn btn-danger';
    btn.style.cssText = 'background-color:#dc3545 !important;border-color:#dc3545 !important;color:#fff !important;margin-left:4px;';

    if (acuan) acuan.insertAdjacentElement('afterend', btn);
    else {
      btn.classList.add('tm-fixed');
      btn.style.cssText += 'position:fixed;bottom:16px;right:16px;z-index:99999;';
      document.body.appendChild(btn);
    }
  }

  // ---------- inisialisasi ----------
  function init() {
    const obs = new MutationObserver(() => {
      if (document.querySelector('#data_table_produk') || cariTombolMarketplace()) buatTombol();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    buatTombol();
    lanjutkanSetelahReload();
  }

  // Filter yang men-submit form memuat ulang halaman -> modal hilang. Di sini dibuka lagi dan hasil ditampilkan.
  async function lanjutkanSetelahReload() {
    let pending = null;
    try { pending = JSON.parse(sessionStorage.getItem(KUNCI_PENDING)); } catch (e) { /* abaikan */ }
    if (!pending || !pending.barcode || Date.now() - pending.t > 60000) { sessionStorage.removeItem(KUNCI_PENDING); return; }
    sessionStorage.removeItem(KUNCI_PENDING);
    log('Lanjut setelah reload, barcode', pending.barcode);
    bukaModal();
    elInput.value = pending.barcode;
    elStatus.textContent = 'Halaman dimuat ulang oleh filter, menunggu hasil...';
    sedangCari = true;
    elBtnCari.disabled = true;
    try {
      const hasil = await tungguHasil(pending.barcode);
      elStatus.textContent = `Filter: reload halaman | status: ${hasil.status} | baris di tabel: ${hasil.semua.length}`;
      tampilkanHasil(pending.barcode, hasil);
    } finally {
      sedangCari = false;
      elBtnCari.disabled = false;
      elBtnCari.textContent = 'Cari';
    }
  }

  // ---------- mode iframe ----------
  // Halaman /produks/:id atau /edit yang dibuka di iframe modal: hanya sembunyikan header, tidak pasang tombol/modal
  const diDalamFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  if (diDalamFrame && new URL(location.href).searchParams.get(PARAM_IFRAME) === '1') {
    const pasang = () => {
      if (document.getElementById('tm_olzap_css_frame')) return;
      const st = document.createElement('style');
      st.id = 'tm_olzap_css_frame';
      st.textContent = CSS_IFRAME;
      (document.head || document.documentElement).appendChild(st);
    };
    pasang();
    document.addEventListener('DOMContentLoaded', pasang);

    // Halaman Edit: FAB Save di pojok kanan bawah -> memanggil simpan Erzap (tombol centang #ok yang disembunyikan)
    if (/\/edit\b/.test(location.pathname)) {
      const pasangFab = () => {
        if (!document.body || document.getElementById('tm_olzap_fab_save')) return;
        const fab = document.createElement('button');
        fab.id = 'tm_olzap_fab_save';
        fab.type = 'button';
        fab.title = 'Simpan';
        // ikon sama dengan tombol simpan asli Erzap (#ok: <i class="fa fa-check">); fallback teks centang kalau FontAwesome belum termuat
        fab.innerHTML = '<i class="fa fa-check" aria-hidden="true"></i><span class="tm-fab-label">Simpan</span>';
        setTimeout(() => {
          const i = fab.querySelector('i.fa');
          if (i && !/FontAwesome|Font Awesome/i.test(getComputedStyle(i).fontFamily)) i.replaceWith(document.createTextNode('✓'));
        }, 800);
        fab.onclick = () => {
          const okDisable = document.getElementById('ok_disable');
          if (okDisable && getComputedStyle(okDisable).display !== 'none') return;   // Erzap sedang memproses simpan
          fab.disabled = true;
          setTimeout(() => { fab.disabled = false; }, 3000);
          try {
            if (typeof window.submit_form_function === 'function') { window.submit_form_function(); return; }
            if (typeof window.submit_form2 === 'function') { window.submit_form2(); return; }
            const ok = document.getElementById('ok');
            if (ok) { ok.click(); return; }
            const f = document.querySelector('form.edit_produk, form[id^="edit_produk"], form[action*="/produks/"], form');
            if (f) { if (f.requestSubmit) f.requestSubmit(); else f.submit(); }
            else alert('Tombol simpan tidak ditemukan di halaman ini.');
          } catch (e) { fab.disabled = false; alert('Gagal simpan: ' + e.message); }
        };
        document.body.appendChild(fab);
      };
      pasangFab();
      document.addEventListener('DOMContentLoaded', pasangFab);
      // Ctrl+S / Cmd+S di dalam iframe = simpan
      document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); const f = document.getElementById('tm_olzap_fab_save'); if (f) f.click(); }
      });
    }
    // link di dalam iframe (mis. setelah simpan edit -> redirect) tetap membawa penanda supaya header tetap tersembunyi
    document.addEventListener('click', e => {
      const a = e.target && e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || /^javascript:/i.test(href) || a.target === '_blank') return;
      a.setAttribute('href', tandaiUrlFrame(href));
    }, true);
    return;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
