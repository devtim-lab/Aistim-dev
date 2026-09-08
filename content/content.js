(function() {
  'use strict';

  console.log('[Aistim] Content script loaded:', window.location.href);

  // ===== HARDCODED ERZAP FALLBACK =====
  // Ini selalu jalan di halaman Erzap pesanan, tanpa perlu userscript storage
  function runErzapDirect() {
    if (!window.location.href.includes('pesanan')) {
      console.log('[Aistim] Not pesanan page, skip direct Erzap');
      return;
    }
    console.log('[Aistim] Running direct Erzap logic');

    // Auto Search saat Outlet Berubah
    const interval1 = setInterval(() => {
      const outletSelect = document.querySelector('#pencarian_idoutlet_own');
      if (outletSelect) {
        clearInterval(interval1);
        outletSelect.addEventListener('change', function() {
          const form = outletSelect.closest('form');
          if (form) form.submit();
        });
      }
    }, 500);

    // Tombol Rekap Pesanan — persistent search
    let attempts = 0;
    const maxAttempts = 60;
    const btnInterval = setInterval(() => {
      attempts++;
      if (attempts > maxAttempts) { clearInterval(btnInterval); return; }

      const allBtns = Array.from(document.querySelectorAll('a, button, .btn, input[type="button"], input[type="submit"]'));
      const marketBtn = allBtns.find(el => {
        const t = (el.textContent || el.value || '').toLowerCase();
        return t.includes('marketplace') || t.includes('pesanan') || t.includes('cari');
      });

      if (marketBtn && !document.querySelector('#btn-rekap-pesanan')) {
        clearInterval(btnInterval);
        const rekapBtn = document.createElement('button');
        rekapBtn.id = 'btn-rekap-pesanan';
        rekapBtn.type = 'button';
        rekapBtn.className = marketBtn.className || 'btn btn-primary';
        rekapBtn.style.cssText = 'margin-right:8px;background:#28a745;border-color:#28a745;color:#fff;';
        rekapBtn.innerHTML = '<i class="fa fa-list"></i> Rekap Pesanan';
        marketBtn.parentNode.insertBefore(rekapBtn, marketBtn);
        rekapBtn.addEventListener('click', mulaiRekap);
        console.log('[Aistim] ✅ Rekap button CREATED!');
      }
    }, 500);

    async function mulaiRekap() {
      const outletSelect = document.querySelector('#pencarian_idoutlet_own');
      if (!outletSelect) return;
      let statusParamName = '', statusBaruValue = '';
      document.querySelectorAll('select').forEach(sel => {
        Array.from(sel.options).forEach(opt => {
          if (opt.text.toLowerCase().trim() === 'pesanan baru') {
            statusParamName = sel.name;
            statusBaruValue = opt.value;
          }
        });
      });
      const options = Array.from(outletSelect.options).filter(opt => opt.value !== '');
      const rekapData = [];
      let totalSemua = 0;
      const searchForm = outletSelect.closest('form');
      const formMethod = searchForm ? (searchForm.method || 'GET').toUpperCase() : 'GET';
      const formAction = searchForm ? searchForm.action : window.location.href;
      tampilkanLoading();
      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        updateStatus('Proses [' + (i+1) + '/' + options.length + ']: Memeriksa ' + opt.text + '...');
        try {
          const formData = new FormData(searchForm);
          formData.set('pencarian[idoutlet_own]', opt.value);
          if (statusParamName && statusBaruValue) formData.set(statusParamName, statusBaruValue);
          let fetchUrl = formAction, fetchParams = { method: formMethod };
          if (formMethod === 'GET') {
            fetchUrl = formAction + '?' + new URLSearchParams(formData).toString();
          } else {
            fetchParams.body = formData;
          }
          let currentUrl = fetchUrl, currentParams = fetchParams;
          let outletTotal = 0, hasNext = true, isFirst = true;
          while (hasNext && currentUrl) {
            const res = await fetch(currentUrl, currentParams);
            const html = await res.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            if (isFirst) {
              const text = doc.body.textContent || '';
              const m = text.match(/dari\s+([\d.,]+)\s+data/i);
              if (m) { outletTotal = parseInt(m[1].replace(/[.,]/g,''),10); break; }
              const m2 = text.match(/Menampilkan\s+([\d.,]+)\s+data/i);
              if (m2) { outletTotal = parseInt(m2[1].replace(/[.,]/g,''),10); break; }
              let c = 0;
              doc.querySelectorAll('table tbody tr').forEach(r => { if (r.querySelectorAll('td').length > 3) c++; });
              outletTotal += c;
            } else {
              let c = 0;
              doc.querySelectorAll('table tbody tr').forEach(r => { if (r.querySelectorAll('td').length > 3) c++; });
              outletTotal += c;
            }
            let next = null;
            const rel = doc.querySelector('a[rel="next"]');
            if (rel) next = rel.getAttribute('href');
            if (!next) {
              doc.querySelectorAll('.pagination a, div[class*="pagin"] a, .pager a').forEach(a => {
                const t = a.textContent.toLowerCase().trim();
                if (!next && (t === '>' || t === '&gt;' || t === 'next' || t === 'selanjutnya')) next = a.getAttribute('href');
              });
            }
            if (next && next !== '#' && !next.includes('javascript:')) {
              currentUrl = next.startsWith('http') ? next : (next.startsWith('/') ? window.location.origin + next : window.location.origin + '/' + next);
              currentParams = { method: 'GET' };
              isFirst = false;
              updateStatus('Proses [' + (i+1) + '/' + options.length + ']: Halaman selanjutnya ' + opt.text + '...');
            } else {
              hasNext = false;
            }
          }
          if (outletTotal > 0) { rekapData.push({ nama: opt.text, jumlah: outletTotal }); totalSemua += outletTotal; }
        } catch (e) { console.error('Gagal: ' + opt.text, e); }
      }
      tampilkanHasil(rekapData, totalSemua);
    }

    function tampilkanLoading() {
      hapusModal();
      const overlay = buatOverlay();
      overlay.innerHTML = '<div style="background:#fff;width:450px;border-radius:6px;box-shadow:0 4px 15px rgba(0,0,0,0.2);font-family:sans-serif;text-align:center;padding:30px;"><h3 style="margin-top:0;color:#333;">Memproses Rekap Data...</h3><p id="aistim-loading-status" style="color:#666;margin-bottom:20px;font-size:13px;">Mempersiapkan...</p><div style="width:100%;background:#eee;height:10px;border-radius:5px;overflow:hidden;"><div style="width:100%;height:100%;background:#28a745;animation:aistim-progress 1s infinite linear;"></div></div></div><style>@keyframes aistim-progress{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}</style>';
      document.body.appendChild(overlay);
    }
    function updateStatus(text) {
      const el = document.getElementById('aistim-loading-status');
      if (el) el.innerText = text;
    }
    function tampilkanHasil(rekapData, totalSemua) {
      hapusModal();
      rekapData.sort((a, b) => b.jumlah - a.jumlah);
      let rows = '';
      rekapData.forEach(d => { rows += '<tr><td style="padding:8px;border-bottom:1px solid #ddd;">' + d.nama + '</td><td style="padding:8px;border-bottom:1px solid #ddd;text-align:center;font-weight:bold;color:#28a745;">' + d.jumlah + '</td></tr>'; });
      if (rekapData.length === 0) rows = '<tr><td colspan="2" style="text-align:center;padding:15px;">Tidak ada <b>Pesanan Baru</b> di semua outlet.</td></tr>';
      const overlay = buatOverlay();
      overlay.innerHTML = '<div style="background:#fff;width:500px;border-radius:6px;box-shadow:0 4px 15px rgba(0,0,0,0.2);overflow:hidden;font-family:sans-serif;"><div style="background:#3c8dbc;color:#fff;padding:12px 15px;display:flex;justify-content:space-between;align-items:center;"><h3 style="margin:0;font-size:16px;">Rekap (Filter: Pesanan Baru)</h3><button id="aistim-close" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;">&times;</button></div><div style="padding:15px;max-height:350px;overflow-y:auto;"><table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f4f4f4;"><th style="padding:8px;text-align:left;border-bottom:2px solid #ddd;">Nama Outlet</th><th style="padding:8px;text-align:center;border-bottom:2px solid #ddd;">Jumlah Pesanan</th></tr></thead><tbody>' + rows + '</tbody></table><div style="margin-top:15px;padding-top:10px;font-weight:bold;text-align:right;font-size:16px;border-top:2px solid #333;">Total Pesanan Baru Keseluruhan: ' + totalSemua + '</div></div><div style="background:#f9f9f9;padding:10px 15px;text-align:right;border-top:1px solid #ddd;"><button id="aistim-close2" style="padding:6px 14px;background:#6c757d;color:#fff;border:none;border-radius:4px;cursor:pointer;">Tutup</button></div></div>';
      document.body.appendChild(overlay);
      document.getElementById('aistim-close').onclick = hapusModal;
      document.getElementById('aistim-close2').onclick = hapusModal;
      overlay.onclick = (e) => { if (e.target === overlay) hapusModal(); };
    }
    function buatOverlay() {
      const o = document.createElement('div');
      o.id = 'aistim-modal-overlay';
      o.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;justify-content:center;align-items:center;';
      return o;
    }
    function hapusModal() {
      const e = document.querySelector('#aistim-modal-overlay');
      if (e) e.remove();
    }
  }

  // ===== USERSCRIPT MANAGER (untuk situs lain) =====
  function matchUrl(url, pattern) {
    if (!pattern || !url) return false;
    try {
      const regex = pattern.replace(/\*/g, '.*').replace(/\?/g, '\\?');
      return new RegExp(regex).test(url);
    } catch (e) { return false; }
  }

  function runUserscripts() {
    chrome.storage.local.get('userscripts', (data) => {
      const scripts = data.userscripts || [];
      const url = window.location.href;
      scripts.forEach(script => {
        if (!script.enabled) return;
        if (!matchUrl(url, script.match)) return;
        try {
          console.log('[Aistim] Running userscript:', script.name);
          const fn = new Function(script.code);
          fn();
        } catch (e) {
          console.error('[Aistim] Userscript error:', script.name, e);
        }
      });
    });
  }

  // ===== INIT =====
  // 1. Hardcoded Erzap (paling reliable)
  runErzapDirect();

  // 2. Userscripts dari storage (untuk situs lain)
  setTimeout(runUserscripts, 1000);

  // Re-check setelah 3 detik (AJAX pages)
  setTimeout(() => {
    if (!document.querySelector('#btn-rekap-pesanan')) {
      console.log('[Aistim] Re-checking for Erzap button...');
      runErzapDirect();
    }
  }, 3000);

  // Listen message dari popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'inject') {
      console.log('[Aistim] Manual inject from popup');
      runErzapDirect();
      runUserscripts();
      sendResponse({ success: true, url: window.location.href });
    }
    return true;
  });

  console.log('[Aistim] Content script ready');
})();
