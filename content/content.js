(function() {
  'use strict';

  console.log('[Aistim] Content script loaded:', window.location.href);

  // ===== HARDCODED ERZAP (bypass CSP, no eval) =====
  function runErzap() {
    if (!window.location.href.includes('pesanan')) {
      console.log('[Aistim] Not pesanan page, skip Erzap');
      return;
    }
    console.log('[Aistim] Running hardcoded Erzap');

    // Auto Search outlet
    const i1 = setInterval(() => {
      const sel = document.querySelector('#pencarian_idoutlet_own');
      if (sel) {
        clearInterval(i1);
        sel.addEventListener('change', () => {
          const f = sel.closest('form');
          if (f) f.submit();
        });
      }
    }, 500);

    // Tombol Rekap Pesanan
    let attempts = 0;
    const btnInt = setInterval(() => {
      attempts++;
      if (attempts > 60) { clearInterval(btnInt); return; }
      const btns = Array.from(document.querySelectorAll('a, button, .btn, input[type="button"], input[type="submit"]'));
      const mkt = btns.find(el => {
        const t = (el.textContent || el.value || '').toLowerCase();
        return t.includes('marketplace') || t.includes('pesanan') || t.includes('cari');
      });
      if (mkt && !document.querySelector('#btn-rekap-pesanan')) {
        clearInterval(btnInt);
        const r = document.createElement('button');
        r.id = 'btn-rekap-pesanan';
        r.type = 'button';
        r.className = mkt.className || 'btn btn-primary';
        r.style.cssText = 'margin-right:8px;background:#28a745;border-color:#28a745;color:#fff;';
        r.innerHTML = '<i class="fa fa-list"></i> Rekap Pesanan';
        mkt.parentNode.insertBefore(r, mkt);
        r.addEventListener('click', rekap);
        console.log('[Aistim] ✅ Rekap button created!');
      }
    }, 500);

    async function rekap() {
      const sel = document.querySelector('#pencarian_idoutlet_own');
      if (!sel) return;
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
              updStatus('Proses [' + (i+1) + '/' + opts.length + ']: Halaman next ' + o.text + '...');
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
  }

  // ===== USERSCRIPT DINAMIS (inject via <script> tag, may fail on strict CSP) =====
  function matchUrl(url, patterns) {
    if (!patterns || patterns.length === 0) return true;
    return patterns.some(p => {
      if (!p) return false;
      try { return new RegExp(p.replace(/\*/g, '.*').replace(/\?/g, '\\?')).test(url); }
      catch (e) { return false; }
    });
  }

  function parseMeta(code) {
    const meta = { name: 'Unnamed', version: '1.0.0', match: [], include: [], exclude: [] };
    const bm = code.match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/);
    if (!bm) return meta;
    bm[1].split('\n').forEach(line => {
      const m = line.match(/\/\/\s*@(\w+)\s+(.*)/);
      if (!m) return;
      const k = m[1].toLowerCase(), v = m[2].trim();
      if (k === 'name') meta.name = v;
      if (k === 'version') meta.version = v;
      if (k === 'match') meta.match.push(v);
      if (k === 'include') meta.include.push(v);
      if (k === 'exclude') meta.exclude.push(v);
    });
    return meta;
  }

  async function runDynamicScripts() {
    const data = await new Promise(r => chrome.storage.local.get(['scripts'], r));
    const scripts = data.scripts || [];
    const pageUrl = window.location.href;

    if (!window.__aistimDyn) window.__aistimDyn = {};

    for (const script of scripts) {
      if (!script.enabled) continue;
      if (window.__aistimDyn[script.id]) continue;
      if (script.id === 'erzap-001') continue; // skip, already hardcoded

      try {
        console.log('[Aistim] Fetching dynamic:', script.id);
        const res = await fetch(script.url, { cache: 'no-store' });
        if (!res.ok) continue;
        const raw = await res.text();
        const meta = parseMeta(raw);
        const allP = [...meta.match, ...meta.include];
        if (allP.length > 0 && !matchUrl(pageUrl, allP)) {
          window.__aistimDyn[script.id] = true;
          continue;
        }
        if (meta.exclude.length > 0 && matchUrl(pageUrl, meta.exclude)) {
          window.__aistimDyn[script.id] = true;
          continue;
        }

        let code = raw;
        const me = raw.indexOf('// ==/UserScript==');
        if (me !== -1) code = raw.substring(me + '// ==/UserScript=='.length).trim();

        // Inject via <script> tag (may be blocked by CSP)
        const s = document.createElement('script');
        s.textContent = code;
        s.setAttribute('data-aistim-id', script.id);
        (document.head || document.documentElement).appendChild(s);

        window.__aistimDyn[script.id] = true;
        console.log('[Aistim] ✅ Dynamic injected:', meta.name);
      } catch (err) {
        console.error('[Aistim] ❌ Dynamic error:', script.id, err.message);
      }
    }
  }

  // ===== INIT =====
  // 1. Erzap hardcoded (always works)
  runErzap();

  // 2. Dynamic scripts (may fail on strict CSP)
  setTimeout(runDynamicScripts, 1000);

  // Re-check
  setTimeout(() => {
    if (!document.querySelector('#btn-rekap-pesanan')) runErzap();
  }, 3000);

  // Message from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'run') {
      console.log('[Aistim] Manual run from popup');
      window.__aistimLoaded = false;
      runErzap();
      runDynamicScripts();
      sendResponse({ success: true });
    }
    return true;
  });

  console.log('[Aistim] Content script ready');
})();
