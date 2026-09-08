// Default userscript untuk storage (popup dashboard)
const DEFAULT_USERSCRIPTS = [
  {
    id: 'erzap-rekap-001',
    name: 'Erzap — Rekap Pesanan Baru',
    enabled: true,
    match: 'https://trial.erzap.com/*pesanan*',
    code: '// [Hardcoded di content.js] Erzap Rekap Pesanan Baru'
  }
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('userscripts', (data) => {
    if (!data.userscripts || data.userscripts.length === 0) {
      chrome.storage.local.set({ userscripts: DEFAULT_USERSCRIPTS });
    }
  });
  console.log('[Aistim] v2.0.3 installed — Erzap hardcoded + userscript manager');
});
