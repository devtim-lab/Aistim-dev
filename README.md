# Aistim Tool v2.3.5

**AI Userscript Manager** — red icon, paste URL, CSP-safe Erzap.

## Fitur
- **Erzap Hardcoded** — tombol "Rekap Pesanan" langsung jalan tanpa eval (CSP-safe)
- **Dynamic Scripts** — userscript lain inject via `<script>` tag (site non-CSP)
- **Paste URL** — tombol 📋 Paste dari clipboard
- **Auto Parse Metadata** — @name, @version, @match otomatis
- **Multi Script** — simpan banyak userscript
- **Red Icon** — logo AISTIM background merah

## Cara Install
1. Download ZIP dan ekstrak
2. Buka Chrome -> `chrome://extensions/`
3. Aktifkan **Mode developer**
4. Klik **Muat yang belum dibongkar** (Load unpacked)
5. Pilih folder `Aistim-dev`

## Cara Pakai Erzap
1. Buka halaman Erzap Pesanan Penjualan
2. Tunggu 1-3 detik — tombol **"Rekap Pesanan"** muncul otomatis
3. Tidak perlu klik apa-apa di popup!

## Cara Tambah Script Lain
1. Klik **+ Tambah Script**
2. Klik **📋 Paste** atau paste manual URL raw GitHub
3. Klik **🔍 Cek Metadata**
4. Klik **💾 Simpan**
5. Refresh halaman target — script otomatis jalan kalau `@match` cocok

## Catatan CSP
- **Erzap** — selalu jalan karena hardcoded (tidak pakai eval)
- **Script dinamis** — mungkin gagal di site dengan CSP strict (seperti Erzap). Untuk site tersebut, gunakan script hardcoded.

## Changelog v2.3.5
- Fix path service worker di manifest (`background/background.js`)
- Fix syntax error di background service worker (`chrome.runtime`)
- Dynamic script runner aktif di content script (fetch -> parse @match -> inject)
- Interval outlet dibatasi (tidak looping selamanya)
- Debug badge hanya tampil saat ada aksi relevan (tidak muncul di semua website)

## Debug
Buka DevTools (F12) -> Console:
- `[Aistim] ===== Content script v2.3.5 loaded =====` — content script aktif
- `[Aistim] ✅ Tombol Rekap Pesanan berhasil dibuat!` — tombol berhasil dibuat
- `[Aistim] ✅ Dynamic injected: Nama` — script dinamis berhasil
- `[Aistim] ❌ Dynamic error: ...` — script dinamis gagal (CSP / fetch)
