(function() {
  'use strict';

  console.log('[Aistim] Content script loaded:', window.location.href);

  function parseMetadata(code) {
    const meta = { name: 'Unnamed', version: '1.0.0', match: [], include: [], exclude: [], grant: 'none' };
    const blockMatch = code.match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/);
    if (!blockMatch) return meta;
    const lines = blockMatch[1].split('\n');
    lines.forEach(line => {
      const m = line.match(/\/\/\s*@(\w+)\s+(.*)/);
      if (!m) return;
      const key = m[1].toLowerCase();
      const val = m[2].trim();
      if (key === 'name') meta.name = val;
      if (key === 'version') meta.version = val;
      if (key === 'match') meta.match.push(val);
      if (key === 'include') meta.include.push(val);
      if (key === 'exclude') meta.exclude.push(val);
      if (key === 'grant') meta.grant = val;
    });
    return meta;
  }

  function matchUrl(url, patterns) {
    if (!patterns || patterns.length === 0) return true;
    return patterns.some(p => {
      if (!p) return false;
      try {
        const r = p.replace(/\*/g, '.*').replace(/\?/g, '\\?');
        return new RegExp(r).test(url);
      } catch (e) { return false; }
    });
  }

  async function runAllScripts() {
    const data = await new Promise(r => chrome.storage.local.get(['scripts'], r));
    const scripts = data.scripts || [];
    const pageUrl = window.location.href;

    // Track which scripts already ran on this page
    if (!window.__aistimRan) window.__aistimRan = {};

    for (const script of scripts) {
      if (!script.enabled) continue;
      if (window.__aistimRan[script.id]) continue;

      try {
        console.log('[Aistim] Fetching script:', script.id, script.url);
        const res = await fetch(script.url, { cache: 'no-store' });
        if (!res.ok) { console.log('[Aistim] HTTP error', res.status, script.id); continue; }
        const rawCode = await res.text();

        const meta = parseMetadata(rawCode);
        console.log('[Aistim] Metadata:', meta.name, 'v' + meta.version, '@match:', meta.match);

        const allPatterns = [...meta.match, ...meta.include];
        if (allPatterns.length > 0 && !matchUrl(pageUrl, allPatterns)) {
          console.log('[Aistim] No match for', script.id, 'patterns:', allPatterns);
          window.__aistimRan[script.id] = true; // mark as checked
          continue;
        }
        if (meta.exclude.length > 0 && matchUrl(pageUrl, meta.exclude)) {
          console.log('[Aistim] Excluded', script.id);
          window.__aistimRan[script.id] = true;
          continue;
        }

        let codeToRun = rawCode;
        const metaEnd = rawCode.indexOf('// ==/UserScript==');
        if (metaEnd !== -1) {
          codeToRun = rawCode.substring(metaEnd + '// ==/UserScript=='.length).trim();
        }

        console.log('[Aistim] Executing', meta.name, 'v' + meta.version);
        const fn = new Function(codeToRun);
        fn();

        window.__aistimRan[script.id] = true;
        console.log('[Aistim] ✅', meta.name, 'v' + meta.version, 'done!');
      } catch (err) {
        console.error('[Aistim] ❌ Error running', script.id, ':', err.message);
      }
    }
  }

  // Auto run
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(runAllScripts, 500));
  } else {
    setTimeout(runAllScripts, 500);
  }

  setTimeout(() => {
    console.log('[Aistim] Re-check after 3s...');
    runAllScripts();
  }, 3000);

  // Message dari popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'run') {
      console.log('[Aistim] Manual run from popup');
      window.__aistimRan = {}; // clear cache, re-run all
      runAllScripts();
      sendResponse({ success: true });
    }
    return true;
  });
})();
