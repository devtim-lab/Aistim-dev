let scripts = [];
let autoScripts = [];
let currentTab = null;

const RELEASES_API_URL = 'https://api.github.com/repos/devtim-lab/Aistim-dev/releases/latest';
const CURRENT_VERSION = chrome.runtime.getManifest().version;

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('version-label').textContent = 'v' + CURRENT_VERSION;

  await detectPage();
  await renderList();

  document.getElementById('btn-update').addEventListener('click', () => checkUpdate(true));
  document.getElementById('btn-resync').addEventListener('click', forceResync);

  // Download update: buka via chrome.tabs (lebih andal daripada link di popup, terutama di Android)
  document.getElementById('update-link').addEventListener('click', (e) => {
    e.preventDefault();
    const url = e.currentTarget.href;
    try {
      chrome.tabs.create({ url: url });
    } catch (err) {
      window.open(url, '_blank');
    }
  });

  detectEngine();

  // Auto cek update diam-diam saat popup dibuka
  checkUpdate(false);
});

// ===== ENGINE STATUS (userScripts vs fallback) =====
function detectEngine() {
  const el = document.getElementById('engine-label');
  const warn = document.getElementById('us-warning');

  function setState(isActive) {
    if (isActive) {
      el.textContent = 'Engine: userScripts API ✅ (CSP-safe)';
      el.className = 'engine-label ok';
      if (warn) warn.style.display = 'none';
    } else {
      el.textContent = 'Engine: fallback — "Izinkan Skrip Pengguna" belum aktif!';
      el.className = 'engine-label warn';
      if (warn) warn.style.display = 'block';
    }
  }

  try {
    chrome.runtime.sendMessage({ action: 'us-status' }, (res) => {
      if (chrome.runtime.lastError || !res) { setState(false); return; }
      setState(!!res.userScripts);
    });
  } catch (e) {
    setState(false);
  }
}

// ===== FORCE RESYNC (tarik ulang daftar file dari folder GitHub) =====
function forceResync() {
  setStatus('Menarik ulang daftar script...', '#3b82f6');
  try {
    chrome.runtime.sendMessage({ action: 'resync' }, () => {
      if (chrome.runtime.lastError) {
        setStatus('Gagal resync.', '#dc2626');
        return;
      }
      setStatus('Daftar script diperbarui!', '#16a34a');
      setTimeout(renderList, 300);
    });
  } catch (e) {
    setStatus('Gagal resync.', '#dc2626');
  }
}

