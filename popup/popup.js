let allScripts = [];
let currentTab = null;
let editingId = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadScripts();
  await detectPage();
  renderList();

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    await loadScripts();
    await detectPage();
    renderList();
    setStatus('Daftar diperbarui', '#16a34a');
  });

  document.getElementById('btn-run').addEventListener('click', runMatchedScripts);
  document.getElementById('btn-add').addEventListener('click', () => openModal());
  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  document.getElementById('btn-save').addEventListener('click', saveScript);
});

async function loadScripts() {
  return new Promise((resolve) => {
    chrome.storage.local.get('userscripts', (data) => {
      allScripts = data.userscripts || [];
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
  } catch (e) {
    return false;
  }
}

function renderList() {
  const container = document.getElementById('script-list');
  container.innerHTML = '';

  if (allScripts.length === 0) {
    container.innerHTML = '<div class="empty">Belum ada userscript. Klik + Tambah.</div>';
    return;
  }

  const url = currentTab && currentTab.url ? currentTab.url : '';

  allScripts.forEach(script => {
    const isMatch = matchUrl(url, script.match);
    const div = document.createElement('div');
    div.className = 'script-item' + (isMatch ? ' match' : '');
    div.innerHTML = `
      <div class="script-info">
        <div class="script-name">${escapeHtml(script.name)}</div>
        <div class="script-match">${escapeHtml(script.match || '*')} ${isMatch ? '✓ match' : ''}</div>
      </div>
      <div class="script-btns">
        <div class="toggle-switch ${script.enabled ? 'on' : ''}" data-id="${script.id}"></div>
        <button class="btn-icon" data-edit="${script.id}" title="Edit">&#9998;</button>
        <button class="btn-icon" data-del="${script.id}" title="Hapus">&#10005;</button>
      </div>
    `;
    container.appendChild(div);
  });

  container.querySelectorAll('.toggle-switch').forEach(t => {
    t.addEventListener('click', (e) => {
      const id = e.target.dataset.id;
      const script = allScripts.find(s => s.id === id);
      if (script) {
        script.enabled = !script.enabled;
        chrome.storage.local.set({ userscripts: allScripts }, () => {
          renderList();
        });
      }
    });
  });

  container.querySelectorAll('[data-edit]').forEach(b => {
    b.addEventListener('click', (e) => {
      const id = e.target.dataset.edit;
      const script = allScripts.find(s => s.id === id);
      if (script) openModal(script);
    });
  });

  container.querySelectorAll('[data-del]').forEach(b => {
    b.addEventListener('click', (e) => {
      const id = e.target.dataset.del;
      if (confirm('Hapus userscript ini?')) {
        allScripts = allScripts.filter(s => s.id !== id);
        chrome.storage.local.set({ userscripts: allScripts }, () => {
          renderList();
          setStatus('Userscript dihapus', '#dc2626');
        });
      }
    });
  });
}

async function runMatchedScripts() {
  if (!currentTab || !currentTab.id) {
    setStatus('Tidak ada tab aktif', '#dc2626');
    return;
  }
  const url = currentTab.url || '';
  const matched = allScripts.filter(s => s.enabled && matchUrl(url, s.match));
  if (matched.length === 0) {
    setStatus('Tidak ada userscript yang match', '#f59e0b');
    return;
  }

  // Coba via message dulu
  try {
    const res = await chrome.tabs.sendMessage(currentTab.id, { action: 'inject' });
    if (res && res.success) {
      setStatus(matched.length + ' userscript diinject!', '#16a34a');
      return;
    }
  } catch (err) {
    console.log('[Aistim] Message failed, fallback to executeScript');
  }

  // Fallback: inject langsung via executeScript
  let count = 0;
  for (const script of matched) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: (code, id, name) => {
          if (document.querySelector('script[data-aistim-id="' + id + '"]')) return 'already';
          const s = document.createElement('script');
          s.textContent = code;
          s.setAttribute('data-aistim-id', id);
          s.setAttribute('data-aistim-name', name);
          (document.head || document.documentElement).appendChild(s);
          return 'injected';
        },
        args: [script.code, script.id, script.name]
      });
      count++;
    } catch (err) {
      console.log('[Aistim] Inject error:', err.message);
    }
  }
  setStatus(count + ' userscript diinject (fallback)!', '#16a34a');
}

function openModal(script) {
  editingId = script ? script.id : null;
  document.getElementById('modal-title').textContent = script ? 'Edit Userscript' : 'Tambah Userscript';
  document.getElementById('inp-name').value = script ? script.name : '';
  document.getElementById('inp-match').value = script ? script.match : 'https://*/*';
  document.getElementById('inp-code').value = script ? script.code : "(function() {\n  'use strict';\n  // kode kamu di sini\n})();";
  document.getElementById('modal-overlay').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  editingId = null;
}

function saveScript() {
  const name = document.getElementById('inp-name').value.trim();
  const match = document.getElementById('inp-match').value.trim();
  const code = document.getElementById('inp-code').value.trim();

  if (!name || !match || !code) {
    alert('Semua field wajib diisi!');
    return;
  }

  if (editingId) {
    const idx = allScripts.findIndex(s => s.id === editingId);
    if (idx >= 0) {
      allScripts[idx] = { ...allScripts[idx], name, match, code };
    }
  } else {
    const id = 'us-' + Date.now();
    allScripts.push({ id, name, match, code, enabled: true });
  }

  chrome.storage.local.set({ userscripts: allScripts }, () => {
    closeModal();
    renderList();
    setStatus(editingId ? 'Userscript diupdate' : 'Userscript ditambah', '#16a34a');
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
