# Chrome Web Store

Update otomatis = lewat Web Store (Chrome memperbarui sendiri begitu versi baru disetujui).

1. Naikkan `version` di `manifest.json`, push ke `main`.
2. Workflow Release membuat `Aistim-dev-store-<versi>.zip` (manifest tanpa `key`/`update_url`, izin hanya Erzap, partdistro, GitHub).
3. Unggah zip itu di Dashboard -> Paket -> "Upload paket baru" -> kirim untuk review.
4. Perubahan **script** (folder `scripts/`) tidak perlu review: tersinkron otomatis dari GitHub `main`.

Bangun manual: `python3 tools/build-store.py <folder_output>`.

Jangan aktifkan "Upload CRX terverifikasi" (memaksa semua upload berikutnya bertanda tangan kunci pribadi).