// ===== CEK UPDATE =====
// Bandingkan semver: return 1 jika a > b, -1 jika a < b, 0 jika sama
function compareVersion(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

async function checkUpdate(manual) {
  const btn = document.getElementById('btn-update');
  if (manual) btn.textContent = '⏳ Mengecek...';
  try {
    const res = await fetch(RELEASES_API_URL, {
      cache: 'no-store',
      headers: { 'Accept': 'application/vnd.github+json' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rel = await res.json();
    const tag = String(rel.tag_name || '');
    const latest = tag.replace(/^v/, '');
    if (!latest) throw new Error('Tag kosong');

    if (compareVersion(latest, CURRENT_VERSION) > 0) {
      // ZIP berversi: Aistim-dev-<versi>.zip
      document.getElementById('update-link').href =
        'https://github.com/devtim-lab/Aistim-dev/archive/refs/tags/' + tag + '.zip';
      document.getElementById('update-version').textContent = 'v' + latest;
      document.getElementById('update-bar').style.display = 'flex';
      document.getElementById('update-steps').style.display = 'block';
      if (manual) setStatus('Ada versi baru: v' + latest, '#16a34a');
    } else if (manual) {
      setStatus('Sudah versi terbaru (v' + CURRENT_VERSION + ')', '#16a34a');
    }
  } catch (err) {
    if (manual) setStatus('Gagal cek update. Cek koneksi internet.', '#dc2626');
  } finally {
    if (manual) btn.textContent = '🔄 Cek Update';
  }
}

async function detectPage() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];
  const el = document.getElementById('page-value');
  if (currentTab && currentTab.url) {
    const url = currentTab.url;
    if (url.startsWith('http')) {
      try { el.textContent = new URL(url).hostname + new URL(url).pathname; el.style.color = '#c2410c'; }
      catch { el.textContent = url; }
    } else { el.textContent = url; el.style.color = '#9ca3af'; }
  } else { el.textContent = 'Tidak diketahui'; el.style.color = '#9ca3af'; }
}

function parseMetadata(code) {
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

function matchUrl(url, patterns) {
  if (!patterns || patterns.length === 0) return true;
  return patterns.some(p => {
    if (!p) return false;
    try { return new RegExp(p.replace(/\*/g, '.*').replace(/\?/g, '\\?')).test(url); }
    catch (e) { return false; }
  });
}

async function fetchMetaFromUrl(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const code = await res.text();
    return parseMetadata(code);
  } catch (e) { return null; }
}

// ===== RENDER DAFTAR SCRIPT (auto + manual) =====
async function renderList() {
  const stored = await new Promise(r => chrome.storage.local.get(['scripts', 'autoScripts'], r));
  scripts = stored.scripts || [];
  autoScripts = stored.autoScripts || [];

  const container = document.getElementById('script-list');
  container.innerHTML = '';
  document.getElementById('script-count').textContent = '(' + (autoScripts.length + scripts.length) + ')';

  if (autoScripts.length === 0 && scripts.length === 0) {
    container.innerHTML = '<div class="empty">Folder scripts/ kosong / belum tersinkron.<br>Klik 🔄 untuk tarik ulang.</div>';
    return;
  }

  const pageUrl = currentTab && currentTab.url ? currentTab.url : '';

  // Auto scripts (dari folder GitHub) di atas, manual di bawah
  for (const script of autoScripts) await renderItem(container, script, pageUrl, true);
  for (const script of scripts) await renderItem(container, script, pageUrl, false);

  attachHandlers(container);
}

async function renderItem(container, script, pageUrl, isAuto) {
  const meta = await fetchMetaFromUrl(script.url);
  const allPatterns = meta ? [...meta.match, ...meta.include] : [];
  const isMatch = matchUrl(pageUrl, allPatterns);

  const div = document.createElement('div');
  div.className = 'script-item' + (isMatch ? ' match' : '');
  const badge = isAuto ? '<span class="badge-auto">AUTO</span>' : '';
  const toggleAttr = isAuto
    ? 'data-file="' + escapeHtml(script.file || '') + '"'
    : 'data-id="' + escapeHtml(script.id) + '"';
  const deleteBtn = isAuto
    ? ''
    : '<button class="btn-icon" data-del="' + escapeHtml(script.id) + '" title="Hapus">&#10005;</button>';

  div.innerHTML = `
    <div class="script-info">
      <div class="script-name">${badge}${escapeHtml(meta ? meta.name : 'Loading...')}</div>
      <div class="script-meta">v${escapeHtml(meta ? meta.version : '?')}</div>
      <div class="script-match">${escapeHtml(allPatterns.join(', ') || 'Semua halaman')} ${isMatch ? '✓ match' : ''}</div>
    </div>
    <div class="script-btns">
      <div class="toggle-switch ${script.enabled ? 'on' : ''}" ${toggleAttr}></div>
      ${deleteBtn}
    </div>
  `;
  container.appendChild(div);
}

function attachHandlers(container) {
  // Toggle script MANUAL
  container.querySelectorAll('.toggle-switch[data-id]').forEach(t => {
    t.addEventListener('click', (e) => {
      const id = e.target.dataset.id;
      const s = scripts.find(x => x.id === id);
      if (s) {
        s.enabled = !s.enabled;
        chrome.storage.local.set({ scripts: scripts }, () => {
          renderList();
          setStatus(s.enabled ? 'Script diaktifkan' : 'Script dinonaktifkan', '#16a34a');
        });
      }
    });
  });

  // Toggle script AUTO (via daftar disabledAuto)
  container.querySelectorAll('.toggle-switch[data-file]').forEach(t => {
    t.addEventListener('click', (e) => {
      const file = e.target.dataset.file;
      chrome.storage.local.get(['disabledAuto'], (d) => {
        let disabled = d.disabledAuto || [];
        const isCurrentlyDisabled = disabled.indexOf(file) !== -1;
        if (isCurrentlyDisabled) {
          disabled = disabled.filter(x => x !== file);
        } else {
          disabled.push(file);
        }
        chrome.storage.local.set({ disabledAuto: disabled }, () => {
          setStatus(isCurrentlyDisabled ? 'Script auto diaktifkan' : 'Script auto dinonaktifkan', '#16a34a');
          // background re-sync otomatis (storage.onChanged) & menulis ulang autoScripts
          setTimeout(renderList, 400);
        });
      });
    });
  });

  // Hapus script MANUAL (sisa dari versi lama)
  container.querySelectorAll('[data-del]').forEach(b => {
    b.addEventListener('click', (e) => {
      const id = e.target.dataset.del;
      if (confirm('Hapus script ini?')) {
        scripts = scripts.filter(s => s.id !== id);
        chrome.storage.local.set({ scripts: scripts }, () => {
          renderList();
          setStatus('Script dihapus', '#dc2626');
        });
      }
    });
  });
}

function setStatus(text, color) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.style.color = color;
  setTimeout(() => { el.textContent = ''; }, 4000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
