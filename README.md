# Aistim Tool v2.0.3

**AI Userscript Manager** — seperti Tampermonkey untuk Chrome Extension.

## Fitur
- **Erzap Auto** — tombol "Rekap Pesanan" muncul otomatis di halaman Erzap (hardcoded, paling reliable)
- **Userscript Manager** — add/edit/delete/toggle userscripts untuk situs lain
- **Auto Inject** — userscripts jalan otomatis via `new Function`
- **Popup Dashboard** — lihat status, jalankan manual, kelola scripts

## Cara Install
1. Download ZIP dan ekstrak
2. Buka Chrome -> `chrome://extensions/`
3. Aktifkan **Mode developer**
4. Klik **Muat yang belum dibongkar** (Load unpacked)
5. Pilih folder `Aistim-dev`

## Cara Pakai Erzap
1. Buka halaman Erzap Pesanan Penjualan
2. Tunggu 1-3 detik — tombol **"Rekap Pesanan"** muncul otomatis di sebelah kiri "Cari Pesanan Marketplace Online"
3. Klik tombol "Rekap Pesanan" untuk mulai rekap

## Debug
Buka DevTools (F12) -> Console, cari log:
- `[Aistim] Content script loaded` — content script aktif
- `[Aistim] Running direct Erzap logic` — Erzap logic dijalankan
- `[Aistim] ✅ Rekap button CREATED!` — tombol berhasil dibuat

## Struktur
- `content/content.js` — Hardcoded Erzap + userscript runner
- `popup/` — Dashboard manager
- `background/` — Default storage init
- `icons/` — Icon extension
