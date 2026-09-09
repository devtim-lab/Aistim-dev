const VERSION = '2.4.0';

const DEFAULT_SCRIPTS = [
  {
    id: 'erzap-001',
    url: 'https://raw.githubusercontent.com/devtim-lab/AistimScript/main/pesananbaru.js',
    enabled: true
  }
];

// Shim: listener window 'load' tetap jalan walau script diinject setelah load selesai
const LOAD_SHIM = "window.addEventListener=(function(orig){return function(t,f,o){if(t==='load'&&document.readyState==='complete'){try{setTimeout(f,0);}catch(e){}return;}return orig.call(window,t,f,o);};})(window.addEventListener);";

// ===== METADATA PARSER =====
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

// Hanya terima match pattern format Chrome; fallback ke <all_urls>
function validMatchPatterns(patterns) {
  const ok = (patterns || []).filter(p =>
    p === '<all_urls>' || /^(\*|http|https|file|ftp):\/\/(\*|\*\.[^/]+|[^/*]+)\//.test(p)
  );
  return ok.length ? ok : ['<all_urls>'];
}

function isUserScriptsAvailable() {
  try {
    return !!(chrome.userScripts && chrome.userScripts.register);
  } catch (e) {
    return false; // API melempar error kalau belum diizinkan user
  }
}

// ===== SYNC: storage -> chrome.userScripts (CSP-safe engine) =====
async function syncUserScripts() {
  if (!isUserScriptsAvailable()) {
    console.log('[Aistim] userScripts API tidak tersedia — content script pakai fallback');
    return;
  }
  try {
    // Bersihkan registrasi lama milik Aistim
    const existing = await chrome.userScripts.getScripts();
    const managed = existing.filter(s => s.id.indexOf('aistim-') === 0).map(s => s.id);
    if (managed.length) await chrome.userScripts.unregister({ ids: managed });

    // Register ulang dari storage
    const data = await chrome.storage.local.get(['scripts']);
    const scripts = (data.scripts || []).filter(s => s.enabled);
    for (const s of scripts) {
      try {
        const res = await fetch(s.url, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        let code = await res.text();
        code = code.replace(/<\/script/gi, '<\\/script'); // aman untuk semua konteks
        const meta = parseMetadata(code);
        await chrome.userScripts.register([{
          id: 'aistim-' + s.id,
          matches: validMatchPatterns(meta.match),
          js: [{ code: LOAD_SHIM }, { code: code }],
          runAt: 'document_idle'
        }]);
        console.log('[Aistim] ✅ userScript registered:', meta.name, 'v' + meta.version);
      } catch (e) {
        console.error('[Aistim] ❌ Gagal register:', s.url, e);
      }
    }
  } catch (e) {
    console.error('[Aistim] userScripts sync error:', e);
  }
}

// ===== LIFECYCLE =====
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['scripts'], (data) => {
    if (!data.scripts || data.scripts.length === 0) {
      chrome.storage.local.set({ scripts: DEFAULT_SCRIPTS }, () => syncUserScripts());
    } else {
      syncUserScripts();
    }
  });
  console.log('[Aistim] v' + VERSION + ' installed — engine: userScripts API (CSP-safe)');
});

chrome.runtime.onStartup.addListener(() => syncUserScripts());

// Re-sync tiap ada perubahan daftar script dari popup
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.scripts) syncUserScripts();
});

// Status engine untuk content script & popup
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req && req.action === 'us-status') {
    (async () => {
      let active = false;
      try {
        if (isUserScriptsAvailable()) {
          const regs = await chrome.userScripts.getScripts();
          active = regs.some(s => s.id.indexOf('aistim-') === 0);
        }
      } catch (e) { active = false; }
      sendResponse({ userScripts: active, version: VERSION });
    })();
    return true; // async response
  }
  return false;
});
