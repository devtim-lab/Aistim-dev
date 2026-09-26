// ==UserScript==
// @name         Erzap - Lihat Data Barang (Pemindahan Barang)
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Tambah tombol "Lihat Data Barang" di atas tabel Daftar Barang - tampilkan Barcode, Jumlah Transfer, Keterangan dari halaman ini atau dari link/ID Pemindahan Barang lain, lalu bisa langsung dimasukkan (copy field) ke tabel di halaman ini. Dari/Ke Outlet & Gudang diisi dari pengaturan yang disimpan user (pertama kali pilih manual di form lalu Simpan).
// @author       You
// @match        https://*.erzap.com/pemindahan_barangs/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// @world        main
// ==/UserScript==

(function () {
    'use strict';

    // ---------- Debug: log semua request XHR/fetch ke console (buat lacak endpoint pencarian) ----------
    // Cukup buka console, ketik kode pencarian di halaman, lihat baris [XHR]/[FETCH] yang muncul.
    (function pasang_network_logger() {
        var asli_xhr_open = XMLHttpRequest.prototype.open;
        var asli_xhr_send = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url) {
            this._debug_method = method;
            this._debug_url = url;
            return asli_xhr_open.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function (body) {
            var xhr = this;
            xhr.addEventListener('load', function () {
                console.log('[XHR]', xhr._debug_method, xhr._debug_url, '| body:', body, '| response:', String(xhr.responseText).slice(0, 2000));
            });
            return asli_xhr_send.apply(this, arguments);
        };

        var asli_fetch = window.fetch;
        if (asli_fetch) {
            window.fetch = function (input, init) {
                return asli_fetch.apply(this, arguments).then(function (res) {
                    res.clone().text().then(function (txt) {
                        console.log('[FETCH]', (init && init.method) || 'GET', input, '| body:', init && init.body, '| response:', txt.slice(0, 2000));
                    });
                    return res;
                });
            };
        }
    })();

    var STYLE = [
        '#bt_lihat_barang{cursor:pointer;}',
        '#overlay_modal_umum{display:none;position:fixed;top:0;left:0;width:100%;height:100%;',
        'background:rgba(0,0,0,0.5);z-index:99998;}',
        '.mib_modal{display:none;position:fixed;top:50%;left:50%;',
        'transform:translate(-50%,-50%);background:#fff;border-radius:6px;',
        'box-shadow:0 4px 24px rgba(220,38,38,0.55);max-width:95vw;max-height:90vh;',
        'flex-direction:column;overflow:hidden;',
        'z-index:99999;font-family:Arial, sans-serif;}',
        '#modal_lihat_barang{width:560px;max-width:min(560px, 95vw);}',
        '.mib_modal .mib_header{flex:0 0 auto;padding:12px 16px;border-bottom:1px solid #eee;',
        'box-shadow:0 2px 8px rgba(220,38,38,0.5);',
        'font-weight:bold;font-size:15px;display:flex;justify-content:space-between;',
        'align-items:center;}',
        '.mib_modal .mib_close{cursor:pointer;color:#999;font-size:18px;line-height:1;}',
        '.mib_modal .mib_close:hover{color:#333;}',
        '.mib_modal .mib_body{flex:1 1 auto;min-height:0;overflow-y:auto;',
        '-webkit-overflow-scrolling:touch;padding:16px;}',
        '.mib_modal .mib_body p{margin:0 0 8px;font-size:12px;color:#666;}',
        '.mib_modal textarea, .mib_modal input[type="text"]{width:100%;box-sizing:border-box;',
        'font-family:Consolas, monospace;font-size:13px;padding:8px;',
        'border:1px solid #ccc;border-radius:4px;}',
        '.mib_modal textarea{height:180px;resize:vertical;}',
        '.mib_modal .mib_progress{margin-top:8px;font-size:12px;color:#0d6efd;display:none;}',
        '#llb_status{margin-top:8px;font-size:12px;color:#0d6efd;min-height:14px;}',
        '#llb_header{margin-top:8px;font-size:12px;color:#333;background:#f8f9fa;',
        'border:1px solid #eee;border-radius:4px;padding:8px;overflow-x:auto;}',
        '#llb_header div{margin-bottom:2px;white-space:nowrap;}',
        '#llb_btn_simpan_header{margin-top:6px;padding:4px 10px;font-size:12px;',
        'border-radius:4px;border:1px solid #ccc;background:#f5f5f5;cursor:pointer;}',
        '#llb_btn_simpan_header:disabled{opacity:0.6;cursor:not-allowed;}',
        '#llb_hasil{margin-top:12px;max-height:320px;overflow:auto;',
        '-webkit-overflow-scrolling:touch;}',
        '.llb_table{width:100%;min-width:420px;border-collapse:collapse;font-size:13px;}',
        '.llb_table th, .llb_table td{border:1px solid #ddd;padding:6px 8px;text-align:left;',
        'white-space:nowrap;}',
        '.llb_table th{background:#f5f5f5;}',
        '.mib_modal .mib_footer{flex:0 0 auto;padding:12px 16px;border-top:1px solid #eee;',
        'text-align:right;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;}',
        '.mib_modal .mib_footer button{padding:6px 14px;',
        'border-radius:4px;border:1px solid #ccc;background:#f5f5f5;cursor:pointer;',
        'font-size:13px;}',
        '.mib_modal .mib_footer button.mib_primary{background:#dc2626;',
        'border-color:#dc2626;color:#fff;}',
        '.mib_modal .mib_footer button:disabled{opacity:0.6;cursor:not-allowed;}',
        '@media (max-width:480px){',
        '.mib_modal{width:95vw !important;max-width:95vw !important;}',
        '.mib_modal .mib_footer{justify-content:stretch;}',
        '.mib_modal .mib_footer button{flex:1 1 auto;margin-left:0;}',
        '}',
        // Scrollbar tipis, transparan, baru muncul warna merahnya saat area-nya di-hover.
        '.mib_modal .mib_body, #llb_hasil, #llb_header{',
        'scrollbar-width:thin;scrollbar-color:transparent transparent;}',
        '.mib_modal .mib_body:hover, #llb_hasil:hover, #llb_header:hover{',
        'scrollbar-color:#dc2626 transparent;}',
        '.mib_modal .mib_body::-webkit-scrollbar, #llb_hasil::-webkit-scrollbar,',
        '#llb_header::-webkit-scrollbar{width:6px;height:6px;}',
        '.mib_modal .mib_body::-webkit-scrollbar-track, #llb_hasil::-webkit-scrollbar-track,',
        '#llb_header::-webkit-scrollbar-track{background:transparent;}',
        '.mib_modal .mib_body::-webkit-scrollbar-thumb, #llb_hasil::-webkit-scrollbar-thumb,',
        '#llb_header::-webkit-scrollbar-thumb{background:transparent;border-radius:3px;}',
        '.mib_modal .mib_body:hover::-webkit-scrollbar-thumb,',
        '#llb_hasil:hover::-webkit-scrollbar-thumb,',
        '#llb_header:hover::-webkit-scrollbar-thumb{background:#dc2626;}'
    ].join('');

    var MODAL_HTML =
        '<div id="overlay_modal_umum"></div>' +
        '<div id="modal_lihat_barang" class="mib_modal">' +
            '<div class="mib_header">' +
                '<span>Lihat Data Barang</span>' +
                '<span class="mib_close" id="llb_btn_close_x">&times;</span>' +
            '</div>' +
            '<div class="mib_body">' +
                '<p>Kosongkan untuk memakai halaman ini, atau masukkan link/ID Pemindahan Barang lain ' +
                '(mis. <code>394571</code> atau URL lengkapnya), lalu klik Tampilkan.</p>' +
                '<input type="text" id="llb_input_link" placeholder="mis. 394571 atau https://trial.erzap.com/pemindahan_barangs/394571">' +
                '<div id="llb_status"></div>' +
                '<div id="llb_header"></div>' +
                '<button type="button" id="llb_btn_simpan_header">Simpan</button>' +
                '<div id="llb_hasil"></div>' +
                '<div class="mib_progress" id="llb_progress"></div>' +
            '</div>' +
            '<div class="mib_footer">' +
                '<button id="llb_btn_tutup">Tutup</button>' +
                '<button id="llb_btn_masukkan_v2">Masukkan ke Tabel</button>' +
                '<button id="llb_btn_tampilkan" class="mib_primary">Tampilkan</button>' +
            '</div>' +
        '</div>';

    var HTML_IDOUTLET_OWN = 'pemindahan_barang_idoutlet_own '; // sesuai id yang dipakai fetch_produk_quick di halaman ini
    var HTML_IDGUDANG = 'pemindahan_barang_idgudang_asal';

    // Beberapa hal yang dipicu tombol Masukkan (ganti Outlet/Gudang, tambah_baris, dst)
    // ada yang bikin halaman auto-scroll sendiri (bukan dari kode kita, tidak kelihatan
    // dari mana). Daripada dilacak satu-satu, posisi scroll di-"kunci" saja selama proses
    // berjalan - kalau halaman bergeser, langsung dikembalikan ke posisi semula.
    var _scroll_lock_interval = null;
    function kunci_posisi_scroll() {
        var x = window.scrollX, y = window.scrollY;
        lepas_kunci_scroll();
        _scroll_lock_interval = setInterval(function () {
            if (window.scrollX !== x || window.scrollY !== y) {
                window.scrollTo(x, y);
            }
        }, 50);
    }
    function lepas_kunci_scroll() {
        if (_scroll_lock_interval) {
            clearInterval(_scroll_lock_interval);
            _scroll_lock_interval = null;
        }
    }

    function buka_modal(selector) {
        $('#overlay_modal_umum').show();
        // .show() jQuery defaultnya balik ke display:block, padahal modal ini
        // butuh display:flex (header/body/footer jadi flex-column supaya body-nya
        // yang scroll, bukan seluruh modal meluber ke luar layar).
        $(selector).css('display', 'flex');
    }

    function tutup_semua_modal() {
        $('#overlay_modal_umum').hide();
        $('.mib_modal').css('display', 'none');
    }

    function escape_html(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Simulasi tombol Enter yang sungguhan (bukan cuma panggil fetch_produk_quick
    // langsung) - soalnya di halaman ini ada logika lain (mengisi Stok Asal/Tujuan)
    // yang baru jalan kalau event Enter beneran terjadi, bukan cuma hasil akhirnya.
    // keyCode/which di-override manual karena constructor KeyboardEvent modern
    // tidak menerima nilai itu langsung (dianggap legacy/read-only oleh browser).
    function buat_event_enter(tipe) {
        var ev;
        try {
            ev = new KeyboardEvent(tipe, { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
        } catch (e) {
            ev = document.createEvent('KeyboardEvent');
            ev.initKeyboardEvent(tipe, true, true, window, 'Enter', 0, false, false, false, false);
        }
        try {
            Object.defineProperty(ev, 'keyCode', { get: function () { return 13; } });
            Object.defineProperty(ev, 'which', { get: function () { return 13; } });
        } catch (e) {}
        return ev;
    }

    function simulasikan_enter_pada_input(selector) {
        var el = $(selector)[0];
        if (!el) {
            return;
        }
        el.dispatchEvent(buat_event_enter('keydown'));
        el.dispatchEvent(buat_event_enter('keyup'));
    }

    // Dipakai oleh "Masukkan ke Tabel" versi V1 (kode disimpan, tidak dipakai di UI
    // lagi) - dulunya juga dipakai tombol "Impor Barang" (paste textarea) yang sudah
    // dihapus atas permintaan. Cuma butuh daftar string "qty barcode" yang diumpankan
    // satu-satu lewat simulasi Enter di kolom scan.
    function jalankan_baris_qty_barcode(baris, progress_selector, on_selesai) {
        $(progress_selector).show();
        var idx = 0;

        function tunggu_ajax_selesai(cb) {
            var cek = setInterval(function () {
                if (!$('#loading_body').is(':visible')) {
                    clearInterval(cek);
                    cb();
                }
            }, 150);
        }

        function proses_baris_berikutnya() {
            if (idx >= baris.length) {
                $(progress_selector).text('Selesai: ' + baris.length + ' baris diproses.');
                if (on_selesai) {
                    setTimeout(on_selesai, 800);
                }
                return;
            }
            $(progress_selector).text('Memproses baris ' + (idx + 1) + ' dari ' + baris.length + ' ...');
            $('#term_produk_quick').val(baris[idx]);
            idx++;
            simulasikan_enter_pada_input('#term_produk_quick');
            tunggu_ajax_selesai(proses_baris_berikutnya);
        }

        proses_baris_berikutnya();
    }

    // ---------- Lihat Data Barang (Barcode, Jumlah Transfer, Keterangan dari halaman ini atau link lain) ----------

    function ambil_data_baris(tr) {
        var $tr = $(tr);
        var barcode = $.trim($tr.find('.searching_produk_barcode').val() || $tr.find('.data_produk_barcode').val() || '');
        if (barcode === '') {
            return null; // baris kosong/template, dilewati
        }
        var jumlah = $tr.find('.jumlah_produk').val() || '';
        var $td_keterangan = $tr.find('td').last();
        var $input_keterangan = $td_keterangan.find('input, textarea');
        var keterangan = $input_keterangan.length > 0 ? $input_keterangan.val() : $.trim($td_keterangan.text());
        return { barcode: barcode, jumlah: jumlah, keterangan: keterangan };
    }

    // Field header (Dari Outlet/Gudang, Ke Outlet/Gudang) belum pernah kelihatan HTML aslinya
    // di sini, jadi dicari berdasarkan teks <label> yang tampil di layar - lebih tahan
    // dibanding menebak id, walau tidak 100% pasti kalau markup-nya di luar pola umum.
    var LABEL_HEADER = ['Dari Outlet', 'Dari Gudang', 'Ke Outlet', 'Ke Gudang'];

    function cari_field_by_label($root, label_text) {
        var $label = $root.find('label').filter(function () {
            return $.trim($(this).text()).replace(/\*/g, '') === label_text;
        }).first();
        if ($label.length === 0) {
            return $();
        }
        var $container = $label.closest('.field');
        if ($container.length === 0) {
            $container = $label.parent();
        }
        var $field = $container.find('select, input[type="text"], input[type="hidden"]').first();
        if ($field.length === 0) {
            $field = $label.nextAll('select, input').first();
        }
        return $field;
    }

    // Catatan: tidak dipanggil dari mana pun (Dari/Ke Outlet & Gudang sekarang dari
    // pengaturan tersimpan user) - disimpan kalau-kalau nanti mau balik ke perilaku
    // "ambil header asli dari halaman/link yang di-fetch".
    function ambil_header_dari_wrap($wrap) {
        var header = {};
        LABEL_HEADER.forEach(function (label) {
            var $field = cari_field_by_label($wrap, label);
            var teks = '';
            if ($field.length > 0) {
                if ($field.is('select')) {
                    // Opsi placeholder ("Please select" dsb) biasanya value="" - kalau
                    // masih di situ berarti belum benar-benar dipilih, jangan dianggap
                    // sebagai nilai asli (nanti malah bisa menimpa pilihan yang sudah
                    // benar di form tujuan dengan "Please select").
                    if ($field.val()) {
                        teks = $.trim($field.find('option:selected').text());
                    }
                } else {
                    teks = $.trim($field.val() || '');
                }
            }
            header[label] = teks;
        });
        return header;
    }

    // ---------- Pengaturan Dari/Ke Outlet & Gudang (disimpan user, bukan hardcode) ----------
    // Pertama kali: pilih Dari Outlet, Dari Gudang, Ke Outlet & Ke Gudang MANUAL di form
    // halaman ini, lalu klik "Simpan dari Form" di modal. Nilai itu dipakai setiap kali
    // "Masukkan ke Tabel". Mau ganti: pilih lagi di form, klik tombol yang sama.
    // Disimpan di localStorage (per subdomain Erzap, per browser).
    //
    // Kunci baru: versi 1.0.0 mengisi kunci lama OTOMATIS dengan outlet Ngawi hardcode
    // (bukan pilihan user), jadi nilai lama itu dibuang dan semua mulai dari setting manual.
    var KUNCI_LOCALSTORAGE_HEADER = 'erzap_pemindahan_barang_header_v2';
    var KUNCI_LOCALSTORAGE_HEADER_LAMA = 'erzap_pemindahan_barang_header_tersimpan';

    function buang_header_lama() {
        try { localStorage.removeItem(KUNCI_LOCALSTORAGE_HEADER_LAMA); } catch (e) {}
    }

    // null kalau belum pernah disimpan / isinya tidak lengkap
    function baca_header_tersimpan() {
        try {
            var h = JSON.parse(localStorage.getItem(KUNCI_LOCALSTORAGE_HEADER) || 'null');
            var lengkap = h && LABEL_HEADER.every(function (l) {
                return typeof h[l] === 'string' && h[l] !== '';
            });
            if (lengkap) {
                return h;
            }
        } catch (e) {}
        return null;
    }

    // Pilihan yang sedang terpasang di form halaman ini (teks opsi yang dipilih).
    // Opsi placeholder ("Please select" dsb, value="") dianggap belum dipilih.
    function baca_header_dari_form() {
        var header = {};
        LABEL_HEADER.forEach(function (label) {
            var $field = $('#' + ID_FIELD_HEADER[label]);
            var teks = '';
            if ($field.length > 0) {
                if ($field.is('select')) {
                    if ($field.val()) {
                        teks = $.trim($field.find('option:selected').text());
                    }
                } else {
                    teks = $.trim($field.val() || '');
                }
            }
            header[label] = teks;
        });
        return header;
    }

    function render_header_lihat_barang() {
        var header = baca_header_tersimpan();
        var html;
        if (!header) {
            html = '<div style="white-space:normal;color:#dc2626;">' +
                '<strong>Dari/Ke Outlet &amp; Gudang belum disimpan.</strong><br>' +
                'Tutup modal ini, pilih Dari Outlet, Dari Gudang, Ke Outlet &amp; Ke Gudang di form, ' +
                'lalu buka lagi dan klik <em>Simpan dari Form</em>.</div>';
        } else {
            html = '<div style="color:#666;">Dipakai saat Masukkan ke Tabel:</div>';
            LABEL_HEADER.forEach(function (label) {
                html += '<div><strong>' + escape_html(label) + ':</strong> ' + escape_html(header[label]) + '</div>';
            });
        }
        $('#llb_header').html(html);
        perbarui_tombol_simpan_header();
    }

    function perbarui_tombol_simpan_header() {
        var ada = !!baca_header_tersimpan();
        $('#llb_btn_simpan_header').prop('disabled', false)
            .text(ada ? 'Ganti dengan Pilihan di Form' : 'Simpan dari Form');
    }

    function simpan_header_ke_localstorage() {
        var header = baca_header_dari_form();
        var kosong = LABEL_HEADER.filter(function (l) { return !header[l]; });
        if (kosong.length > 0) {
            alert('Belum dipilih di form halaman ini:\n- ' + kosong.join('\n- ') +
                '\n\nTutup modal, pilih dulu di form, lalu buka lagi Lihat Data Barang dan klik Simpan.');
            return;
        }
        var lama = baca_header_tersimpan();
        if (lama) {
            var sama = LABEL_HEADER.every(function (l) { return lama[l] === header[l]; });
            if (sama) {
                alert('Pilihan di form sama dengan yang sudah tersimpan.');
                return;
            }
            var daftar = LABEL_HEADER.map(function (l) { return l + ': ' + header[l]; }).join('\n');
            if (!confirm('Ganti pengaturan tersimpan dengan pilihan di form sekarang?\n\n' + daftar)) {
                return;
            }
        }
        try {
            localStorage.setItem(KUNCI_LOCALSTORAGE_HEADER, JSON.stringify(header));
        } catch (e) {
            alert('Gagal menyimpan ke localStorage: ' + e.message);
            return;
        }
        render_header_lihat_barang();
    }

    // Dipanggil sebelum "Masukkan ke Tabel". Tanpa pengaturan tersimpan proses ditolak:
    // lebih aman daripada menebak outlet/gudang.
    function header_untuk_masukkan() {
        var header = baca_header_tersimpan();
        if (!header) {
            alert('Dari/Ke Outlet & Gudang belum disimpan.\n\nPilih dulu di form halaman ini, ' +
                'lalu buka Lihat Data Barang dan klik "Simpan dari Form".');
        }
        return header;
    }

    // Terapkan header hasil fetch ke form yang sedang dibuka. Outlet diisi lebih dulu,
    // baru Gudang diisi ~500ms kemudian - untuk berjaga-jaga kalau opsi Gudang baru
    // muncul via ajax setelah Outlet dipilih (pola dropdown bertingkat yang umum di form ini).
    // Beberapa dropdown custom (Chosen/Select2/Bootstrap-select/dll) menggambar ulang
    // tampilannya sendiri dan tidak cukup diberi tahu lewat .trigger('change') biasa -
    // masing-masing library punya event/API refresh sendiri. Karena tidak kelihatan
    // library apa yang dipakai halaman ini (kalau ada), semua dicoba sekaligus di sini;
    // aman kalau ternyata tidak ada satupun yang terpasang (trigger custom event yang
    // tidak ada listener-nya cuma no-op).
    function segarkan_tampilan_dropdown($field) {
        try { $field.trigger('chosen:updated'); } catch (e) {}
        try { $field.trigger('liszt:updated'); } catch (e) {}
        try { $field.trigger('change.select2'); } catch (e) {}
        try {
            if ($.fn.select2 && $field.data('select2')) {
                $field.trigger({ type: 'select2:select' });
            }
        } catch (e) {}
        try {
            if ($.fn.selectpicker) {
                $field.selectpicker('refresh');
            }
        } catch (e) {}
        try {
            $field[0].dispatchEvent(new Event('change', { bubbles: true }));
        } catch (e) {}
    }

    // ID asli field header di form ini (dari HTML yang dikirim user) - dipakai
    // langsung, bukan lagi tebak-tebakan lewat teks label.
    var ID_FIELD_HEADER = {
        'Dari Outlet': 'pemindahan_barang_idoutlet_own',
        'Dari Gudang': 'pemindahan_barang_idgudang_asal',
        'Ke Outlet': 'pemindahan_barang_idoutlet_tujuan',
        'Ke Gudang': 'pemindahan_barang_idgudang_tujuan'
    };

    // Beda dengan versi lama: sekarang MENUNGGU (polling, bukan delay tetap) sampai
    // opsinya benar-benar muncul di <select>, karena "Ke Outlet"/Gudang bisa saja baru
    // ke-refresh lewat ajax SETELAH field sebelumnya diubah (mis. exclude outlet yang
    // sama dipilih di "Dari Outlet"). Kalau sampai batas waktu opsinya tetap tidak ada,
    // dianggap GAGAL (bukan cuma warning diam-diam) - dilaporkan balik lewat cb(false)
    // supaya proses menyalin barang tidak lanjut dengan Outlet/Gudang yang salah/kosong.
    function terapkan_satu_field_header_async(label, nilai_teks, cb, maks_tunggu_ms) {
        if (!nilai_teks) {
            console.warn('[lihat-barang]', label, '-> tidak ada nilai dari hasil fetch, dilewati.');
            cb(true);
            return;
        }
        var id_asli = ID_FIELD_HEADER[label];
        var mulai = Date.now();
        maks_tunggu_ms = maks_tunggu_ms || 5000;

        (function cek() {
            var $field = $('#' + id_asli);
            if ($field.length === 0) {
                if (Date.now() - mulai > maks_tunggu_ms) {
                    console.warn('[lihat-barang]', label, '-> field #' + id_asli + ' tidak pernah muncul di halaman ini.');
                    cb(false);
                    return;
                }
                setTimeout(cek, 150);
                return;
            }
            if (!$field.is('select')) {
                $field.val(nilai_teks).trigger('change');
                console.log('[lihat-barang]', label, '-> berhasil di-set (input teks) ke:', nilai_teks);
                cb(true);
                return;
            }
            var $opsi = $field.find('option').filter(function () {
                return $.trim($(this).text()) === nilai_teks;
            }).first();
            if ($opsi.length > 0) {
                var nilai_target = $opsi.val();
                $field.val(nilai_target).trigger('change');
                segarkan_tampilan_dropdown($field);
                // Verifikasi setelah jeda - beberapa field di halaman ini kelihatannya
                // diganti/direset lewat ajax tak lama setelah field LAIN berubah, yang
                // bisa menimpa balik nilai yang barusan di-set di sini. Kalau ternyata
                // balik kosong/berubah, ulangi dari awal (cari elemen #id_asli lagi,
                // karena elemennya sendiri bisa jadi sudah diganti).
                setTimeout(function () {
                    var $field_lagi = $('#' + id_asli);
                    if ($field_lagi.length > 0 && $field_lagi.val() == nilai_target) {
                        console.log('[lihat-barang]', label, '-> berhasil di-set ke opsi (terverifikasi):', nilai_teks);
                        cb(true);
                    } else if (Date.now() - mulai > maks_tunggu_ms) {
                        console.warn('[lihat-barang]', label, '-> sempat di-set tapi nilainya balik berubah, dan sudah melewati batas waktu.');
                        cb(false);
                    } else {
                        console.warn('[lihat-barang]', label, '-> sempat di-set tapi nilainya balik berubah (kemungkinan elemennya diganti/direset), mencoba lagi...');
                        cek();
                    }
                }, 400);
                return;
            }
            if (Date.now() - mulai > maks_tunggu_ms) {
                var daftar_opsi = $field.find('option').map(function () { return $.trim($(this).text()); }).get();
                console.warn('[lihat-barang]', label, '-> opsi "' + nilai_teks + '" tidak pernah muncul setelah ditunggu ' + maks_tunggu_ms + 'ms. Opsi yang tersedia saat ini:', daftar_opsi,
                    '(kemungkinan halaman ini melarang "' + label + '" sama dengan outlet/gudang lain yang sudah dipilih)');
                cb(false);
                return;
            }
            setTimeout(cek, 150);
        })();
    }

    function terapkan_header_ke_form(header, on_selesai) {
        var gagal = [];

        function langkah(label, next) {
            terapkan_satu_field_header_async(label, header[label], function (berhasil) {
                if (!berhasil) {
                    gagal.push(label);
                }
                next();
            });
        }

        langkah('Dari Outlet', function () {
            langkah('Ke Outlet', function () {
                langkah('Dari Gudang', function () {
                    langkah('Ke Gudang', function () {
                        if (on_selesai) {
                            on_selesai(gagal);
                        }
                    });
                });
            });
        });
    }

    function normalisasi_link(input) {
        input = $.trim(input);
        if (input === '') {
            return window.location.href;
        }
        if (/^\d+$/.test(input)) {
            return 'https://trial.erzap.com/pemindahan_barangs/' + input;
        }
        return input;
    }

    var data_lihat_barang_terakhir = [];
    var data_tr_barang_terakhir = []; // elemen <tr> asli (detached) dari halaman sumber - dipakai oleh V2

    function render_hasil_lihat_barang(rows) {
        data_lihat_barang_terakhir = rows;
        if (rows.length === 0) {
            $('#llb_hasil').html('<p style="font-size:12px;color:#999;">Tidak ada data barang ditemukan.</p>');
            return;
        }
        var html = '<table class="llb_table"><thead><tr><th>No</th><th>Barcode</th><th>Jumlah Transfer</th><th>Keterangan</th></tr></thead><tbody>';
        rows.forEach(function (r, i) {
            html += '<tr><td>' + (i + 1) + '</td><td>' + escape_html(r.barcode) + '</td><td>' + escape_html(r.jumlah) + '</td><td>' + escape_html(r.keterangan) + '</td></tr>';
        });
        html += '</tbody></table>';
        $('#llb_hasil').html(html);
    }

    function muat_data_dari_link(link) {
        $('#llb_status').text('Memuat data dari ' + link + ' ...');
        $('#llb_hasil').empty();
        $('#llb_btn_tampilkan').prop('disabled', true);

        $.ajax({
            url: link,
            dataType: 'html',
            success: function (html) {
                var $wrap = $('<div>').append($($.parseHTML(html)));
                var rows = [];
                var tr_list = [];
                $wrap.find('#pemindahan_barang_detail tbody tr').each(function () {
                    if (!/^tr_\d+$/.test(this.id || '')) {
                        return;
                    }
                    var data = ambil_data_baris(this);
                    if (data) {
                        rows.push(data);
                        tr_list.push(this);
                    }
                });
                data_tr_barang_terakhir = tr_list;
                // Cuma daftar barang yang diambil dari halaman/link ini. Dari/Ke Outlet &
                // Gudang selalu dari pengaturan tersimpan user (lihat render_header_lihat_barang).
                $('#llb_status').text('Ditemukan ' + rows.length + ' barang.');
                render_hasil_lihat_barang(rows);
                log_nilai_dropdown_halaman('SESUDAH fetch selesai (' + link + ')');
            },
            error: function () {
                $('#llb_status').text('Gagal memuat data dari link tersebut.');
            },
            complete: function () {
                $('#llb_btn_tampilkan').prop('disabled', false);
            }
        });
    }

    // Diagnostik sementara: cetak nilai dropdown Dari/Ke Outlet & Gudang DI HALAMAN
    // INI (bukan hasil fetch), buat mastiin apakah benar-benar berubah cuma karena
    // buka modal / klik Tampilkan (yang harusnya cuma baca, tidak menulis apa pun
    // ke halaman ini).
    function log_nilai_dropdown_halaman(konteks) {
        LABEL_HEADER.forEach(function (label) {
            var $f = cari_field_by_label($(document), label);
            console.log('[cek-dropdown]', konteks, '|', label, '=',
                $f.length > 0 ? $f.val() : '(field tidak ditemukan di halaman ini)');
        });
    }

    function buka_modal_lihat_barang() {
        log_nilai_dropdown_halaman('SEBELUM buka modal');
        $('#llb_input_link').val('');
        $('#llb_status').text('');
        $('#llb_hasil').empty();
        $('#llb_progress').hide().text('');
        render_header_lihat_barang();
        // "Masukkan ke Tabel" hanya masuk akal kalau tabel di halaman ini masih bisa diisi.
        var bisa_impor = $('#term_produk_quick').length > 0 && !$('#term_produk_quick').is(':disabled');
        $('#llb_btn_masukkan_v2').toggle(bisa_impor);
        buka_modal('#modal_lihat_barang');
        muat_data_dari_link(window.location.href);
    }

    function tampilkan_dari_input_link() {
        muat_data_dari_link(normalisasi_link($('#llb_input_link').val()));
    }

    var TOMBOL_MODAL_LIHAT_BARANG = '#llb_btn_masukkan_v2, #llb_btn_tampilkan, #llb_btn_tutup';

    // ---------- V1: scan ulang tiap barcode (lewat fetch_produk_quick / simulasi Enter) ----------
    // Sudah tidak dipakai di UI (tombolnya dilepas atas permintaan), tapi fungsinya
    // sengaja tidak dihapus kalau-kalau dibutuhkan lagi.

    function masukkan_hasil_ke_table() {
        if (data_lihat_barang_terakhir.length === 0) {
            alert('Tidak ada data untuk dimasukkan ke table.');
            return;
        }
        var header = header_untuk_masukkan();
        if (!header) {
            return;
        }

        $(TOMBOL_MODAL_LIHAT_BARANG).prop('disabled', true);
        $('#llb_progress').show().text('Menerapkan Dari/Ke Outlet & Gudang ...');
        kunci_posisi_scroll();

        terapkan_header_ke_form(header, function (gagal) {
            if (gagal.length > 0) {
                alert('Gagal menerapkan field berikut, proses dibatalkan:\n- ' + gagal.join('\n- ') + '\n\nCek Console (F12) untuk detail opsi yang tersedia.');
                $(TOMBOL_MODAL_LIHAT_BARANG).prop('disabled', false);
                lepas_kunci_scroll();
                $('#llb_progress').hide();
                return;
            }
            if (typeof validasi_header_sebelum_scan_produk === 'function') {
                if (!validasi_header_sebelum_scan_produk(HTML_IDOUTLET_OWN, 'Tentukan Outlet terlebih dahulu', true)) {
                    $(TOMBOL_MODAL_LIHAT_BARANG).prop('disabled', false);
                    lepas_kunci_scroll();
                    return;
                }
                if (!validasi_header_sebelum_scan_produk(HTML_IDGUDANG, 'Tentukan Gudang terlebih dahulu', false)) {
                    $(TOMBOL_MODAL_LIHAT_BARANG).prop('disabled', false);
                    lepas_kunci_scroll();
                    return;
                }
            }

            var baris = data_lihat_barang_terakhir.map(function (r) {
                return (r.jumlah || 1) + ' ' + r.barcode;
            });

            jalankan_baris_qty_barcode(baris, '#llb_progress', function () {
                $(TOMBOL_MODAL_LIHAT_BARANG).prop('disabled', false);
                lepas_kunci_scroll();
                tutup_semua_modal();
            });
        });
    }

    // ---------- V2: copy langsung semua field produk ke baris kosong, tanpa scan ulang ----------
    // Field yang sama-sama diisi fetch_produk_quick saat barcode ketemu (lihat search_barcode/
    // change handler bawaan halaman ini) - Stok Asal/Tujuan & harga TIDAK disalin karena itu
    // milik konteks lama (gudang/tanggal beda), sengaja dibiarkan kosong/di-refresh manual.
    var KELAS_FIELD_DISALIN_V2 = [
        'searching_produk_barcode',
        'searching_produk_barcode_on_nama_produk',
        'data_produk_id',
        'data_produk_barcode',
        'produk_nama',
        'produk_kode_ref',
        'produk_is_jasa',
        'produk_is_sn',
        'produk_is_paket',
        'produk_is_harga_jual_include_ppn',
        'produk_is_bahan',
        'produk_is_non_ppn',
        'produk_flat_price_count',
        'produk_is_use_no_batch',
        'searching_barcode_produk_id'
    ];

    function cari_baris_kosong_atau_tambah(cb) {
        var $kosong = $('.searching_produk_barcode').filter(function () {
            return $.trim(this.value) === '';
        }).first();
        if ($kosong.length > 0) {
            cb($kosong.closest('tr')[0]);
            return;
        }
        if (typeof tambah_baris !== 'function') {
            cb(null);
            return;
        }
        tambah_baris();
        var percobaan = 0;
        var cek = setInterval(function () {
            percobaan++;
            var $kosong2 = $('.searching_produk_barcode').filter(function () {
                return $.trim(this.value) === '';
            }).first();
            if ($kosong2.length > 0) {
                clearInterval(cek);
                cb($kosong2.closest('tr')[0]);
            } else if (percobaan > 40) { // ~6 detik, jaga-jaga kalau ajax tambah_baris gagal/lambat
                clearInterval(cek);
                cb(null);
            }
        }, 150);
    }

    function salin_satu_field_v2(tr_sumber, tr_tujuan, selector) {
        var $src = $(tr_sumber).find(selector).first();
        var $dst = $(tr_tujuan).find(selector).first();
        if ($src.length > 0 && $dst.length > 0) {
            $dst.val($src.val());
        }
    }

    function proses_satu_baris_v2(tr_sumber, cb) {
        cari_baris_kosong_atau_tambah(function (tr_tujuan) {
            if (!tr_tujuan) {
                cb(false);
                return;
            }
            KELAS_FIELD_DISALIN_V2.forEach(function (kelas) {
                salin_satu_field_v2(tr_sumber, tr_tujuan, '.' + kelas);
            });
            salin_satu_field_v2(tr_sumber, tr_tujuan, 'input[name$="[harga_jual]"]');

            var $jumlah_sumber = $(tr_sumber).find('.jumlah_produk');
            var nilai_jumlah = $jumlah_sumber.val() || 1;
            $(tr_tujuan).find('.jumlah_produk').val(nilai_jumlah).trigger('change');

            // Sesuai permintaan: Stok Asal disamakan dengan Jumlah Transfer, Stok Tujuan selalu 0.0
            // (bukan stok asli - field ini di V2 sengaja tidak lewat pencarian produk).
            $(tr_tujuan).find('.label_stok_asal').text(nilai_jumlah);
            $(tr_tujuan).find('.val_stok_asal').val(nilai_jumlah);
            $(tr_tujuan).find('.label_stok_tujuan').text('0.0');
            $(tr_tujuan).find('.val_stok_tujuan').val('0.0');

            salin_satu_field_v2(tr_sumber, tr_tujuan, 'input[name$="[keterangan]"], textarea[name$="[keterangan]"]');

            $(tr_tujuan).effect('highlight', {}, 1500);
            cb(true);
        });
    }

    function masukkan_hasil_ke_table_v2() {
        if (data_tr_barang_terakhir.length === 0) {
            alert('Tidak ada data untuk dimasukkan ke table.');
            return;
        }
        var header = header_untuk_masukkan();
        if (!header) {
            return;
        }

        $(TOMBOL_MODAL_LIHAT_BARANG).prop('disabled', true);
        $('#llb_progress').show().text('Menerapkan Dari/Ke Outlet & Gudang ...');
        kunci_posisi_scroll();

        terapkan_header_ke_form(header, function (gagal) {
            if (gagal.length > 0) {
                alert('Gagal menerapkan field berikut, proses dibatalkan:\n- ' + gagal.join('\n- ') + '\n\nCek Console (F12) untuk detail opsi yang tersedia.');
                $(TOMBOL_MODAL_LIHAT_BARANG).prop('disabled', false);
                lepas_kunci_scroll();
                $('#llb_progress').hide();
                return;
            }
            var idx = 0;
            var total = data_tr_barang_terakhir.length;

            function lanjut() {
                if (idx >= total) {
                    $('#llb_progress').text('Selesai: ' + total + ' barang disalin langsung ke tabel.');
                    setTimeout(function () {
                        $(TOMBOL_MODAL_LIHAT_BARANG).prop('disabled', false);
                        lepas_kunci_scroll();
                        tutup_semua_modal();
                    }, 800);
                    return;
                }
                $('#llb_progress').text('Menyalin barang ' + (idx + 1) + ' dari ' + total + ' ...');
                proses_satu_baris_v2(data_tr_barang_terakhir[idx], function () {
                    idx++;
                    lanjut();
                });
            }

            lanjut();
        });
    }

    // ---------- Pemasangan tombol (tahan terhadap re-render ajax pada blok Daftar Barang) ----------

    function siapkan_modal_dan_handler() {
        if ($('#modal_lihat_barang').length > 0) {
            return;
        }
        $('<style>').text(STYLE).appendTo('head');
        $('body').append(MODAL_HTML);

        $(document).on('click', '#overlay_modal_umum', tutup_semua_modal);

        $(document).on('click', '#bt_lihat_barang', buka_modal_lihat_barang);
        $(document).on('click', '#llb_btn_tampilkan', tampilkan_dari_input_link);
        $(document).on('click', '#llb_btn_simpan_header', simpan_header_ke_localstorage);
        $(document).on('click', '#llb_btn_masukkan_v2', masukkan_hasil_ke_table_v2);
        $(document).on('click', '#llb_btn_tutup, #llb_btn_close_x', tutup_semua_modal);

        $(document).on('keydown', '#llb_input_link', function (e) {
            if (e.which === 13) {
                tampilkan_dari_input_link();
                return false;
            }
        });
    }

    function cari_wrapper_tombol() {
        var wrapper = $('#pemindahan_barang_detail .additional_button_wrapper').first();
        if (wrapper.length === 0) {
            wrapper = $('.additional_button_wrapper').first();
        }
        return wrapper;
    }

    function pastikan_tombol_ada() {
        var wrapper = cari_wrapper_tombol();
        if (wrapper.length === 0) {
            return;
        }

        if ($('#bt_lihat_barang').length === 0) {
            wrapper.append(
                '<div class="additional_button" id="wrapper_bt_lihat_barang">' +
                    '<div id="bt_lihat_barang">' +
                        '<span class="fa fa-table" aria-hidden="true" style="color:#198754;font-size:14px"></span> Lihat Data Barang' +
                    '</div>' +
                '</div>'
            );
        }
    }

    $(function () {
        buang_header_lama();
        siapkan_modal_dan_handler();
        pastikan_tombol_ada();

        var observer = new MutationObserver(function () {
            pastikan_tombol_ada();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });
})();
