# Aistim Tool v2.5.2

**AI Userscript Manager** — auto-load semua script dari folder `scripts/` GitHub. Tanpa isi manual!

## ✨ Cara Kerja Baru (Auto-Load)
Semua file `.js` di folder **`scripts/`** repo [AistimScript](https://github.com/devtim-lab/AistimScript/tree/main/scripts) **otomatis diambil & dijalankan** — tidak perlu paste URL manual lagi.

**Menambah script baru cukup:**
1. Upload file `.js` (dengan metadata `@match`) ke folder `scripts/` di GitHub
2. Buka popup ekstensi → klik 🔄 (atau tunggu restart browser)
3. Selesai — script langsung aktif

Script auto tampil dengan badge **AUTO** di popup, bisa di-toggle ON/OFF (tidak bisa dihapus — hapus file-nya di GitHub).

## Fitur
- **Auto-Discovery** — baca semua `.js` di folder `scripts/` GitHub otomatis (cache 5 menit)
- **Anti-Duplikat** — script dengan `@name` sama hanya jalan sekali (manual prioritas)
- **userScripts Engine** — dynamic script jalan via `chrome.userScripts` API, **kebal CSP halaman** (termasuk Erzap)
- **Erzap Hardcoded** — tombol "Rekap Pesanan" langsung jalan tanpa eval (CSP-safe)
- **Load Shim** — listener `window.load` tetap jalan walau script telat diinject
- **Handshake Check** — badge "Dynamic OK" hanya muncul kalau script benar-benar berjalan
- **Cek Update** — tombol 🔄 di popup + auto cek saat popup dibuka

## Syarat
- **Chromium 120+** (Chrome / Kiwi / Edge / Brave / dll)
- **Chrome < 138**: Developer mode ON di `chrome://extensions/` (sudah pasti ON kalau load unpacked)
- **Chrome 138+**: aktifkan toggle **"Allow User Scripts"** di halaman detail ekstensi
- Browser lama (<120) tetap bisa jalan dengan engine fallback, tapi situs CSP strict (Erzap) hanya bisa pakai script hardcoded

## Cara Install
1. Download ZIP dan ekstrak
2. Buka Chrome -> `chrome://extensions/`
3. Aktifkan **Mode developer**
4. Klik **Muat yang belum dibongkar** (Load unpacked)
5. Pilih folder `Aistim-dev`
6. Buka popup — pastikan tertulis **"Engine: userScripts API ✅ (CSP-safe)"**

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
- **Engine userScripts** — tidak terpengaruh CSP halaman (script jalan di dunia terpisah yang aman)
- **Erzap hardcoded** — selalu jalan (tidak pakai eval)
- **Engine fallback** — hanya dipakai di browser tanpa userScripts API; bisa diblokir CSP situs strict

## Changelog v2.5.1
- Hapus tombol "Jalankan Semua" & "+ Tambah Script" beserta modalnya — semua serba otomatis
- Hapus permission `scripting` & `clipboardRead` (tidak terpakai lagi)
- Bersih-bersih CSS & kode tidak terpakai

## Changelog v2.5.0
- **Auto-load folder**: semua `.js` di folder `scripts/` repo AistimScript otomatis diambil — tanpa isi URL manual
- Badge **AUTO** di popup + toggle ON/OFF per script auto
- Tombol 🔄 di popup untuk paksa tarik ulang daftar script
- Anti-duplikat berdasarkan `@name` (manual prioritas)
- Cache daftar file 5 menit (hemat rate limit GitHub API)

## Changelog v2.4.0
- Engine baru: `chrome.userScripts` API — dynamic script **kebal CSP** (fix: script "Auto Koreksi" tidak muncul di Erzap)
- Load shim — fix timing: listener `window.load` tetap jalan walau script telat diinject
- Handshake execution check — badge hijau hanya kalau script benar-benar jalan; badge merah jujur kalau diblokir CSP
- Indikator engine di popup (userScripts ✅ / fallback ⚠️)
- Re-sync otomatis saat toggle/tambah/hapus script di popup

## Changelog v2.3.6
- Tombol **🔄 Cek Update** di popup — bandingkan versi dengan GitHub, notif + link download ZIP kalau ada versi baru
- Auto cek update diam-diam saat popup dibuka
- Label versi di popup

## Changelog v2.3.5
- Fix path service worker di manifest (`background/background.js`)
- Fix syntax error di background service worker (`chrome.runtime`)
- Dynamic script runner aktif di content script (fetch -> parse @match -> inject)
- Interval outlet dibatasi (tidak looping selamanya)
- Debug badge hanya tampil saat ada aksi relevan (tidak muncul di semua website)

## Debug
Buka DevTools (F12) -> Console:
- `[Aistim] ===== Content script v2.4.0 loaded =====` — content script aktif
- `[Aistim] Engine: userScripts API (CSP-safe)` — engine utama aktif
- `[Aistim] ✅ userScript registered: Nama` — script terdaftar (background)
- `[Aistim] ✅ Tombol Rekap Pesanan berhasil dibuat!` — tombol berhasil dibuat
- `[Aistim] ❌ Nama diblokir CSP` — fallback diblokir CSP (aktifkan userScripts)
