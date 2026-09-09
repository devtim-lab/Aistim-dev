const VERSION = '2.5.0';

// ===== KONFIGURASI REPO SCRIPTS (auto-discovery) =====
// Semua file .js di folder ini otomatis di-load — tanpa isi manual di popup
const REPO = {
  owner: 'devtim-lab',
  repo: 'AistimScript',
  branch: 'main',
  dir: 'scripts'
};
const LIST_CACHE_MS = 5 * 60 * 1000; // cache daftar file 5 menit (hemat rate limit GitHub API)

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

// ===== AUTO-DISCOVERY: baca daftar .js dari folder scripts/ di GitHub =====
async function discoverRepoScripts() {
  const cached = (await chrome.storage.local.get(['repoListCache'])).repoListCache;
  if (cached && Date.now() - cached.time < LIST_CACHE_MS) return cached.files;

  const api = 'https://api.github.com/repos/' + REPO.owner + '/' + REPO.repo +
              '/contents/' + REPO.dir + '?ref=' + REPO.branch;
  const res = await fetch(api, {
    cache: 'no-store',
    headers: { 'Accept': 'application/vnd.github+json' }
  });
  if (!res.ok) {
    if (cached) {
      console.warn('[Aistim] GitHub API ' + res.status + ' — pakai cache daftar file lama');
      return cached.files;
    }
    throw new Error('GitHub API ' + res.status);
  }
  const items = await res.json();
  const files = items
    .filter(f => f.type === 'file' && /\.js$/i.test(f.name))
    .map(f => ({
      name: f.name,
      url: 'https://raw.githubusercontent.com/' + REPO.owner + '/' + REPO.repo +
           '/' + REPO.branch + '/' + REPO.dir + '/' + f.name
    }));
  await chrome.storage.local.set({ repoListCache: { time: Date.now(), files: files } });
  return files;
}

// ===== SYNC UTAMA: folder GitHub + manual -> register =====
async function syncUserScripts() {
  // 1. Kumpulkan script: auto (folder GitHub) + manual (popup)
  const data = await chrome.storage.local.get(['scripts', 'disabledAuto']);
  const manual = (data.scripts || []).filter(s => s.enabled);
  const disabledAuto = data.disabledAuto || [];

  let auto = [];
  try {
    const files = await discoverRepoScripts();
    auto = files.map(f => ({
      id: 'auto-' + f.name,
      url: f.url,
      file: f.name,
      enabled: disabledAuto.indexOf(f.name) === -1
    }));
  } catch (e) {
    console.error('[Aistim] Auto-discovery gagal:', e);
  }
  await chrome.storage.local.set({ autoScripts: auto });
  const autoEnabled = auto.filter(s => s.enabled);

  // 2. Fetch kode + dedupe berdasarkan @name (manual prioritas)
  const seen = {};
  const effective = [];   // untuk registrasi userScripts
  const fallbackList = []; // untuk content script fallback
  for (const s of manual.concat(autoEnabled)) {
    try {
      const res = await fetch(s.url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      let code = await res.text();
      const meta = parseMetadata(code);
      const key = String(meta.name || s.url).toLowerCase();
      if (seen[key]) {
        console.log('[Aistim] Skip duplikat (@name sama):', meta.name);
        continue;
      }
      seen[key] = true;
      code = code.replace(/<\/script/gi, '<\\/script');
      effective.push({ id: s.id, code: code, meta: meta });
      fallbackList.push({ id: s.id, url: s.url });
    } catch (e) {
      console.error('[Aistim] ❌ Fetch gagal:', s.url, e);
    }
  }
  await chrome.storage.local.set({ effectiveScripts: fallbackList });

  // 3. Register via userScripts API (CSP-safe) kalau tersedia
  if (!isUserScriptsAvailable()) {
    console.log('[Aistim] userScripts API tidak tersedia — content script pakai fallback');
    return;
  }
  try {
    const existing = await chrome.userScripts.getScripts();
    const managed = existing.filter(s => s.id.indexOf('aistim-') === 0).map(s => s.id);
    if (managed.length) await chrome.userScripts.unregister({ ids: managed });

    for (const s of effective) {
      try {
        await chrome.userScripts.register([{
          id: 'aistim-' + s.id,
          matches: validMatchPatterns(s.meta.match),
          js: [{ code: LOAD_SHIM }, { code: s.code }],
          runAt: 'document_idle'
        }]);
        console.log('[Aistim] ✅ userScript registered:', s.meta.name, 'v' + s.meta.version);
      } catch (e) {
        console.error('[Aistim] ❌ Gagal register:', s.meta.name, e);
      }
    }
    console.log('[Aistim] Sync selesai:', effective.length, 'script aktif (' + autoEnabled.length + ' auto, ' + manual.length + ' manual)');
  } catch (e) {
    console.error('[Aistim] userScripts sync error:', e);
  }
}

// ===== LIFECYCLE =====
chrome.runtime.onInstalled.addListener(() => {
  syncUserScripts();
  console.log('[Aistim] v' + VERSION + ' installed — auto-load dari folder scripts/ GitHub');
});

chrome.runtime.onStartup.addListener(() => syncUserScripts());

// Re-sync saat daftar manual / toggle auto berubah dari popup
// (autoScripts & effectiveScripts sengaja TIDAK didengar — ditulis oleh sync sendiri)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.scripts || changes.disabledAuto)) syncUserScripts();
});

// ===== MESSAGING =====
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (!req || !req.action) return false;

  if (req.action === 'us-status') {
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

  if (req.action === 'resync') {
    // Paksa refresh: hapus cache daftar file lalu sync ulang
    (async () => {
      await chrome.storage.local.remove(['repoListCache']);
      await syncUserScripts();
      sendResponse({ ok: true });
    })();
    return true;
  }

  return false;
});
