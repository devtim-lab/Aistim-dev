// ==UserScript==
// @name         Aistim - Bersihkan tombol lama
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Menghapus tombol hijau "Rekap Pesanan" lama bawaan ekstensi (<= v2.9.8) di halaman Erzap mana pun. Tombol itu tidak berfungsi. Aman dibiarkan terpasang; tidak menyentuh tombol milik script lain.
// @match        https://*.erzap.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    // Tombol lama dibuat content.js dalam ~20 detik pertama halaman terbuka, jadi cukup mengawasi 60 detik.
    function bersihkan() {
        document.querySelectorAll('#btn-rekap-pesanan').forEach(function (b) {
            var teks = (b.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
            // Milik script lain diberi atribut data-aistim; tombol lama persis berteks "Rekap Pesanan"
            if (!b.hasAttribute('data-aistim') && teks === 'rekap pesanan') b.remove();
        });
    }
    bersihkan();
    var obs = new MutationObserver(bersihkan);
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () { obs.disconnect(); }, 60000);
})();
