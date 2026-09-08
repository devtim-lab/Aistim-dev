const DEFAULT_SCRIPTS = [
  {
    id: 'erzap-001',
    url: 'https://raw.githubusercontent.com/devtim-lab/AistimScript/main/pesananbaru.js',
    enabled: true
  }
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['scripts'], (data) => {
    if (!data.scripts || data.scripts.length === 0) {
      chrome.storage.local.set({ scripts: DEFAULT_SCRIPTS });
    }
  });
  console.log('[Aistim] v2.3.2 installed — Erzap hardcoded, dynamic via script tag');
});
