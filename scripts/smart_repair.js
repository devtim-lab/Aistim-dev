// ==UserScript==
// @name         Smart Repair - Default Rawat Inap
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Halaman Servis Elektronik baru: "Rawat Inap" otomatis tercentang sebagai default, "Quick Servis" dinonaktifkan (tidak bisa diklik)
// @match        https://*.erzap.com/servis_elektroniks/new*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Radio "Jenis Servis" (Quick Servis / Rawat Inap / Klaim Garansi Servis):
    // bawaan Erzap yang tercentang default = Quick Servis (value "false").
    // - Rawat Inap (value "true"): dicentang sekali di awal kalau belum aktif.
    //   Sesudah itu user tetap bebas ganti ke "Klaim Garansi Servis" manual --
    //   yang TIDAK boleh dipilih cuma Quick Servis (lihat di bawah).
    // - Quick Servis (value "false"): dinonaktifkan (disabled) + dibikin pudar,
    //   jadi tidak bisa diklik sama sekali (baik radio-nya maupun label-nya).
    function jalankan() {
        if (document.getElementById('smartRepairSudahJalan')) return;

        const radioRawatInap = document.getElementById('servis_elektronik_is_rawat_inap_true');
        const radioQuick = document.getElementById('servis_elektronik_is_rawat_inap_false');
        if (!radioRawatInap || !radioQuick) return false;

        const tanda = document.createElement('meta');
        tanda.id = 'smartRepairSudahJalan';
        document.head.appendChild(tanda);

        if (!radioRawatInap.checked) {
            radioRawatInap.checked = true;
            // Dispatch native change/click (bubbles:true) -- ini juga kepick
            // sama handler yang di-bind lewat jQuery (jQuery >=1.7 dengarnya
            // lewat event native, bukan sistemnya sendiri), jadi field lain
            // yang nampil/hilang tergantung Jenis Servis ikut ke-update.
            radioRawatInap.dispatchEvent(new Event('click', { bubbles: true }));
            radioRawatInap.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // disabled=true bikin klik radio DAN klik label-nya (lewat atribut for=)
        // sama-sama tidak mempan -- browser sendiri yang jaga, bukan cuma CSS.
        radioQuick.disabled = true;
        radioQuick.checked = false;
        const wrapQuick = radioQuick.closest('div') || radioQuick.parentElement;
        if (wrapQuick) {
            wrapQuick.style.opacity = '0.4';
            wrapQuick.style.cursor = 'not-allowed';
        }
        const labelQuick = document.querySelector('label[for="servis_elektronik_is_rawat_inap_false"]');
        if (labelQuick) labelQuick.style.cursor = 'not-allowed';

        return true;
    }

    if (!jalankan()) {
        // Form belum ke-render saat script diinject -- coba lagi habis DOM siap,
        // dan sekali lagi habis window 'load' buat jaga-jaga widget lambat render.
        document.addEventListener('DOMContentLoaded', jalankan);
        window.addEventListener('load', () => setTimeout(jalankan, 300));
    }
})();
