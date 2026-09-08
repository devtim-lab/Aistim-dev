(function() {
  'use strict';

  console.log('[Aistim] Content script loaded:', window.location.href);

  function matchUrl(url, pattern) {
    if (!pattern || !url) return false;
    try {
      const regex = pattern.replace(/\*/g, '.*').replace(/\?/g, '\\?');
      return new RegExp(regex).test(url);
    } catch (e) { return false; }
  }

  async function loadAndRunScript() {
    const data = await new Promise(r => chrome.storage.local.get(['scriptUrl', 'scriptEnabled', 'scriptMatch'], r));
    const url = window.location.href;

    if (!data.scriptEnabled) {
      console.log('[Aistim] Script disabled in popup');
      return;
    }
    if (!matchUrl(url, data.scriptMatch || 'https://trial.erzap.com/*pesanan*')) {
      console.log('[Aistim] URL does not match pattern:', data.scriptMatch);
      return;
    }
    if (!data.scriptUrl) {
      console.log('[Aistim] No script URL configured');
      return;
    }

    // Cek sudah jalan belum di halaman ini
    if (window.__aistimLoaded) {
      console.log('[Aistim] Already loaded on this page');
      return;
    }

    try {
      console.log('[Aistim] Fetching script from:', data.scriptUrl);
      const res = await fetch(data.scriptUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const code = await res.text();

      console.log('[Aistim] Script fetched, length:', code.length);

      // Execute via new Function (content script context, DOM access OK)
      const fn = new Function(code);
      fn();

      window.__aistimLoaded = true;
      console.log('[Aistim] ✅ Script executed successfully!');
    } catch (err) {
      console.error('[Aistim] ❌ Failed to load/execute script:', err.message);
    }
  }

  // Auto run saat halaman load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(loadAndRunScript, 500));
  } else {
    setTimeout(loadAndRunScript, 500);
  }

  // Re-check setelah 3 detik (AJAX pages)
  setTimeout(() => {
    if (!window.__aistimLoaded) {
      console.log('[Aistim] Re-check after 3s...');
      loadAndRunScript();
    }
  }, 3000);

  // Listen message dari popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'run') {
      console.log('[Aistim] Manual run from popup');
      window.__aistimLoaded = false; // Force reload
      loadAndRunScript();
      sendResponse({ success: true });
    }
    return true;
  });
})();
