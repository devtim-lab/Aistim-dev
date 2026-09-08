(function() {
  'use strict';

  console.log('[Aistim] ===== Content script v2.3.3 loaded =====');
  console.log('[Aistim] URL:', window.location.href);
  console.log('[Aistim] Turbolinks?', !!window.Turbolinks);

  // ===== VISUAL DEBUG INDICATOR =====
  function showDebug(msg, color) {
    console.log('[Aistim]', msg);
    // Optional: show small indicator on page
    let ind = document.getElementById('aistim-debug');
    if (!ind) {
      ind = document.createElement('div');
      ind.id = 'aistim-debug';
      ind.style.cssText = 'position:fixed;bottom:5px;right:5px;z-index:999999;padding:4px 8px;font-size:10px;font-family:monospace;border-radius:4px;opacity:0.8;';
      document.body.appendChild(ind);
    }
    ind.style.background = color || '#333';
    ind.style.color = '#fff';
    ind.textContent = 'Aistim: ' + msg;
  }

  // ===== HARDCODED ERZAP =====
  function runErzap() {
    const url = window.location.href;
    if (!url.includes('pesanan') && !url.includes('penjualan')) {
      showDebug('Skip: not pesanan page', '#666');
      return false;
    }
    showDebug('Running Erzap...', '#3b82f6');

    // 1. Auto Search outlet
    const i1 = setInterval(() => {
      const sel = document.querySelector('#pencarian_idoutlet_own');
      if (sel) {
        clearInterval(i1);
        sel.addEventListener('change', () => {
          const f = sel.closest('form');
          if (f) f.submit();
        });
        showDebug('Outlet listener attached', '#22c55e');
      }
    }, 500);

    // 2. Tombol Rekap Pesanan — multiple selectors + persistent
    let attempts = 0;
    const maxAttempts = 40; // 40 x 500ms = 20 detik
    const btnInt = setInterval(() => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(btnInt);
        showDebug('Button not found after 20s', '#dc2626');
        return;
      }

      // Cek sudah ada
      if (document.querySelector('#btn-rekap-pesanan')) {
        clearInterval(btnInt);
        showDebug('Button already exists!', '#22c55e');
        return;
      }

      // Try multiple selectors
      let mkt = null;
      const selectors = [
        'a.btn:contains("Marketplace")',
        'button:contains("Marketplace")',
        '.btn:contains("Marketplace")',
        'a:contains("Cari")',
        'button:contains("Cari")',
        'input[value*="Marketplace"]',
        'input[value*="cari"]'
      ];

      // jQuery-like text search
      const allEls = Array.from(document.querySelectorAll('a, button, input[type="button"], input[type="submit"], .btn'));
      mkt = allEls.find(el => {
        const t = (el.textContent || el.value || el.innerText || '').toLowerCase();
        return t.includes('marketplace') || t.includes('pesanan') || t.includes('cari');
      });

      if (mkt) {
        showDebug('Found button: ' + (mkt.textContent || mkt.value || '').substring(0, 30), '#f59e0b');
      }

      if (mkt) {
        clearInterval(btnInt);
        const r = document.createElement('button');
        r.id = 'btn-rekap-pesanan';
        r.type = 'button';
        r.className = mkt.className || 'btn btn-primary';
        r.style.cssText = 'margin-right:8px;background:#28a745;border-color:#28a745;color:#fff;font-size:14px;padding:8px 16px;border-radius:4px;';
        r.innerHTML = 'Rekap Pesanan';
        mkt.parentNode.insertBefore(r, mkt);
        r.addEventListener('click', rekap);
        showDebug('✅ Rekap button CREATED!', '#22c55e');
      }
    }, 500);

    return true;
  }

  // ===== REKAP FUNCTION =====
  async function rekap() {
    showDebug('Rekap started...', '#3b82f6');
    const sel = document.querySelector('#pencarian_idoutlet_own');
    if (!sel) { showDebug('No outlet select', '#dc2626'); return; }
    let sp = '', sv = '';
    document.querySelectorAll('select').forEach(s => {
      Array.from(s.options).forEach(o => {
        if (o.text.toLowerCase().trim() === 'pesanan baru') { sp = s.name; sv = o.value; }
      });
    });
    const opts = Array.from(sel.options).filter(o => o.value !== '');
    const data = [];
    let total = 0;
    const form = sel.closest('form');
    const method = form ? (form.method || 'GET').toUpperCase() : 'GET';
    const action = form ? form.action : window.location.href;
    showLoading();
    for (let i = 0; i < opts.length; i++) {
      const o = opts[i];
      updStatus('Proses [' + (i+1) + '/' + opts.length + ']: ' + o.text + '...');
      try {
        const fd = new FormData(form);
        fd.set('pencarian[idoutlet_own]', o.value);
        if (sp && sv) fd.set(sp, sv);
        let url = action, params = { method: method };
        if (method === 'GET') url = action + '?' + new URLSearchParams(fd).toString();
        else params.body = fd;
        let cu = url, cp = params, ot = 0, hn = true, fi = true;
        while (hn && cu) {
          const rs = await fetch(cu, cp);
          const ht = await rs.text();
          const dc = new DOMParser().parseFromString(ht, 'text/html');
          if (fi) {
            const tx = dc.body.textContent || '';
            const m1 = tx.match(/dari\s+([\d.,]+)\s+data/i);
            if (m1) { ot = parseInt(m1[1].replace(/[.,]/g,''),10); break; }
            const m2 = tx.match(/Menampilkan\s+([\d.,]+)\s+data/i);
            if (m2) { ot = parseInt(m2[1].replace(/[.,]/g,''),10); break; }
            let c = 0;
            dc.querySelectorAll('table tbody tr').forEach(r => { if (r.querySelectorAll('td').length > 3) c++; });
            ot += c;
          } else {
            let c = 0;
            dc.querySelectorAll('table tbody tr').forEach(r => { if (r.querySelectorAll('td').length > 3) c++; });
            ot += c;
          }
          let nx = null;
          const rl = dc.querySelector('a[rel="next"]');
          if (rl) nx = rl.getAttribute('href');
          if (!nx) {
            dc.querySelectorAll('.pagination a, div[class*="pagin"] a, .pager a').forEach(a => {
              const t = a.textContent.toLowerCase().trim();
              if (!nx && (t === '>' || t === '&gt;' || t === 'next' || t === 'selanjutnya')) nx = a.getAttribute('href');
            });
          }
          if (nx && nx !== '#' && !nx.includes('javascript:')) {
            cu = nx.startsWith('http') ? nx : (nx.startsWith('/') ? window.location.origin + nx : window.location.origin + '/' + nx);
            cp = { method: 'GET' };
            fi = false;
            updStatus('Proses [' + (i+1) + '/' + opts.length + ']: Next page ' + o.text + '...');
          } else { hn = false; }
        }
        if (ot > 0) { data.push({ nama: o.text, jumlah: ot }); total += ot; }
      } catch (e) { console.error('Gagal:', o.text, e); }
    }
    showResult(data, total);
  }

  function showLoading() {
    delModal();
    const o = mkOverlay();
    o.innerHTML = '<div style="background:#fff;width:450px;border-radius:6px;box-shadow:0 4px 15px rgba(0,0,0,0.2);font-family:sans-serif;text-align:center;padding:30px;"><h3 style="margin-top:0;color:#333;">Memproses Rekap Data...</h3><p id="aistim-loading-status" style="color:#666;margin-bottom:20px;font-size:13px;">Mempersiapkan...</p><div style="width:100%;background:#eee;height:10px;border-radius:5px;overflow:hidden;"><div style="width:100%;height:100%;background:#28a745;animation:aistim-p 1s infinite linear;"></div></div></div><style>@keyframes aistim-p{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}</style>';
    document.body.appendChild(o);
  }
  function updStatus(t) {
    const el = document.getElementById('aistim-loading-status');
    if (el) el.innerText = t;
  }
  function showResult(data, total) {
    delModal();
    data.sort((a, b) => b.jumlah - a.jumlah);
    let rows = '';
    data.forEach(d => { rows += '<tr><td style="padding:8px;border-bottom:1px solid #ddd;">' + d.nama + '</td><td style="padding:8px;border-bottom:1px solid #ddd;text-align:center;font-weight:bold;color:#28a745;">' + d.jumlah + '</td></tr>'; });
    if (data.length === 0) rows = '<tr><td colspan="2" style="text-align:center;padding:15px;">Tidak ada <b>Pesanan Baru</b> di semua outlet.</td></tr>';
    const o = mkOverlay();
    o.innerHTML = '<div style="background:#fff;width:500px;border-radius:6px;box-shadow:0 4px 15px rgba(0,0,0,0.2);overflow:hidden;font-family:sans-serif;"><div style="background:#3c8dbc;color:#fff;padding:12px 15px;display:flex;justify-content:space-between;align-items:center;"><h3 style="margin:0;font-size:16px;">Rekap (Filter: Pesanan Baru)</h3><button id="aistim-close" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;">&times;</button></div><div style="padding:15px;max-height:350px;overflow-y:auto;"><table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f4f4f4;"><th style="padding:8px;text-align:left;border-bottom:2px solid #ddd;">Nama Outlet</th><th style="padding:8px;text-align:center;border-bottom:2px solid #ddd;">Jumlah Pesanan</th></tr></thead><tbody>' + rows + '</tbody></table><div style="margin-top:15px;padding-top:10px;font-weight:bold;text-align:right;font-size:16px;border-top:2px solid #333;">Total Pesanan Baru Keseluruhan: ' + total + '</div></div><div style="background:#f9f9f9;padding:10px 15px;text-align:right;border-top:1px solid #ddd;"><button id="aistim-close2" style="padding:6px 14px;background:#6c757d;color:#fff;border:none;border-radius:4px;cursor:pointer;">Tutup</button></div></div>';
    document.body.appendChild(o);
    document.getElementById('aistim-close').onclick = delModal;
    document.getElementById('aistim-close2').onclick = delModal;
    o.onclick = (e) => { if (e.target === o) delModal(); };
  }
  function mkOverlay() {
    const o = document.createElement('div');
    o.id = 'aistim-modal-overlay';
    o.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;justify-content:center;align-items:center;';
    return o;
  }
  function delModal() {
    const e = document.querySelector('#aistim-modal-overlay');
    if (e) e.remove();
  }

  // ===== INIT WITH MULTIPLE EVENTS =====
  function init() {
    showDebug('Init...', '#3b82f6');
    const ran = runErzap();
    if (ran) {
      // Keep checking for button
      let checks = 0;
      const checkInt = setInterval(() => {
        checks++;
        if (checks > 20) { clearInterval(checkInt); return; }
        if (document.querySelector('#btn-rekap-pesanan')) {
          clearInterval(checkInt);
          showDebug('Button confirmed!', '#22c55e');
        }
      }, 1000);
    }
  }

  // Run on various events
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Turbolinks support
  document.addEventListener('turbolinks:load', () => {
    showDebug('Turbolinks load', '#f59e0b');
    setTimeout(init, 500);
  });

  // Also listen to page show (back button)
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      showDebug('Page show (back)', '#f59e0b');
      setTimeout(init, 500);
    }
  });

  // Message from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'run') {
      showDebug('Manual run from popup', '#3b82f6');
      init();
      sendResponse({ success: true });
    }
    return true;
  });

  showDebug('Ready', '#22c55e');
})();
