# Aistim Tool v2.7.0

**AI Multi Userscript Manager** — script dibundel di folder `scripts/` + auto-sync dari GitHub. Engine `chrome.userScripts` — **CSP-safe** (jalan di Erzap).

## ✨ Cara Kerja
1. Semua script dibundel di folder **`scripts/`** (daftar ada di `scripts/index.json`)
2. Saat browser start / klik 🔄 di popup, ekstensi cek versi script yang sama di GitHub — **kalau versi di GitHub lebih baru, itu yang dipakai** (update script tanpa reinstall ekstensi)
3. Script didaftarkan via `chrome.userScripts` API → **kebal CSP halaman** (termasuk Erzap)
4. Dedupe otomatis: script dengan `@name` sama hanya jalan sekali (versi tertinggi menang)

## 📦 Menambah / Update Script
- **Di GitHub** (direkomendasikan): upload/edit file `.js` di folder `scripts/` → klik 🔄 di popup → langsung aktif
- **Di paket ekstensi**: taruh file di folder `scripts/` + tambahkan nama file ke `scripts/index.json` → reload ekstensi

Script tampil dengan badge **AUTO** di popup, bisa di-toggle ON/OFF. Menghapus script = hapus file + entri di `index.json`.

## Fitur
- **Engine userScripts** — CSP-safe, script jalan di dunia aman
- **Bundled + auto-sync** — jalan offline dari bundel; update otomatis dari GitHub
- **Load Shim** — listener `window.load` tetap jalan walau script telat diinject
- **Handshake Check** — badge hijau hanya kalau script benar-benar berjalan (mode fallback)
- **Cek Update** — notif versi baru + download ZIP berversi (`Aistim-dev-<versi>.zip`)

## Syarat
- **Chromium 120+** (Chrome / Kiwi / Edge / Brave / dll)
- **Chrome < 138**: Developer mode ON di `chrome://extensions/` (sudah pasti ON kalau load unpacked)
- **Chrome 138+**: aktifkan toggle **"Allow User Scripts"** di halaman detail ekstensi
- Browser lama (<120): engine fallback (script tag) — bisa diblokir CSP situs strict seperti Erzap

## Cara Install
1. Download ZIP (release terbaru) dan ekstrak
2. Buka Chrome -> `chrome://extensions/`
3. Aktifkan **Mode developer**
4. Klik **Muat yang belum dibongkar** (Load unpacked)
5. Pilih folder `Aistim-dev`
6. Buka popup — pastikan tertulis **"Engine: userScripts API ✅ (CSP-safe)"**

## Cara Pakai Erzap (Rekap Pesanan)
1. Buka halaman Erzap Pesanan Penjualan
2. Tunggu 1-3 detik — tombol **"Rekap Pesanan"** muncul otomatis

## Debug
Buka DevTools (F12) -> Console:
- `[Aistim] ===== Content script v2.7.0 loaded =====` — content script aktif
- `[Aistim] Engine: userScripts API (CSP-safe)` — engine utama aktif
- `[Aistim] ✅ registered: Nama v1.x (bundled/remote)` — script terdaftar (background)
- `[Aistim] ✅ Tombol Rekap Pesanan berhasil dibuat!` — tombol Erzap berhasil
- `[Aistim] ❌ Nama diblokir CSP` — fallback diblokir CSP (aktifkan userScripts)

## Changelog v2.7.0
- **Fix error CSP**: kembalikan engine `chrome.userScripts` (sempat hilang di v2.6.x → script jatuh ke script-tag yang diblokir CSP Erzap)
- Script bundel di folder `scripts/` + `index.json` — tanpa inject script tag, tanpa fetch GitHub saat offline
- Auto-sync: versi lebih baru di GitHub otomatis menang
- Hapus `aistim_tool_v18.js` dari bundel (duplikat versi lama AISTIM TOOL)
- Fix listener manual-run yang mengganggu

## Changelog v2.5.x
- v2.5.3: ZIP download berversi via GitHub Releases + auto release workflow
- v2.5.2: tombol download update lebih andal (chrome.tabs.create)
- v2.5.1: hapus tombol manual — semua serba otomatis
- v2.5.0: auto-load folder scripts dari GitHub
