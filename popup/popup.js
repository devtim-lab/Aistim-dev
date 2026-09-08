let scripts = [];
let currentTab = null;
let previewMeta = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadScripts();
  await detectPage();
  renderList();

  document.getElementById('btn-run-all').addEventListener('click', runAllScripts);
  document.getElementById('btn-add').addEventListener('click', openModal);
  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  document.getElementById('btn-fetch').addEventListener('click', fetchPreview);
  document.getElementById('btn-save').addEventListener('click', saveNewScript);
  document.getElementById('btn-paste').addEventListener('click', pasteFromClipboard);
});

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      document.getElementById('inp-url').value = text.trim();
      setStatus('URL dipaste dari clipboard!', '#16a34a');
      // Auto fetch metadata after paste
      setTimeout(() => fetchPreview(), 300);
    } else {
      setStatus('Clipboard kosong!', '#f59e0b');
    }
  } catch (err) {
    setStatus('Gagal paste. Coba paste manual (Ctrl+V).', '#dc2626');
  }
}

async function loadScripts() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['scripts'], (data) => {
      scripts = data.scripts || [];
      document.getElementById('script-count').textContent = '(' + scripts.length + ')';
      resolve();
    });
  });
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

async function renderList() {
  const container = document.getElementById('script-list');
  container.innerHTML = '';

  if (scripts.length === 0) {
    container.innerHTML = '<div class="empty">Belum ada script. Klik + Tambah Script.</div>';
    return;
  }

  const pageUrl = currentTab && currentTab.url ? currentTab.url : '';

  for (const script of scripts) {
    const meta = await fetchMetaFromUrl(script.url);
    const allPatterns = meta ? [...meta.match, ...meta.include] : [];
    const isMatch = matchUrl(pageUrl, allPatterns);

    const div = document.createElement('div');
    div.className = 'script-item' + (isMatch ? ' match' : '');
    div.innerHTML = `
      <div class="script-info">
        <div class="script-name">${escapeHtml(meta ? meta.name : 'Loading...')}</div>
        <div class="script-meta">v${escapeHtml(meta ? meta.version : '?')} | ${scripts.indexOf(script) + 1}/${scripts.length}</div>
        <div class="script-match">${escapeHtml(allPatterns.join(', ') || 'Semua halaman')} ${isMatch ? '✓ match' : ''}</div>
      </div>
      <div class="script-btns">
        <div class="toggle-switch ${script.enabled ? 'on' : ''}" data-id="${script.id}"></div>
        <button class="btn-icon" data-del="${script.id}" title="Hapus">&#10005;</button>
      </div>
    `;
    container.appendChild(div);
  }

  container.querySelectorAll('.toggle-switch').forEach(t => {
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

  container.querySelectorAll('[data-del]').forEach(b => {
    b.addEventListener('click', (e) => {
      const id = e.target.dataset.del;
      if (confirm('Hapus script ini?')) {
        scripts = scripts.filter(s => s.id !== id);
        chrome.storage.local.set({ scripts: scripts }, () => {
          loadScripts().then(renderList);
          setStatus('Script dihapus', '#dc2626');
        });
      }
    });
  });
}

async function runAllScripts() {
  if (!currentTab || !currentTab.id) {
    setStatus('Tidak ada tab aktif', '#dc2626');
    return;
  }
  setStatus('Mengirim perintah ke tab...', '#3b82f6');
  try {
    const res = await chrome.tabs.sendMessage(currentTab.id, { action: 'run' });
    if (res && res.success) {
      setStatus('Semua script dijalankan! Cek halaman.', '#16a34a');
    } else {
      setStatus('Gagal menjalankan.', '#dc2626');
    }
  } catch (err) {
    setStatus('Content script belum load. Refresh halaman.', '#f59e0b');
  }
}

function openModal() {
  document.getElementById('inp-url').value = '';
  document.getElementById('meta-preview').style.display = 'none';
  previewMeta = null;
  document.getElementById('modal-overlay').style.display = 'flex';
  // Auto focus input
  setTimeout(() => document.getElementById('inp-url').focus(), 100);
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  previewMeta = null;
}

async function fetchPreview() {
  const url = document.getElementById('inp-url').value.trim();
  if (!url) { setStatus('Masukkan URL dulu!', '#dc2626'); return; }

  setStatus('Mengambil metadata...', '#3b82f6');
  const meta = await fetchMetaFromUrl(url);
  if (!meta) { setStatus('Gagal fetch URL. Cek link raw GitHub.', '#dc2626'); return; }

  previewMeta = meta;
  document.getElementById('preview-name').textContent = meta.name;
  document.getElementById('preview-version').textContent = meta.version;
  document.getElementById('preview-match').textContent = meta.match.join(', ') || 'Semua halaman';
  document.getElementById('meta-preview').style.display = 'block';
  setStatus('Metadata ditemukan! Klik Simpan.', '#16a34a');
}

function saveNewScript() {
  const url = document.getElementById('inp-url').value.trim();
  if (!url) { setStatus('URL tidak boleh kosong!', '#dc2626'); return; }

  const id = 'us-' + Date.now();
  scripts.push({ id, url, enabled: true });
  chrome.storage.local.set({ scripts: scripts }, () => {
    closeModal();
    loadScripts().then(renderList);
    setStatus('Script ditambah! ' + (previewMeta ? previewMeta.name : ''), '#16a34a');
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
