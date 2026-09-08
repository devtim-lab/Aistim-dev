# Aistim Tool v2.3.0

**AI Multi Userscript Manager** — simpan banyak script, auto detect @match @version dari metadata.

## Fitur
- **Multi Script** — simpan banyak userscript dari berbagai URL
- **Auto Parse Metadata** — baca @name, @version, @match, @include, @exclude otomatis
- **Auto Match Detection** — script hanya jalan di URL yang cocok dengan @match
- **Toggle Per Script** — aktifkan/nonaktifkan script satu per satu
- **Hapus Script** — hapus script yang tidak dipakai
- **Tambah Script** — paste URL raw GitHub, cek metadata, simpan
- **Jalankan Semua** — inject semua script yang match ke tab saat ini

## Cara Install
1. Download ZIP dan ekstrak
2. Buka Chrome -> `chrome://extensions/`
3. Aktifkan **Mode developer**
4. Klik **Muat yang belum dibongkar** (Load unpacked)
5. Pilih folder `Aistim-dev`

## Cara Pakai
1. Klik icon **Aistim Tool** di toolbar Chrome
2. Klik **+ Tambah Script**
3. Paste URL raw GitHub (contoh: `https://raw.githubusercontent.com/user/repo/main/script.js`)
4. Klik **🔍 Cek Metadata** — nama, versi, @match akan muncul otomatis
5. Klik **💾 Simpan**
6. Buka halaman yang cocok dengan @match — script jalan otomatis
7. Klik **▶ Jalankan Semua** untuk inject manual

## Format Script (Metadata Block)
```javascript
// ==UserScript==
// @name         Nama Script
// @version      1.0.0
// @match        https://example.com/*
// @match        https://example2.com/page*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    // kode kamu
})();
```

## Debug
Buka DevTools (F12) -> Console:
- `[Aistim] Content script loaded` — content script aktif
- `[Aistim] Fetching script: id url` — sedang fetch
- `[Aistim] Metadata: Nama v1.0 @match: [...]` — metadata terbaca
- `[Aistim] ✅ Nama v1.0 done!` — script berhasil jalan

## Struktur
- `manifest.json` — v2.3.0
- `popup/` — Dashboard multi script: list, toggle, add, delete, run
- `background/` — Init default scripts
- `content/` — Fetch & execute semua script yang match
- `icons/` — Icon AISTIM logo
