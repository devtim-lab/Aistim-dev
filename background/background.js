// Default scripts — semua script dari folder scripts/
const DEFAULT_SCRIPTS = [
  {
    id: 'pesananbaru',
    name: 'Erzap - Rekap Pesanan Baru per Outlet',
    url: 'https://raw.githubusercontent.com/devtim-lab/Aistim-dev/main/scripts/pesananbaru.js',
    enabled: true
  },
  {
    id: 'rekapbeban',
    name: 'Rekap Beban',
    url: 'https://raw.githubusercontent.com/devtim-lab/Aistim-dev/main/scripts/rekapbeban.js',
    enabled: true
  },
  {
    id: 'rekapstokmin',
    name: 'Rekap Stok Minus - Lihat Stok',
    url: 'https://raw.githubusercontent.com/devtim-lab/Aistim-dev/main/scripts/rekapstokmin.js',
    enabled: true
  },
  {
    id: 'koreksiso',
    name: 'Auto Koreksi, Simpan, & Reload - Erzap',
    url: 'https://raw.githubusercontent.com/devtim-lab/Aistim-dev/main/scripts/koreksiso.js',
    enabled: true
  },
  {
    id: 'aistimtool',
    name: 'AISTIM TOOL (Stok Opname)',
    url: 'https://raw.githubusercontent.com/devtim-lab/Aistim-dev/main/scripts/aistim_tool.js',
    enabled: true
  },
  {
    id: 'analisastok',
    name: 'Erzap - Analisa Stok',
    url: 'https://raw.githubusercontent.com/devtim-lab/Aistim-dev/main/scripts/analisastok.js',
    enabled: true
  }
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['scripts'], (data) => {
    if (!data.scripts || data.scripts.length === 0) {
      chrome.storage.local.set({ scripts: DEFAULT_SCRIPTS });
    }
  });
  console.log('[Aistim] v2.6.2 installed — 6 scripts including Analisa Stok');
});
