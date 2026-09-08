const DEFAULT_CONFIG = {
  scriptUrl: 'https://raw.githubusercontent.com/devtim-lab/AistimScript/main/pesananbaru.js',
  scriptEnabled: true,
  scriptMatch: 'https://trial.erzap.com/*pesanan*'
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['scriptUrl', 'scriptEnabled', 'scriptMatch'], (data) => {
    const updates = {};
    if (!data.scriptUrl) updates.scriptUrl = DEFAULT_CONFIG.scriptUrl;
    if (data.scriptEnabled === undefined) updates.scriptEnabled = DEFAULT_CONFIG.scriptEnabled;
    if (!data.scriptMatch) updates.scriptMatch = DEFAULT_CONFIG.scriptMatch;
    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates);
    }
  });
  console.log('[Aistim] v2.1.0 installed — load scripts from URL');
});
