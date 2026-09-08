let currentTab = null;
let config = {};

document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  await detectPage();
  updateUI();

  document.getElementById('toggle-enabled').addEventListener('click', toggleEnabled);
  document.getElementById('btn-save-url').addEventListener('click', saveConfig);
  document.getElementById('btn-run-url').addEventListener('click', runScript);
});

async function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['scriptUrl', 'scriptMatch', 'scriptEnabled'], (data) => {
      config = {
        scriptUrl: data.scriptUrl || 'https://raw.githubusercontent.com/devtim-lab/AistimScript/main/pesananbaru.js',
        scriptMatch: data.scriptMatch || 'https://trial.erzap.com/*pesanan*',
        scriptEnabled: data.scriptEnabled !== false
      };
      resolve();
    });
  });
}

async function detectPage() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];
  const pageValue = document.getElementById('page-value');
  if (currentTab && currentTab.url) {
    const url = currentTab.url;
    if (url.startsWith('http')) {
      try {
        const u = new URL(url);
        pageValue.textContent = u.hostname + u.pathname;
        pageValue.style.color = '#c2410c';
      } catch {
        pageValue.textContent = url;
      }
    } else {
      pageValue.textContent = url;
      pageValue.style.color = '#9ca3af';
    }
  } else {
    pageValue.textContent = 'Tidak diketahui';
    pageValue.style.color = '#9ca3af';
  }
}

function matchUrl(url, pattern) {
  if (!pattern || !url) return false;
  try {
    const regex = pattern.replace(/\*/g, '.*').replace(/\?/g, '\\?');
    return new RegExp(regex).test(url);
  } catch (e) { return false; }
}

function updateUI() {
  document.getElementById('inp-url').value = config.scriptUrl;
  document.getElementById('inp-match').value = config.scriptMatch;

  const toggle = document.getElementById('toggle-enabled');
  if (config.scriptEnabled) {
    toggle.classList.add('on');
  } else {
    toggle.classList.remove('on');
  }

  const statusEl = document.getElementById('script-status');
  const url = currentTab && currentTab.url ? currentTab.url : '';
  const isMatch = matchUrl(url, config.scriptMatch);

  if (!config.scriptEnabled) {
    statusEl.textContent = 'Script dinonaktifkan';
    statusEl.className = 'script-status off';
  } else if (isMatch) {
    statusEl.textContent = '✓ Halaman cocok — script akan jalan otomatis';
    statusEl.className = 'script-status ok';
  } else {
    statusEl.textContent = '✗ Halaman tidak cocok dengan pattern';
    statusEl.className = 'script-status err';
  }
}

function toggleEnabled() {
  config.scriptEnabled = !config.scriptEnabled;
  chrome.storage.local.set({ scriptEnabled: config.scriptEnabled }, () => {
    updateUI();
    setStatus(config.scriptEnabled ? 'Script diaktifkan' : 'Script dinonaktifkan', '#16a34a');
  });
}

function saveConfig() {
  const url = document.getElementById('inp-url').value.trim();
  const match = document.getElementById('inp-match').value.trim();

  if (!url) {
    setStatus('URL tidak boleh kosong!', '#dc2626');
    return;
  }
  if (!match) {
    setStatus('Pattern tidak boleh kosong!', '#dc2626');
    return;
  }

  config.scriptUrl = url;
  config.scriptMatch = match;

  chrome.storage.local.set({
    scriptUrl: url,
    scriptMatch: match
  }, () => {
    updateUI();
    setStatus('Konfigurasi disimpan!', '#16a34a');
  });
}

async function runScript() {
  if (!currentTab || !currentTab.id) {
    setStatus('Tidak ada tab aktif', '#dc2626');
    return;
  }
  if (!config.scriptEnabled) {
    setStatus('Script dinonaktifkan, aktifkan dulu!', '#f59e0b');
    return;
  }

  const url = currentTab.url || '';
  if (!matchUrl(url, config.scriptMatch)) {
    setStatus('Halaman tidak cocok dengan pattern!', '#dc2626');
    return;
  }

  setStatus('Mengirim perintah ke tab...', '#3b82f6');

  try {
    const res = await chrome.tabs.sendMessage(currentTab.id, { action: 'run' });
    if (res && res.success) {
      setStatus('Script dijalankan! Cek tombol di halaman.', '#16a34a');
    } else {
      setStatus('Gagal menjalankan script.', '#dc2626');
    }
  } catch (err) {
    setStatus('Content script belum load. Refresh halaman.', '#f59e0b');
  }
}

function setStatus(text, color) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.style.color = color;
  setTimeout(() => { el.textContent = ''; }, 4000);
}
