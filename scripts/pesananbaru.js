// ==UserScript==
// @name         Erzap - Rekap Pesanan Baru per Outlet (Tema Merah)
// @namespace    http://tampermonkey.net/
// @version      1.5.0
// @description  [v1.5.0] Tombol 'Rekap Pesanan Baru' DIHAPUS (script kini hanya: pencarian otomatis saat outlet berubah + bersihkan tombol/badge lama). [v1.4.0] Rekap Pesanan Baru kini membaca semua halaman daftar pesanan dan menghitung pesanan yang tombol Edit-nya aktif (Edit nonaktif = bukan pesanan baru), per outlet + daftar invoice. [v1.3.1] Sembunyikan badge debug 'Aistim: ...' di pojok kanan bawah (dari content.js ekstensi). [v1.3.0] Sekaligus menghapus tombol hijau 'Rekap Pesanan' lama bawaan ekstensi di halaman Erzap mana pun (menggantikan script bersihkan_tombol_lama.js). [v1.2.6] Fix: cegah error tak jelas kalau elemen outlet bukan <select> lagi (perubahan tampilan filter outlet ERZAP)
// @author       You
// @match        https://*.erzap.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Tombol hijau "Rekap Pesanan" lama (bawaan content.js ekstensi <= v2.9.8) memakai ID yang sama dengan
    // tombol di script ini dan tidak berfungsi. Buang yang lama saja; tombol milik script lain (ber-data-aistim) aman.
    function hapusTombolLama() {
        document.querySelectorAll('#btn-rekap-pesanan').forEach(b => {
            const teks = (b.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
            // tombol lama: tanpa penanda data-aistim dan persis berteks "Rekap Pesanan"
            if (!b.hasAttribute('data-aistim') && teks === 'rekap pesanan') b.remove();
        });
    }

    // Badge debug "Aistim: ..." di pojok kanan bawah (dibuat content.js ekstensi <= v2.9.8): sembunyikan lewat CSS
    // supaya tetap tersembunyi walau dibuat ulang belakangan.
    if (!document.getElementById('aistim_sembunyi_badge')) {
        const sb = document.createElement('style');
        sb.id = 'aistim_sembunyi_badge';
        sb.textContent = '#aistim-debug { display: none !important; }';
        (document.head || document.documentElement).appendChild(sb);
    }

    // @match mencakup semua halaman Erzap karena tombol lama bisa muncul di halaman mana pun.
    // Di luar daftar pesanan, tugas script ini hanya membersihkan tombol lama (60 detik pertama), lalu selesai.
    if (!/^\/pesanan_penjualans/.test(location.pathname)) {
        hapusTombolLama();
        const obs = new MutationObserver(hapusTombolLama);
        obs.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => obs.disconnect(), 60000);
        return;
    }

    // Di halaman daftar pesanan: bersihkan tombol hijau lama (60 detik pertama)
    hapusTombolLama();
    const obsLama = new MutationObserver(hapusTombolLama);
    obsLama.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => obsLama.disconnect(), 60000);

    // 1. Fitur Auto Search saat Outlet Berubah
    setInterval(() => {
        const outletSelect = document.querySelector('#pencarian_idoutlet_own');
        if (outletSelect && !outletSelect.hasAttribute('data-auto-search')) {
            outletSelect.setAttribute('data-auto-search', 'true');
            outletSelect.addEventListener('change', function() {
                const form = outletSelect.closest('form');
                if (form) {
                    form.submit();
                } else {
                    outletSelect.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        }
    }, 1000);
})();
