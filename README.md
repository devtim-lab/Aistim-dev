# Aistim Tool v2.6.0

**AI Multi Userscript Manager** — semua script dari repo `AistimScript` sudah digabung ke sini.

## Scripts Tersedia (di folder `scripts/`)

| Script | @match | Keterangan |
|--------|--------|-----------|
| `pesananbaru.js` | `trial.erzap.com/pesanan_penjualans*` | Rekap Pesanan Baru per Outlet |
| `rekapbeban.js` | `trial.erzap.com/jurnals/index_transaksi_beban/new*` | Rekap Beban |
| `rekapstokmin.js` | `trial.erzap.com/produk_gudangs/lihat_stok/new*` | Rekap Stok Minus |
| `koreksiso.js` | `demo.erzap.com/stok_opnams/proses_koreksi_so/*` | Auto Koreksi SO |
| `aistim_tool.js` | `trial.erzap.com/stok_opnams/*` | AISTIM TOOL (Stok Opname) |
| `aistim_tool_v18.js` | `trial.erzap.com/stok_opnams/*` | AISTIM TOOL v18 |

## Cara Install
1. Download ZIP dari [GitHub Releases](https://github.com/devtim-lab/Aistim-dev/releases)
2. Buka Chrome -> `chrome://extensions/`
3. Aktifkan **Mode developer**
4. Klik **Muat yang belum dibongkar** (Load unpacked)
5. Pilih folder `Aistim-dev`

## Cara Pakai
1. Buka halaman Erzap yang sesuai dengan @match script
2. Script akan jalan otomatis berdasarkan @match
3. Atau klik icon Aistim Tool -> **▶ Jalankan Semua di Tab Ini**

## Struktur
```
Aistim-dev/
├── manifest.json
├── background/
│   └── background.js
├── content/
│   └── content.js
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── scripts/          ← Semua userscript dari AistimScript
│   ├── pesananbaru.js
│   ├── rekapbeban.js
│   ├── rekapstokmin.js
│   ├── koreksiso.js
│   ├── aistim_tool.js
│   └── aistim_tool_v18.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```
