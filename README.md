# Aistim Tool v2.3.1

**AI Multi Userscript Manager** — red icon, paste URL support, auto @match detect.

## Fitur
- **Multi Script** — simpan banyak userscript
- **Paste URL** — tombol 📋 Paste dari clipboard
- **Auto Parse Metadata** — baca @name, @version, @match otomatis
- **Auto Match Detection** — script hanya jalan di URL yang cocok
- **Toggle Per Script** — ON/OFF per script
- **Hapus Script** — hapus yang tidak dipakai
- **Red Icon** — logo AISTIM dengan background merah

## Cara Install
1. Download ZIP dan ekstrak
2. Buka Chrome -> `chrome://extensions/`
3. Aktifkan **Mode developer**
4. Klik **Muat yang belum dibongkar** (Load unpacked)
5. Pilih folder `Aistim-dev`

## Cara Tambah Script
1. Klik **+ Tambah Script**
2. Klik **📋 Paste** — URL otomatis dari clipboard
3. Atau paste manual (Ctrl+V)
4. Klik **🔍 Cek Metadata** — @name, @version, @match muncul
5. Klik **💾 Simpan**

## Format Script
```javascript
// ==UserScript==
// @name         Nama Script
// @version      1.0.0
// @match        https://example.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    // kode kamu
})();
```

## Debug
Buka DevTools (F12) -> Console:
- `[Aistim] Content script loaded`
- `[Aistim] Fetching script: id url`
- `[Aistim] Metadata: Nama v1.0 @match: [...]`
- `[Aistim] ✅ Nama v1.0 done!`
