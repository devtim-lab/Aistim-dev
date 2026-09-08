# Aistim Tool v2.1.0

**AI Userscript Manager** — load scripts dari URL raw GitHub.

## Fitur
- **Paste URL Raw GitHub** — masukkan link script JS, simpan, auto-run
- **Match Pattern** — tentukan URL pattern mana yang aktif
- **Toggle On/Off** — aktifkan/nonaktifkan script dari popup
- **Load & Run Manual** — klik tombol untuk inject script ke tab saat ini
- **Default Script** — sudah preset URL Erzap

## Cara Install
1. Download ZIP dan ekstrak
2. Buka Chrome -> `chrome://extensions/`
3. Aktifkan **Mode developer**
4. Klik **Muat yang belum dibongkar** (Load unpacked)
5. Pilih folder `Aistim-dev`

## Cara Pakai
1. Buka halaman Erzap Pesanan Penjualan
2. Klik icon **Aistim Tool** di toolbar Chrome
3. Popup akan tampilkan:
   - URL Script (default: raw GitHub Erzap)
   - Match Pattern (default: `https://trial.erzap.com/*pesanan*`)
   - Toggle Aktifkan
4. Klik **💾 Simpan** untuk simpan konfigurasi
5. Klik **▶ Load & Run** untuk inject script ke halaman saat ini
6. Tombol **"Rekap Pesanan"** akan muncul di halaman Erzap

## Ganti Script
1. Upload script JS ke GitHub
2. Dapatkan **raw URL** (klik tombol "Raw" di GitHub)
3. Paste URL ke field "URL Raw GitHub" di popup
4. Sesuaikan "Match Pattern" kalau perlu
5. Klik **💾 Simpan**

## Debug
Buka DevTools (F12) -> Console, cari log:
- `[Aistim] Content script loaded` — content script aktif
- `[Aistim] Fetching script from: ...` — sedang fetch URL
- `[Aistim] ✅ Script executed successfully!` — script berhasil jalan
- `[Aistim] ❌ Failed to load/execute script: ...` — error fetch/execute

## Struktur
- `manifest.json` — Konfigurasi extension v3
- `popup/` — Dashboard: input URL, toggle, save, run
- `background/` — Init default config
- `content/` — Fetch URL → execute via `new Function`
- `icons/` — Icon extension
