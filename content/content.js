(function() {
  'use strict';

  var VERSION = '2.7.7';
  console.log('[Aistim] ===== Content script v' + VERSION + ' loaded =====');
  console.log('[Aistim] URL:', window.location.href);

  // Shim: listener window 'load' tetap jalan walau script diinject setelah load selesai
  var LOAD_SHIM = "window.addEventListener=(function(orig){return function(t,f,o){if(t==='load'&&document.readyState==='complete'){try{setTimeout(f,0);}catch(e){}return;}return orig.call(window,t,f,o);};})(window.addEventListener);";

  // ===== SAFE DEBUG =====
  // Visual indicator hanya tampil saat ada aksi relevan — console selalu log.
  function showDebug(msg, color, silent) {
    console.log('[Aistim]', msg);
    if (silent) return; // hanya console, tanpa badge visual
    if (!document.body) return; // skip kalau body belum ready
    var ind = document.getElementById('aistim-debug');
    if (!ind) {
      ind = document.createElement('div');
      ind.id = 'aistim-debug';
      ind.style.cssText = 'position:fixed;bottom:5px;right:5px;z-index:999999;padding:4px 8px;font-size:10px;font-family:monospace;border-radius:4px;opacity:0.8;transition:all 0.3s;';
      document.body.appendChild(ind);
    }
    ind.style.background = color || '#333';
    ind.style.color = '#fff';
    ind.textContent = 'Aistim: ' + msg;
  }

  // ===== METADATA PARSER (untuk dynamic scripts) =====
  function parseMetadata(code) {
    var meta = { name: 'Unnamed', version: '1.0.0', match: [], include: [], exclude: [] };
    var bm = code.match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/);
    if (!bm) return meta;
    bm[1].split('\n').forEach(function(line) {
      var m = line.match(/\/\/\s*@(\w+)\s+(.*)/);
      if (!m) return;
      var k = m[1].toLowerCase(), v = m[2].trim();
      if (k === 'name') meta.name = v;
      if (k === 'version') meta.version = v;
      if (k === 'match') meta.match.push(v);
      if (k === 'include') meta.include.push(v);
      if (k === 'exclude') meta.exclude.push(v);
    });
    return meta;
  }

  function matchPattern(url, p) {
    if (!p) return false;
    try {
      var re = new RegExp(p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '\\?'));
      return re.test(url);
    } catch (e) { return false; }
  }

  function matchUrl(url, meta) {
    if (meta.exclude.some(function(p) { return matchPattern(url, p); })) return false;
    var pats = meta.match.concat(meta.include);
    if (pats.length === 0) return true;
    return pats.some(function(p) { return matchPattern(url, p); });
  }

  // ===== DYNAMIC SCRIPTS =====
  // Jalur utama: chrome.userScripts API di background (kebal CSP halaman).
  // Jalur fallback: inject <script> tag + handshake — untuk browser tanpa userScripts.

  // Penampung hasil handshake dari script yang diinject ke page world
  var execResults = {};
  document.addEventListener('aistim-exec', function(e) {
    try {
      var parts = String(e.detail).split('|');
      execResults[parts[1]] = { ok: parts[0] === 'ok', err: parts.slice(2).join('|') };
    } catch (err) {}
  });

  function runDynamicScripts() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      fallbackDynamic();
      return;
    }
    try {
      chrome.runtime.sendMessage({ action: 'us-status' }, function(res) {
        if (chrome.runtime.lastError) { fallbackDynamic(); return; }
        if (res && res.userScripts) {
          console.log('[Aistim] Engine: userScripts API (CSP-safe) — dynamic script dihandle background');
        } else {
          fallbackDynamic();
        }
      });
    } catch (e) { fallbackDynamic(); }
  }

  function fallbackDynamic() {
    console.log('[Aistim] Engine: fallback script-tag');
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    // effectiveScripts = gabungan bundled + remote + manual, sudah di-dedupe oleh background
    chrome.storage.local.get(['effectiveScripts', 'scripts'], function(data) {
      var list = (data.effectiveScripts && data.effectiveScripts.length)
        ? data.effectiveScripts
        : (data.scripts || []);
      var scripts = list.filter(function(s) { return s.enabled !== false; });
      if (scripts.length === 0) return;
      scripts.forEach(function(s) {
        fetch(s.url, { cache: 'no-store' })
          .then(function(res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.text();
          })
          .then(function(code) {
            var meta = parseMetadata(code);
            if (!matchUrl(window.location.href, meta)) {
              console.log('[Aistim] Skip (no match):', meta.name);
              return;
            }
            injectWithHandshake(s, code, meta);
          })
          .catch(function(err) {
            console.error('[Aistim] ❌ Fetch gagal:', s.url, err);
          });
      });
    });
  }

  function injectWithHandshake(s, code, meta) {
    // Escape penutup tag script di dalam kode user
    code = code.replace(/<\/script/gi, '<\\/script');
    var wrapped = LOAD_SHIM + '\ntry {\n' + code +
      '\ndocument.dispatchEvent(new CustomEvent("aistim-exec",{detail:"ok|' + s.id + '"}));' +
      '\n} catch(e) { document.dispatchEvent(new CustomEvent("aistim-exec",{detail:"err|' + s.id + '|"+(e&&e.message)})); }';

    var tag = document.createElement('script');
    tag.textContent = wrapped;
    (document.head || document.documentElement).appendChild(tag);
    tag.remove(); // eksekusi terjadi saat append (kecuali diblokir CSP)

    // Handshake: baru bilang OK kalau script BENAR-BENAR jalan
    setTimeout(function() {
      var r = execResults[s.id];
      if (r && r.ok) {
        showDebug('Dynamic OK: ' + meta.name, '#22c55e');
        console.log('[Aistim] ✅ Dynamic injected:', meta.name, 'v' + meta.version);
      } else if (r && !r.ok) {
        showDebug('❌ ' + meta.name + ' error', '#dc2626');
        console.error('[Aistim] ❌ Script error:', meta.name, r.err);
      } else {
        showDebug('❌ ' + meta.name + ' diblokir CSP', '#dc2626');
        console.error('[Aistim] ❌ ' + meta.name + ' diblokir CSP situs ini. Solusi: aktifkan userScripts (browser Chromium 120+ / developer mode).');
      }
    }, 2000);
  }

  // ===== HARDCODED ERZAP (CSP-SAFE) =====
  function runErzap() {
    var path = window.location.pathname;
    if (path.indexOf('pesanan') === -1 && path.indexOf('penjualan') === -1) {
      showDebug('Bukan halaman pesanan. Path: ' + path, null, true); // console only
      return false;
    }
    showDebug('Running Erzap...', '#3b82f6');

    // Auto Search outlet (dengan batas percobaan)
    var outletAttempts = 0;
    var i1 = setInterval(function() {
      outletAttempts++;
      if (outletAttempts > 40) { clearInterval(i1); return; }
      var sel = document.querySelector('#pencarian_idoutlet_own');
      if (sel) {
        clearInterval(i1);
        sel.addEventListener('change', function() {
          var f = sel.closest('form');
          if (f) f.submit();
        });
        showDebug('Outlet OK', '#22c55e');
      }
    }, 500);

    // Tombol Rekap Pesanan
    var attempts = 0;
    var btnInt = setInterval(function() {
      attempts++;
      if (attempts > 40) {
        clearInterval(btnInt);
        showDebug('Tombol tidak ditemukan', '#dc2626');
        return;
      }
      if (document.querySelector('#btn-rekap-pesanan')) {
        clearInterval(btnInt);
        showDebug('Tombol sudah ada!', '#22c55e');
        return;
      }
      var allEls = Array.prototype.slice.call(document.querySelectorAll('a, button, input[type="button"], input[type="submit"], .btn'));
      var mkt = null;
      for (var i = 0; i < allEls.length; i++) {
        var el = allEls[i];
        var t = (el.textContent || el.value || el.innerText || '').toLowerCase();
        if (t.indexOf('marketplace') !== -1 || t.indexOf('pesanan') !== -1 || t.indexOf('cari') !== -1) {
          mkt = el; break;
        }
      }
      if (mkt) {
        clearInterval(btnInt);
        var r = document.createElement('button');
        r.id = 'btn-rekap-pesanan';
        r.type = 'button';
        r.className = mkt.className || 'btn btn-primary';
        r.style.cssText = 'margin-right:8px;background:#28a745;border-color:#28a745;color:#fff;font-size:14px;padding:8px 16px;border-radius:4px;';
        r.textContent = 'Rekap Pesanan';
        mkt.parentNode.insertBefore(r, mkt);
        r.addEventListener('click', rekap);
        showDebug('Tombol dibuat!', '#22c55e');
        console.log('[Aistim] ✅ Tombol Rekap Pesanan berhasil dibuat!');
      }
    }, 500);
    return true;
  }

  // ===== REKAP =====
  async function rekap() {
    showDebug('Rekap...', '#3b82f6');
    var sel = document.querySelector('#pencarian_idoutlet_own');
    if (!sel) { showDebug('Outlet tidak ditemukan', '#dc2626'); return; }
    var sp = '', sv = '';
    document.querySelectorAll('select').forEach(function(s) {
      Array.prototype.slice.call(s.options).forEach(function(o) {
        if (o.text.toLowerCase().trim() === 'pesanan baru') { sp = s.name; sv = o.value; }
      });
    });
    var opts = Array.prototype.slice.call(sel.options).filter(function(o) { return o.value !== ''; });
    var data = [];
    var total = 0;
    var form = sel.closest('form');
    var method = form ? (form.method || 'GET').toUpperCase() : 'GET';
    var action = form ? form.action : window.location.href;
    showLoading();
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      updStatus('Proses [' + (i+1) + '/' + opts.length + ']: ' + o.text + '...');
      try {
        var fd = form ? new FormData(form) : new FormData();
        fd.set('pencarian[idoutlet_own]', o.value);
        if (sp && sv) fd.set(sp, sv);
        var url = action, params = { method: method };
        if (method === 'GET') url = action + '?' + new URLSearchParams(fd).toString();
        else params.body = fd;
        var cu = url, cp = params, ot = 0, hn = true, fi = true;
        while (hn && cu) {
          var rs = await fetch(cu, cp);
          var ht = await rs.text();
          var dc = new DOMParser().parseFromString(ht, 'text/html');
          if (fi) {
            var tx = dc.body.textContent || '';
            var m1 = tx.match(/dari\s+([\d.,]+)\s+data/i);
            if (m1) { ot = parseInt(m1[1].replace(/[.,]/g,''),10); break; }
            var m2 = tx.match(/Menampilkan\s+([\d.,]+)\s+data/i);
            if (m2) { ot = parseInt(m2[1].replace(/[.,]/g,''),10); break; }
            var c1 = 0;
            dc.querySelectorAll('table tbody tr').forEach(function(r) { if (r.querySelectorAll('td').length > 3) c1++; });
            ot += c1;
          } else {
            var c2 = 0;
            dc.querySelectorAll('table tbody tr').forEach(function(r) { if (r.querySelectorAll('td').length > 3) c2++; });
            ot += c2;
          }
          var nx = null;
          var rl = dc.querySelector('a[rel="next"]');
          if (rl) nx = rl.getAttribute('href');
          if (!nx) {
            dc.querySelectorAll('.pagination a, div[class*="pagin"] a, .pager a').forEach(function(a) {
              var t = a.textContent.toLowerCase().trim();
              if (!nx && (t === '>' || t === '&gt;' || t === 'next' || t === 'selanjutnya')) nx = a.getAttribute('href');
            });
          }
          if (nx && nx !== '#' && nx.indexOf('javascript:') === -1) {
            cu = nx.indexOf('http') === 0 ? nx : (nx.charAt(0) === '/' ? window.location.origin + nx : window.location.origin + '/' + nx);
            cp = { method: 'GET' };
            fi = false;
            updStatus('Proses [' + (i+1) + '/' + opts.length + ']: Next ' + o.text + '...');
          } else { hn = false; }
        }
        if (ot > 0) { data.push({ nama: o.text, jumlah: ot }); total += ot; }
      } catch (e) { console.error('Gagal:', o.text, e); }
    }
    showResult(data, total);
  }

  function showLoading() {
    delModal();
    var o = mkOverlay();
    o.innerHTML = '<div style="background:#fff;width:450px;border-radius:6px;box-shadow:0 4px 15px rgba(0,0,0,0.2);font-family:sans-serif;text-align:center;padding:30px;"><h3 style="margin-top:0;color:#333;">Memproses Rekap Data...</h3><p id="aistim-loading-status" style="color:#666;margin-bottom:20px;font-size:13px;">Mempersiapkan...</p><div style="width:100%;background:#eee;height:10px;border-radius:5px;overflow:hidden;"><div style="width:100%;height:100%;background:#28a745;animation:aistim-p 1s infinite linear;"></div></div></div><style>@keyframes aistim-p{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}</style>';
    document.body.appendChild(o);
  }
  function updStatus(t) {
    var el = document.getElementById('aistim-loading-status');
    if (el) el.innerText = t;
  }
  function showResult(data, total) {
    delModal();
    data.sort(function(a, b) { return b.jumlah - a.jumlah; });
    var rows = '';
    data.forEach(function(d) { rows += '<tr><td style="padding:8px;border-bottom:1px solid #ddd;">' + d.nama + '</td><td style="padding:8px;border-bottom:1px solid #ddd;text-align:center;font-weight:bold;color:#28a745;">' + d.jumlah + '</td></tr>'; });
    if (data.length === 0) rows = '<tr><td colspan="2" style="text-align:center;padding:15px;">Tidak ada <b>Pesanan Baru</b> di semua outlet.</td></tr>';
    var o = mkOverlay();
    o.innerHTML = '<div style="background:#fff;width:500px;border-radius:6px;box-shadow:0 4px 15px rgba(0,0,0,0.2);overflow:hidden;font-family:sans-serif;"><div style="background:#3c8dbc;color:#fff;padding:12px 15px;display:flex;justify-content:space-between;align-items:center;"><h3 style="margin:0;font-size:16px;">Rekap (Filter: Pesanan Baru)</h3><button id="aistim-close" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;">&times;</button></div><div style="padding:15px;max-height:350px;overflow-y:auto;"><table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f4f4f4;"><th style="padding:8px;text-align:left;border-bottom:2px solid #ddd;">Nama Outlet</th><th style="padding:8px;text-align:center;border-bottom:2px solid #ddd;">Jumlah Pesanan</th></tr></thead><tbody>' + rows + '</tbody></table><div style="margin-top:15px;padding-top:10px;font-weight:bold;text-align:right;font-size:16px;border-top:2px solid #333;">Total Pesanan Baru Keseluruhan: ' + total + '</div></div><div style="background:#f9f9f9;padding:10px 15px;text-align:right;border-top:1px solid #ddd;"><button id="aistim-close2" style="padding:6px 14px;background:#6c757d;color:#fff;border:none;border-radius:4px;cursor:pointer;">Tutup</button></div></div>';
    document.body.appendChild(o);
    document.getElementById('aistim-close').onclick = delModal;
    document.getElementById('aistim-close2').onclick = delModal;
    o.onclick = function(e) { if (e.target === o) delModal(); };
  }
  function mkOverlay() {
    var o = document.createElement('div');
    o.id = 'aistim-modal-overlay';
    o.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;justify-content:center;align-items:center;';
    return o;
  }
  function delModal() {
    var e = document.querySelector('#aistim-modal-overlay');
    if (e) e.remove();
  }

  // ===== INIT =====
  function init() {
    if (!document.body) {
      console.log('[Aistim] Body belum ready, tunggu...');
      setTimeout(init, 300);
      return;
    }
    runErzap();          // hardcoded (CSP-safe)
    runDynamicScripts(); // userScripts engine / fallback
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Turbolinks / SPA navigation
  document.addEventListener('turbolinks:load', function() { setTimeout(init, 500); });
  window.addEventListener('pageshow', function(e) { if (e.persisted) setTimeout(init, 500); });
})();
