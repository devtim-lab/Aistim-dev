const VERSION = '2.7.0';

// ===== KONFIGURASI =====
// Script dibundel di folder scripts/ (daftar ada di scripts/index.json)
// + auto-sync dari folder scripts/ di GitHub — versi lebih baru di GitHub otomatis dipakai
const REPO = {
  owner: 'devtim-lab',
  repo: 'Aistim-dev',
  branch: 'main',
  dir: 'scripts'
};
const LIST_CACHE_MS = 5 * 60 * 1000; // cache daftar file 5 menit (hemat rate limit GitHub API)

// Shim: listener window 'load' tetap jalan walau script diinject setelah load selesai
const LOAD_SHIM = "window.addEventListener=(function(orig){return function(t,f,o){if(t==='load'&&document.readyState==='complete'){try{setTimeout(f,0);}catch(e){}return;}return orig.call(window,t,f,o);};})(window.addEventListener);";

// ===== METADATA PARSER =====
function parseMetadata(code) {
  const meta = { name: 'Unnamed', version: '1.0.0', match: [], include: [], exclude: [], world: 'user_script' };
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
    // @world main -> script butuh konteks halaman (akses jQuery / variabel window milik situs)
    if (k === 'world') meta.world = v.toLowerCase();
  });
  return meta;
}

// Bandingkan versi: 1 jika a > b, -1 jika a < b, 0 jika sama (tahan format non-semver)
function compareVersion(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
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

// ===== BUNDLED: baca scripts/index.json + kode dari paket ekstensi =====
async function loadBundledScripts() {
  try {
    const idxRes = await fetch(chrome.runtime.getURL('scripts/index.json'));
    if (!idxRes.ok) throw new Error('HTTP ' + idxRes.status);
    const idx = await idxRes.json();
    const out = [];
    for (const file of (idx.scripts || [])) {
      try {
        const url = chrome.runtime.getURL('scripts/' + file);
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const code = await res.text();
        out.push({ file: file, code: code, meta: parseMetadata(code), extUrl: url, source: 'bundled' });
      } catch (e) {
        console.error('[Aistim] ❌ Gagal baca bundel:', file, e);
      }
    }
    return out;
  } catch (e) {
    console.error('[Aistim] ❌ scripts/index.json tidak terbaca:', e);
    return [];
  }
}

// ===== REMOTE: auto-sync dari folder scripts/ di GitHub =====
async function discoverRemoteFiles() {
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

async function loadRemoteScripts() {
  try {
    const files = await discoverRemoteFiles();
    const out = [];
    for (const f of files) {
      try {
        const res = await fetch(f.url, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const code = await res.text();
        out.push({ file: f.name, code: code, meta: parseMetadata(code), url: f.url, source: 'remote' });
      } catch (e) {
        console.error('[Aistim] ❌ Fetch remote gagal:', f.name, e);
      }
    }
    return out;
  } catch (e) {
    console.log('[Aistim] Remote sync dilewati (offline / rate limit) — pakai bundel saja');
    return [];
  }
}

// ===== MERGE: dedupe by @name, versi lebih tinggi menang =====
function mergeScripts(bundled, remote) {
  const byName = {};
  for (const s of bundled.concat(remote)) {
    const key = String(s.meta.name || s.file).toLowerCase();
    const cur = byName[key];
    if (!cur || compareVersion(s.meta.version, cur.meta.version) > 0) {
      byName[key] = s;
    }
  }
  return Object.values(byName);
}

// ===== MANUAL (legacy dari popup versi lama) =====
async function loadManualScripts() {
  const data = await chrome.storage.local.get(['scripts']);
  const manual = (data.scripts || []).filter(s => s.enabled);
  const out = [];
  for (const s of manual) {
    try {
      const res = await fetch(s.url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const code = await res.text();
      out.push({ file: s.id, code: code, meta: parseMetadata(code), url: s.url, source: 'manual', id: s.id });
    } catch (e) {
      console.error('[Aistim] ❌ Fetch manual gagal:', s.url, e);
    }
  }
  return out;
}

// ===== SYNC UTAMA =====
async function syncUserScripts() {
  const data = await chrome.storage.local.get(['disabledAuto']);
  const disabledAuto = data.disabledAuto || [];

  const bundled = await loadBundledScripts();
  const remote = await loadRemoteScripts();
  const manual = await loadManualScripts();

  // Gabung: auto (bundled+remote) dedupe by @name; manual digabung apa adanya
  const merged = mergeScripts(bundled, remote);
  const all = mergeScripts(merged, manual);

  // Status untuk popup: hanya script auto (bundled/remote) yang dapat toggle disabledAuto
  const auto = merged.map(s => ({
    id: 'auto-' + s.file,
    file: s.file,
    url: s.source === 'bundled' ? s.extUrl : s.url,
    enabled: disabledAuto.indexOf(s.file) === -1
  }));
  await chrome.storage.local.set({ autoScripts: auto });

  // Yang aktif = tidak di-disable via popup
  const active = all.filter(s => {
    if (s.source === 'manual') return true; // manual sudah difilter enabled di atas
    return disabledAuto.indexOf(s.file) === -1;
  });

  // Daftar untuk content script fallback (browser tanpa userScripts)
  await chrome.storage.local.set({
    effectiveScripts: active.map(s => ({
      id: (s.source === 'manual' ? s.id : 'auto-' + s.file),
      url: s.source === 'bundled' ? s.extUrl : s.url
    }))
  });

  // Register via userScripts API (CSP-safe) kalau tersedia
  if (!isUserScriptsAvailable()) {
    console.log('[Aistim] userScripts API tidak tersedia — content script pakai fallback');
    return;
  }
  try {
    const existing = await chrome.userScripts.getScripts();
    const managed = existing.filter(x => x.id.indexOf('aistim-') === 0).map(x => x.id);
    if (managed.length) await chrome.userScripts.unregister({ ids: managed });

    for (const s of active) {
      try {
        const code = s.code.replace(/<\/script/gi, '<\\/script');
        await chrome.userScripts.register([{
          id: 'aistim-' + (s.source === 'manual' ? s.id : 'auto-' + s.file),
          matches: validMatchPatterns(s.meta.match),
          js: [{ code: LOAD_SHIM }, { code: code }],
          runAt: 'document_idle',
          world: s.meta.world === 'main' ? 'MAIN' : 'USER_SCRIPT'
        }]);
        console.log('[Aistim] ✅ registered:', s.meta.name, 'v' + s.meta.version, '(' + s.source + (s.meta.world === 'main' ? ', MAIN world' : '') + ')');
      } catch (e) {
        console.error('[Aistim] ❌ Gagal register:', s.file || s.id, e);
      }
    }
    console.log('[Aistim] Sync selesai:', active.length, 'script aktif (' + merged.length + ' auto, ' + manual.length + ' manual)');
  } catch (e) {
    console.error('[Aistim] userScripts sync error:', e);
  }
}

// ===== LIFECYCLE =====
chrome.runtime.onInstalled.addListener(() => {
  syncUserScripts();
  console.log('[Aistim] v' + VERSION + ' installed — bundled scripts + auto-sync GitHub (CSP-safe)');
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
