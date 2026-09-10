# Aistim Tool v2.7.0

**AI Multi Userscript Manager** — script dibundel di folder `scripts/` + auto-sync dari GitHub. Engine `chrome.userScripts` — **CSP-safe** (jalan di Erzap).

---

# 🤖 PANDUAN WAJIB UNTUK AI / DEVELOPER LAIN

> **BACA INI DULU sebelum mengubah apapun di repo ini!**
> Repo ini pernah rusak 2x karena perubahan yang melanggar aturan di bawah.

## ⛔ LARANGAN (jangan pernah lakukan)

1. **JANGAN force push / timpa `main` dengan folder lama.** Selalu `git pull` dulu sebelum push. Kalau kamu (AI) tidak yakin versi lokalmu yang terbaru, clone ulang — jangan pernah `push --force`.
2. **JANGAN ubah `@name` script yang sudah ada.** `@name` adalah kunci dedupe — ganti nama = script lama & baru jalan DOBEL di halaman yang sama. Ubah isi script boleh, `@name` harus tetap.
3. **JANGAN hapus permission `"userScripts"` dari `manifest.json`.** Tanpa permission ini, semua script jatuh ke fallback script-tag yang **diblokir CSP Erzap** = semua script mati. (Ini bug fatal v2.6.x.)
4. **JANGAN tambah file script duplikat** (contoh: `aistim_tool_v18.js` — versi lama dari script yang sama). Satu script = satu file.
5. **JANGAN kembalikan sistem lama** (hardcoded `DEFAULT_SCRIPTS`, `chrome.scripting` MAIN world, inject `<script>` tag). Semua itu diblokir CSP Erzap.

## ✅ Cara Menambah Script Baru (TANPA update ekstensi)

Cukup tambah 1 file `.js` di folder **`scripts/`** — user tinggal klik 🔄 di popup:

```javascript
// ==UserScript==
// @name         Nama Unik Script       <- WAJIB unik, jangan sama dgn script lain
// @namespace    http://tampermonkey.net/
// @version      1.0.0                  <- format x.y.z (BUKAN tanggal)
// @description  Deskripsi singkat
// @match        https://*.erzap.com/path_halaman*   <- WAJIB wildcard *.erzap.com
// @grant        none
// ==/UserScript==
```

Aturan script:
- `@match` **selalu** pakai `https://*.erzap.com/...` (jangan `trial.` atau `demo.` saja) + akhiri dengan `*` kalau ada query string
- `@version` format `x.y.z` — naikkan setiap kali edit script (misal `1.0.0` → `1.0.1`)
- File baru di `scripts/` otomatis terdeteksi dari GitHub — **tidak perlu** edit file lain

## 🔢 Kapan Versi Dinaikkan

| Yang diubah | Yang dinaikkan | Perlu user install ulang? |
|---|---|---|
| Isi file di `scripts/` saja | `@version` script itu | ❌ TIDAK — cukup klik 🔄 di popup |
| `manifest.json`, `background/`, `content/`, `popup/`, `icons/` | `"version"` di manifest | ✅ YA — user download ZIP baru |

Setiap kenaikan `"version"` di manifest → GitHub Actions otomatis buat tag + release `vX.Y.Z` dengan ZIP berversi.

## 🏗️ Arsitektur Singkat

- `background/background.js` — engine utama: load script bundel (`scripts/index.json`) + remote (GitHub API folder `scripts/`), gabung dedupe by `@name` (versi tertinggi menang), daftarkan via `chrome.userScripts` API
- `content/content.js` — fallback untuk browser tanpa userScripts + badge handshake
- `popup/` — UI: daftar script, toggle ON/OFF (storage key `disabledAuto` by nama file), cek update release
- Storage keys: `disabledAuto`, `autoScripts`, `effectiveScripts`, `repoListCache`, `scripts` (legacy manual)
- Toggle OFF script = tambah nama file ke `disabledAuto` — jangan hapus file-nya

## 📋 Checklist Sebelum Push (untuk AI)

- [ ] `git pull` sudah dilakukan / clone fresh
- [ ] `node --check` lolos untuk semua file `.js` yang diubah
- [ ] `@name` script lama tidak berubah
- [ ] Permission `userScripts` masih ada di manifest
- [ ] Versi dinaikkan sesuai tabel di atas
- [ ] TIDAK force push

---

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
