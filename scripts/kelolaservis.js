// ==UserScript==
// @name         Erzap - Kolom Outlet di Kelola Servis
// @namespace    http://tampermonkey.net/
// @version      1.0.61
// @description  [v1.0.61] Daftar Kelola Servis: kolom Outlet (dengan "Status: ..." di bawahnya, kolom Status asli disembunyikan), Tipe HP (kanan Pelanggan), teknisi di bawah kode servis, nomor HP jadi ikon WhatsApp, filter teknisi (combobox + pencarian) menggantikan kotak Teknisi di panel Pencarian dan memfilter lewat server (isi nama + ID teknisi lalu tombol Filter); kalau nama tidak ada di daftar, beralih ke filter bawaan Erzap. Detail servis: tombol "Tutup Servis" dikunci sampai Status Servis selesai/dibatalkan dan Disetujui Oleh terisi. Servis baru: Rawat Inap default, Quick Servis dimatikan (dulu smart_repair.js)
// @author       You
// @match        https://*.erzap.com/servis_elektroniks/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const CACHE_KEY = 'ks_outlet_cache_v7'; // v7: nilai {outlet, tipe, teknisi, peta}; v6 belum punya peta nama->ID teknisi
    const PARALEL = 4;
    const TANDA = 'ks_outlet_td';
    const TANDA_TIPE = 'ks_tipe_td';
    const HP_LAYAR = window.matchMedia('(max-width: 768px)'); // layar HP/tablet kecil
    const lebarTipe = () => HP_LAYAR.matches ? 170 : 240; // lebar kolom Tipe HP (px): sempit di HP, lega di desktop
    // Istilah mengikuti nama toko (bagian depan alamat Erzap): ototech.erzap.com -> "Tipe Motor" dan "Mekanik", selain itu "Tipe HP" dan "Teknisi"
    const OTOTECH = /(^|[.-])ototech([.-]|$)/i.test(location.hostname.replace(/\.erzap\.com$/i, ''));
    const JUDUL_TIPE = OTOTECH ? 'Tipe Motor' : 'Tipe HP';
    const IST_TEKNISI = OTOTECH ? 'Mekanik' : 'Teknisi';        // label di bawah kode servis, filter, dst.
    const IST_KECIL = IST_TEKNISI.toLowerCase();
    // Kolom tambahan: Outlet di kiri Status, tipe unit di kanan Pelanggan (dicari dari judul header)
    const KOLOM = [
        { kelas: TANDA, judul: 'Outlet', acuan: 'status', setelah: false },
        { kelas: TANDA_TIPE, judul: JUDUL_TIPE, acuan: 'pelanggan', setelah: true }
    ];
    const TEKS_BELUM = 'Nota proses'; // ditampilkan saat Outlet belum ada (sebelumnya "-")

    let cache = {};
    try { cache = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}'); } catch (e) { cache = {}; }
    function simpanCache() {
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* abaikan */ }
    }

    const antrian = [];
    let aktif = 0;

    function teksBersih(el) {
        return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
    }

    // Kolom acuan dicari dari judul header, bukan posisi tetap
    function indeksKolom(tabel, nama) {
        const ths = tabel.querySelectorAll('thead tr:last-child th');
        let n = 0; // th buatan skrip tidak dihitung, karena baris tbody baru belum punya kolom itu
        for (let i = 0; i < ths.length; i++) {
            if (KOLOM.some(k => ths[i].classList.contains(k.kelas))) { n++; continue; }
            if (teksBersih(ths[i]).toLowerCase() === nama) return i - n;
        }
        return -1;
    }

    // ===== Ambil nama outlet dari HTML halaman detail servis =====
    function cariOutlet(doc) {
        // 1) Label "Outlet" (th/dt/label/strong/td/span/b) -> nilai di elemen sesudahnya
        const kandidat = doc.querySelectorAll('th, dt, label, strong, b, td, span, div.col-form-label');
        for (const k of kandidat) {
            const t = teksBersih(k).replace(/:$/, '').trim().toLowerCase();
            if (t !== 'outlet') continue;
            if (k.closest('nav, aside, header, footer, .sidebar, .main-sidebar, .navbar, .nav, [class*="menu"]')) continue; // label menu, bukan data servis
            let nilai = k.nextElementSibling;
            if (!nilai && k.parentElement) nilai = k.parentElement.nextElementSibling;
            const v = teksBersih(nilai);
            if (v) return v;
        }
        // 2) Select/input outlet di form
        const sel = doc.querySelector('select[id*="outlet"] option[selected]') || doc.querySelector('select[id*="outlet"] option:checked');
        if (sel && teksBersih(sel)) return teksBersih(sel);
        // 3) "Outlet : Nama" dalam teks biasa
        const m = (doc.body ? doc.body.textContent : '').replace(/\s+/g, ' ').match(/Outlet\s*:\s*([^:|]{2,60}?)(?:\s{2,}|\s[A-Z][a-z]+\s*:|$)/);
        return m ? m[1].trim() : '';
    }

    // Tipe HP = judul <h1> halaman detail (mis. "REDMI 10 2022 - SEA BLUE"), bukan judul "Kelola Servis Elektronik - SRxxxx" / judul modal
    const BUKAN_TIPE = /^(kelola servis|pembayaran|verifikasi|konfirmasi|pengambilan|pembatalan|penambahan|registrasi|peringatan|serial number)/i;
    const BATAS_NILAI = /^(STRONG|B|BR|P|DIV|TABLE|UL|OL|HR|LABEL|H[1-6])$/;
    function cariTipe(doc) {
        // 1) Label "Nama Unit:" (bisa lebih dari satu unit per servis) -> teks sesudahnya, digabung koma
        const unit = [];
        for (const s of doc.querySelectorAll('strong, b, label')) {
            if (teksBersih(s).replace(/:$/, '').trim().toLowerCase() !== 'nama unit') continue;
            let v = '';
            for (let n = s.nextSibling; n && !(n.nodeType === 1 && BATAS_NILAI.test(n.tagName)); n = n.nextSibling) v += n.textContent;
            v = v.replace(/\s+/g, ' ').trim();
            if (!v) v = teksBersih(s.nextElementSibling) || teksBersih(s.parentElement && s.parentElement.nextElementSibling);
            if (v && !unit.includes(v)) unit.push(v);
        }
        if (unit.length) return unit.length === 1 ? unit[0] : unit.map((u, i) => (i + 1) + '. ' + u).join('\n'); // >1 unit: bernomor, tiap unit di baris sendiri
        // 2) Cadangan: judul <h1>
        for (const h of doc.querySelectorAll('h1')) {
            const t = teksBersih(h);
            if (t && !BUKAN_TIPE.test(t)) return t;
        }
        return '';
    }

    // Teknisi = input "Teknisi" tiap unit di form detail (servis_elektronik_detailN[user_teknisi_nama]), nilainya ada di atribut value.
    // Nama unik, digabung koma bila servis punya beberapa unit.
    function cariTeknisi(doc) {
        const nama = [];
        doc.querySelectorAll('input[name*="[user_teknisi_nama]"]').forEach(inp => {
            const t = (inp.getAttribute('value') || '').replace(/\s+/g, ' ').trim();
            if (t && !nama.includes(t)) nama.push(t);
        });
        // Cadangan: kotak Teknisi bisa kosong (servis belum "ditugaskan" lewat kotak itu) -> pakai Penanggung Jawab yang terpilih
        if (!nama.length) {
            doc.querySelectorAll('select[name*="[iduser_penanggung_jawab]"]').forEach(sel => {
                const o = sel.querySelector('option[selected]');
                const t = o && o.value ? teksBersih(o) : '';
                if (t && !/^please select/i.test(t) && !nama.includes(t)) nama.push(t);
            });
        }
        return nama.join(', ');
    }

    // Pasangan nama -> ID teknisi dari kotak Teknisi tiap unit (servis_elektronik_detailN[iduser_teknisi]); dipakai untuk
    // mengisi filter Teknisi bawaan Erzap (butuh ID, bukan hanya nama)
    function cariTeknisiPeta(doc) {
        const peta = {};
        doc.querySelectorAll('input[name*="[user_teknisi_nama]"]').forEach(inp => {
            const nama = (inp.getAttribute('value') || '').replace(/\s+/g, ' ').trim();
            const idInp = doc.querySelector('input[name="' + inp.name.replace('[user_teknisi_nama]', '[iduser_teknisi]') + '"]');
            const id = idInp ? (idInp.getAttribute('value') || '').trim() : '';
            if (nama && id) peta[nama] = id;
        });
        return peta;
    }

    async function ambilOutlet(url) {
        if (url in cache) return cache[url];
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const tipe = cariTipe(doc) || '-';
        const teknisi = cariTeknisi(doc);
        const peta = cariTeknisiPeta(doc);
        const outlet = cariOutlet(doc) || '-';
        if (outlet === '-') {
            const txt = (doc.body ? doc.body.textContent : '').replace(/\s+/g, ' ');
            const cuplikan = [];
            const re = /outlet/ig;
            let m;
            while ((m = re.exec(txt)) && cuplikan.length < 5) cuplikan.push(txt.slice(Math.max(0, m.index - 40), m.index + 80));
            console.warn('[kelolaservis] Outlet tidak ditemukan di', url, '| cuplikan kata "outlet":', cuplikan);
            return { outlet, tipe, teknisi, peta }; // tidak di-cache supaya dicoba lagi saat dimuat ulang
        }
        if (!teknisi) {
            // Teknisi kosong bisa berarti belum ditugaskan -> jangan di-cache, dicek lagi saat dimuat ulang
            const t = (doc.body ? doc.body.textContent : '').replace(/\s+/g, ' ');
            const cuplikan = [];
            const re = /teknisi/ig;
            let m;
            while ((m = re.exec(t)) && cuplikan.length < 4) cuplikan.push(t.slice(Math.max(0, m.index - 30), m.index + 60));
            console.warn('[kelolaservis] Teknisi kosong di', url, '| input teknisi:', doc.querySelectorAll('input[name*="teknisi"]').length, '| cuplikan:', cuplikan);
            return { outlet, tipe, teknisi, peta };
        }
        cache[url] = { outlet, tipe, teknisi, peta };
        simpanCache();
        return cache[url];
    }

    // Isi bagian nama outlet di sel Outlet (bagian "Status: ..." di bawahnya dibiarkan)
    function isiOutlet(td, teks) {
        const s = td.querySelector('.ks_outlet_nilai');
        (s || td).textContent = teks;
    }

    function jalankanAntrian() {
        while (aktif < PARALEL && antrian.length) {
            const { url, td, tdTipe, elTeknisi } = antrian.shift();
            if (!td.isConnected) continue; // baris sudah hilang karena redraw
            aktif++;
            ambilOutlet(url)
                .then(d => {
                    isiOutlet(td, (d.outlet && d.outlet !== '-') ? d.outlet : TEKS_BELUM);
                    tdTipe.textContent = d.tipe || '-';
                    tdTipe.style.whiteSpace = 'pre-line'; // unit kedua dst tampil di bawahnya
                    if (elTeknisi) elTeknisi.textContent = IST_TEKNISI + ' : ' + (d.teknisi || '-');
                    const tr = td.closest('tr');
                    if (tr) tr.dataset.ksTeknisi = d.teknisi || ''; // dipakai filter teknisi
                    simpanPeta(d.peta);
                })
                .catch(e => {
                    isiOutlet(td, '?'); td.title = String(e && e.message || e);
                    tdTipe.textContent = '?'; tdTipe.title = td.title;
                    if (elTeknisi) elTeknisi.textContent = IST_TEKNISI + ' : ?';
                    const tr = td.closest('tr');
                    if (tr) tr.dataset.ksTeknisi = ''; // gagal dimuat: dianggap tanpa teknisi
                })
                .finally(() => { aktif--; perbaruiFilterTeknisi(); sinkronLebar(); jalankanAntrian(); });
        }
    }

    // Samakan lebar th header yang kelihatan dengan kolom asli di area scroll
    let timerSinkron = null;
    function sinkronLebar() {
        clearTimeout(timerSinkron);
        timerSinkron = setTimeout(() => {
            const tabel = document.querySelector('table#data_table');
            const headVis = document.querySelector('.dataTables_scrollHead table');
            if (!tabel || !headVis) return;
            // Ukur dari sel baris pertama (lebar nyata), bukan dari th sizing yang bisa punya width inline lama
            // Ukur dari baris yang kelihatan (baris yang disembunyikan filter teknisi lebarnya 0)
            const baris = Array.from(tabel.querySelectorAll('tbody tr')).find(tr => tr.style.display !== 'none');
            const vis = headVis.querySelectorAll('thead tr:last-child th');
            if (!baris || baris.children.length !== vis.length) return;
            const total = tabel.getBoundingClientRect().width;
            Array.from(baris.children).forEach((td, i) => {
                let w = td.getBoundingClientRect().width;
                if (vis[i].classList.contains(TANDA_TIPE)) w = Math.max(w, lebarTipe());
                vis[i].style.boxSizing = 'border-box';
                vis[i].style.width = w + 'px';
                vis[i].style.minWidth = w + 'px';
                vis[i].style.maxWidth = w + 'px';
            });
            headVis.style.tableLayout = 'fixed';
            headVis.style.width = total + 'px';
            const inner = headVis.parentElement;
            if (inner) inner.style.width = total + 'px';
        }, 150);
    }

    // Header di dalam area scroll hanya penentu lebar kolom -> harus tak kelihatan (tinggi 0),
    // header yang kelihatan adalah yang di .dataTables_scrollHead
    function pasangStyle() {
        if (document.getElementById('ks_style')) return;
        const st = document.createElement('style');
        st.id = 'ks_style';
        st.textContent = `
            .ks_kolom_status, .ks_kolom_proses { display: none !important; }
            /* Satu ukuran huruf untuk SEMUA isi tabel (kolom asli + kolom tambahan) dan judul kolom yang kelihatan.
               Variabel --ks-fs dihitung dari ukuran kode servis, maksimal 13px di layar kecil (lihat aturFs). */
            html.ks_fs_aktif table#data_table tbody td, html.ks_fs_aktif table#data_table tbody td *, html.ks_fs_aktif .dataTables_scrollHead th { font-size: var(--ks-fs, 13px) !important; }
            .ks_wa svg { width: max(20px, calc(var(--ks-fs, 13px) * 1.6)) !important; height: max(20px, calc(var(--ks-fs, 13px) * 1.6)) !important; }
            /* Kolom Aksi: semua tombol rata kiri, tersusun ke bawah, tepi kiri ikon sejajar */
            th.ks_aksi_head, td.ks_aksi_sel { text-align: left !important; vertical-align: middle; }
            td.ks_aksi_sel > *, td.ks_aksi_sel .ks_aksi_proses { text-align: left !important; margin-left: 0 !important; padding-left: 0 !important; float: none !important; }
            td.ks_aksi_sel .ks_aksi_item { display: flex !important; align-items: center; justify-content: flex-start !important; width: auto !important; margin: 0 0 4px 0 !important; text-align: left !important; float: none !important; }
            td.ks_aksi_sel .ks_aksi_proses .ks_aksi_item:last-child, td.ks_aksi_sel > .ks_aksi_item:last-child { margin-bottom: 0 !important; }
            /* Scrollbar area tabel (vertikal + horizontal) dibuat tipis */
            .dataTables_scrollBody::-webkit-scrollbar { width: 5px !important; height: 5px !important; }
            .dataTables_scrollBody::-webkit-scrollbar-button { display: none !important; width: 0 !important; height: 0 !important; }
            .dataTables_scrollBody::-webkit-scrollbar-thumb { background: #b5b5b5; border-radius: 3px; }
            .dataTables_scrollBody::-webkit-scrollbar-thumb:hover { background: #8e8e8e; }
            .dataTables_scrollBody::-webkit-scrollbar-track { background: #efefef; }
            .ks_wa svg { vertical-align: middle; }
            .paginate_lite_wrap { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; }
            .paginate_lite_wrap .pagination_links { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
            @media (max-width: 768px) {
                .dataTables_scrollBody::-webkit-scrollbar { width: 8px !important; height: 8px !important; } /* lebih mudah disentuh */
                .ks_wa { display: inline-block; padding: 3px 0; } /* area sentuh WA lebih besar */
                .ks_wa svg { width: 24px; height: 24px; }
                .paginate_lite_wrap { justify-content: center; text-align: center; }
                .paginate_lite_wrap a.pagination_link { display: inline-block; padding: 8px 12px; }
            }
            .dataTables_scrollBody table#data_table > thead { visibility: collapse !important; }
            .dataTables_scrollBody table#data_table > thead tr { height: 0 !important; visibility: collapse !important; }
            .dataTables_scrollBody table#data_table > thead th {
                height: 0 !important; padding-top: 0 !important; padding-bottom: 0 !important;
                border-top-width: 0 !important; border-bottom-width: 0 !important;
                line-height: 0 !important; font-size: 0 !important; overflow: hidden !important;
            }
            .dataTables_scrollBody table#data_table > thead th::before,
            .dataTables_scrollBody table#data_table > thead th::after { display: none !important; }
        `;
        document.head.appendChild(st);
    }

    // Halaman Kelola Servis menampilkan blok paginasi ganda -> sisakan satu yang KELIHATAN.
    // Blok yang pernah kita sembunyikan dibuka dulu, supaya paginasi tidak hilang total kalau yang pertama
    // ternyata tidak kelihatan / halaman diganti.
    function rapikanPaginasi() {
        const semua = Array.from(document.querySelectorAll('.paginate_lite_wrap'));
        semua.forEach(el => { if (el.dataset.ksSembunyi) { el.style.display = ''; delete el.dataset.ksSembunyi; } });
        const tampak = semua.filter(el => el.getClientRects().length > 0);
        const tabel = document.querySelector('table#data_table');
        // Paginasi harus di LUAR tabel (tidak ikut ter-scroll): pembungkus DataTables, atau kalau tidak ada, area scroll tabel
        const pembungkus = tabel && (tabel.closest('.dataTables_wrapper') || tabel.closest('.dataTables_scroll') || tabel.parentElement);
        // kalau sudah ada yang di luar tabel, pakai itu; kalau tidak, yang pertama
        const simpan = tampak.find(el => pembungkus && !pembungkus.contains(el)) || tampak[0];
        tampak.forEach(el => { if (el !== simpan) { el.dataset.ksSembunyi = '1'; el.style.display = 'none'; } });
        if (simpan && pembungkus && pembungkus.contains(simpan) && pembungkus.nextElementSibling !== simpan) {
            pembungkus.after(simpan); // pindah ke bawah, di luar pembungkus tabel
            simpan.style.marginTop = '8px';
        }
    }

    let nomor = 0;
    function proses() {
        const tabel = document.querySelector('table#data_table');
        if (!tabel) return;
        rapikanPaginasi();
        const iu = indeksKolom(tabel, 'status');
        if (iu < 0) return;
        const ip = indeksKolom(tabel, 'pelanggan'); // kalau tidak ada, kolom Tipe HP dilewati

        // Header: DataTables menduplikasi thead (tabel scrollHead terpisah + thead tersembunyi) -> semua diisi
        pasangStyle();

        // DataTables punya 2 thead: yang kelihatan (scrollHead) dan yang tersembunyi di dalam area scroll
        // (penentu lebar kolom). Dua-duanya harus punya kolom Outlet supaya sejajar dengan isi tabel.
        document.querySelectorAll('.dataTables_scrollHead table thead, table#data_table thead').forEach(thead => {
          // kolom Status asli: header disembunyikan (isinya dipindah ke sel Outlet)
          const barisAkhir = thead.querySelector('tr:last-child');
          if (barisAkhir) Array.from(barisAkhir.children).forEach(h => {
              if (!h.classList.contains('ks_kolom_status') && teksBersih(h).toLowerCase() === 'status') h.classList.add('ks_kolom_status');
          });
          KOLOM.forEach(kol => {
            if (kol.acuan === 'pelanggan' && ip < 0) return;
            const rows = thead.querySelectorAll('tr');
            if (!rows.length) return;
            const ths = rows[rows.length - 1].children;
            let pos = -1;
            for (let i = 0; i < ths.length; i++) if (teksBersih(ths[i]).toLowerCase() === kol.acuan) { pos = i; break; }
            if (pos < 0) return;
            rows.forEach((tr, i) => {
                const ada = tr.querySelectorAll('.' + kol.kelas);
                ada.forEach((x, n) => { if (n > 0) x.remove(); }); // buang duplikat (DataTables meng-clone header)
                if (ada.length) return;
                const th = document.createElement('th');
                th.className = kol.kelas;
                if (i === rows.length - 1) {
                    if (thead.closest('.dataTables_scrollHead')) {
                        th.textContent = kol.judul;
                        // Samakan tampilan dengan th acuan (garis bawah, warna, padding), tanpa ikon urut
                        const ref = tr.children[pos];
                        th.className = (kol.kelas + ' ' + ref.className).replace(/\bsorting\w*\b/g, '').replace(/\bks_kolom_status\b/g, '').trim() + ' sorting_disabled';
                        const cs = getComputedStyle(ref);
                        th.style.borderBottom = cs.borderBottomWidth + ' ' + cs.borderBottomStyle + ' ' + cs.borderBottomColor;
                        th.style.backgroundColor = cs.backgroundColor;
                        th.style.color = cs.color;
                        th.style.padding = cs.padding;
                    } else {
                        th.style.cssText = 'padding-top:0;padding-bottom:0;border-top-width:0;border-bottom-width:0;height:0';
                        if (kol.kelas === TANDA_TIPE) th.style.cssText += ';min-width:' + lebarTipe() + 'px;width:' + lebarTipe() + 'px';
                        const d = document.createElement('div');
                        d.className = 'dataTables_sizing';
                        d.style.cssText = 'height:0;overflow:hidden';
                        d.textContent = kol.judul;
                        th.appendChild(d);
                    }
                }
                if (kol.setelah) tr.children[pos].after(th); else tr.children[pos].before(th);
            });
          });
        });

        tabel.querySelectorAll('tbody tr').forEach(tr => {
            if (tr.querySelector('.' + TANDA)) return;
            if (tr.children.length <= Math.max(iu, ip)) return; // baris "tidak ada data" (colspan)
            const acuStatus = tr.children[iu];
            const acuPelanggan = ip >= 0 ? tr.children[ip] : null;
            const td = document.createElement('td');
            td.className = TANDA;
            td.dataset.ks = String(++nomor);
            // Isi sel Outlet: nama outlet di atas, "Status: ..." di bawahnya. Kolom Status asli disembunyikan (bukan dihapus,
            // supaya DataTables dan penghitung kolom tetap konsisten) dan teks + warnanya dipindah ke sini.
            const nilaiOutlet = document.createElement('span');
            nilaiOutlet.className = 'ks_outlet_nilai';
            nilaiOutlet.textContent = '...';
            const barisStatus = document.createElement('div');
            barisStatus.className = 'ks_status_baris';
            const teksStatus = teksBersih(acuStatus) || '-';
            const sumberWarna = acuStatus.querySelector('a, span, b, strong, font') || acuStatus;
            const gayaAsli = getComputedStyle(sumberWarna); // ukuran huruf asli kolom Status dipakai lagi
            barisStatus.style.cssText = 'margin-top:2px;color:#000'; // tulisan "Status:" hitam (ukuran huruf: lihat .ks_fs di CSS)
            const nilaiStatus = document.createElement('span');
            nilaiStatus.className = 'ks_status_nilai';
            nilaiStatus.style.color = gayaAsli.color; // hanya nilainya yang berwarna (warna asli kolom Status)
            nilaiStatus.style.fontWeight = gayaAsli.fontWeight;
            // Latar tipis dari warna statusnya sendiri (hijau -> latar hijau muda, biru -> biru muda, dst.)
            const m = gayaAsli.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            nilaiStatus.style.backgroundColor = m ? 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',0.14)' : 'rgba(0,0,0,0.08)';
            nilaiStatus.style.padding = '1px 8px';
            nilaiStatus.style.borderRadius = '10px';
            nilaiStatus.style.display = 'inline-block';
            nilaiStatus.style.lineHeight = '1.4';
            nilaiStatus.textContent = teksStatus;
            barisStatus.append('Status: ', nilaiStatus);
            td.append(nilaiOutlet, barisStatus);
            acuStatus.before(td);
            acuStatus.classList.add('ks_kolom_status');
            const tdTipe = document.createElement('td');
            tdTipe.className = TANDA_TIPE;
            tdTipe.style.cssText = 'min-width:' + lebarTipe() + 'px;width:' + lebarTipe() + 'px'; // inline, supaya menang atas lebar kolom bawaan tabel
            tdTipe.textContent = '...';
            if (acuPelanggan) acuPelanggan.after(tdTipe);

            const a = tr.querySelector('a[href*="/servis_elektroniks/kelola_servis/"]');
            if (!a) { isiOutlet(td, TEKS_BELUM); tdTipe.textContent = '-'; tr.dataset.ksTeknisi = ''; return; }
            let url;
            try { url = new URL(a.getAttribute('href'), location.href).href; } catch (e) { isiOutlet(td, TEKS_BELUM); tdTipe.textContent = '-'; tr.dataset.ksTeknisi = ''; return; }
            // Teknisi: di bawah kode servis (di sel yang sama)
            // Link "Edit Penerimaan" / "Proses Servis" juga mengarah ke kelola_servis/ID -> sel kode dicari lewat teks link (SRxxxx-xxxx)
            // Cari sel yang berisi kode servis (SRxxxx-xxxx), tidak peduli link-nya mengarah ke mana; sel buatan skrip dilewati
            const RE_KODE = /[A-Z]{2}\d{3,}-\d+/;
            const selKode = Array.from(tr.children).find(c => !c.className.includes('ks_') && RE_KODE.test(c.textContent));
            let elTeknisi = null;
            if (selKode) {
                elTeknisi = document.createElement('div');
                elTeknisi.className = 'ks_teknisi';
                elTeknisi.style.cssText = 'color:#333;margin-top:3px;line-height:1.3'; // ukuran huruf: lihat .ks_fs di CSS
                elTeknisi.textContent = IST_TEKNISI + ' : ...';
                selKode.appendChild(elTeknisi);
            }
            antrian.push({ url, td, tdTipe, elTeknisi });
        });
        aturFs(tabel);
        gabungAksi(tabel);
        telpJadiWA(tabel);
        perbaruiFilterTeknisi();
        jalankanAntrian();
        sinkronLebar();
    }

    // ===== Filter teknisi (di atas tabel): pilihannya diambil dari teknisi yang sudah termuat di baris =====
    const SEMUA = '', TANPA = '__tanpa__';
    let teknisiTerpilih = SEMUA;

    // Peta nama -> ID teknisi, dikumpulkan dari halaman detail yang pernah dimuat dan disimpan permanen (localStorage),
    // supaya daftar pilihan tetap lengkap setelah filter server membuat halaman hanya berisi satu teknisi.
    const KUNCI_PETA = 'ks_teknisi_peta_v1';
    const KUNCI_PILIH = 'ks_teknisi_dipilih_v1';
    let petaTeknisi = {};
    try { petaTeknisi = JSON.parse(localStorage.getItem(KUNCI_PETA) || '{}') || {}; } catch (e) { petaTeknisi = {}; }
    function simpanPeta(baru) {
        if (!baru) return;
        let berubah = false;
        Object.keys(baru).forEach(n => { if (petaTeknisi[n] !== baru[n]) { petaTeknisi[n] = baru[n]; berubah = true; } });
        if (berubah) { try { localStorage.setItem(KUNCI_PETA, JSON.stringify(petaTeknisi)); } catch (e) { /* abaikan */ } }
    }

    // Mengisi filter Teknisi bawaan Erzap (nama + ID, tanpa memicu event "input" miliknya yang akan mengosongkan ID),
    // lalu menekan tombol Filter -> penyaringan terjadi di server, lintas halaman.
    function terapkanKeServer(o) {
        const nama = document.getElementById('user_teknisi_user_nama');
        const id = document.getElementById('user_teknisi_iduser_teknisi');
        const tmp = document.getElementById('user_teknisi_tmp_user_nama');
        const tombol = document.getElementById('bt_filter_servis_elektronik');
        if (!nama || !id || !tombol) return false;
        const aktifServer = !!id.value;
        let nilaiNama = '', nilaiId = '';
        if (o.v === SEMUA) {
            if (!aktifServer) return false; // memang belum ada filter di server
        } else if (o.v !== TANPA && petaTeknisi[o.v]) {
            nilaiNama = o.v; nilaiId = petaTeknisi[o.v];
            if (aktifServer && id.value === nilaiId) return false; // sudah terfilter teknisi ini
        } else {
            return false; // "(Tanpa teknisi)" / ID belum diketahui -> hanya filter di tabel
        }
        nama.value = nilaiNama;
        id.value = nilaiId;
        if (tmp) tmp.value = nilaiNama;
        try { sessionStorage.setItem(KUNCI_PILIH, JSON.stringify({ v: o.v, t: Date.now() })); } catch (e) { /* abaikan */ }
        tombol.click();
        return true;
    }

    // Pilihan awal: kalau server sudah memfilter (kotak bawaan terisi) atau baru saja kita kirim -> tampilkan itu
    let pilihanAwalDibaca = false;
    function bacaPilihanAwal() {
        if (pilihanAwalDibaca) return;
        pilihanAwalDibaca = true;
        const nama = document.getElementById('user_teknisi_user_nama');
        const nilai = nama ? nama.value.replace(/\s+/g, ' ').trim() : '';
        if (nilai) { teknisiTerpilih = nilai; return; }
        try {
            const j = JSON.parse(sessionStorage.getItem(KUNCI_PILIH) || 'null');
            sessionStorage.removeItem(KUNCI_PILIH);
            // hanya berlaku untuk halaman yang dimuat tepat setelah pilihan (halaman diganti oleh filter)
            if (j && Date.now() - j.t < 20000 && j.v !== SEMUA && j.v !== TANPA) teknisiTerpilih = j.v;
        } catch (e) { /* abaikan */ }
    }
    let kunciOpsi = '';

    function daftarTeknisi(baris) {
        return (baris.dataset.ksTeknisi || '').split(',').map(x => x.trim()).filter(Boolean);
    }

    // Combobox pencarian: kotak teks + daftar saran yang tersaring saat mengetik (panah atas/bawah, Enter, Esc didukung)
    let opsiTeknisi = [{ v: SEMUA, t: 'Semua ' + IST_KECIL }];
    let sorot = 0; // indeks opsi yang disorot di daftar

    function labelPilihan() {
        const o = opsiTeknisi.find(x => x.v === teknisiTerpilih);
        return o ? o.t : (teknisiTerpilih === TANPA ? '(Tanpa ' + IST_KECIL + ')' : teknisiTerpilih);
    }

    function bangunFilterTeknisi(tabel) {
        let wrap = document.getElementById('ks_filter_teknisi_wrap');
        if (wrap && wrap.isConnected) { tempatkanFilter(wrap, tabel); return wrap; }
        wrap = document.createElement('div');
        wrap.id = 'ks_filter_teknisi_wrap';
        wrap.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin:6px 0;font-size:13px';

        const lab = document.createElement('label');
        lab.textContent = 'Filter ' + IST_TEKNISI + ':';
        lab.htmlFor = 'ks_filter_teknisi';
        lab.style.cssText = 'margin:0;font-weight:600';

        const kotak = document.createElement('div');
        kotak.style.cssText = 'position:relative;min-width:220px;max-width:100%';

        const inp = document.createElement('input');
        inp.type = 'text';
        inp.id = 'ks_filter_teknisi';
        inp.autocomplete = 'off';
        inp.placeholder = 'Cari ' + IST_KECIL + '...';
        inp.setAttribute('role', 'combobox');
        inp.setAttribute('aria-expanded', 'false');
        inp.setAttribute('aria-controls', 'ks_filter_teknisi_list');
        inp.style.cssText = 'width:100%;padding:4px 26px 4px 8px;border:1px solid #bbb;border-radius:4px;box-sizing:border-box;background:#fff';

        const panah = document.createElement('span');
        panah.textContent = '▾'; // ▾
        panah.style.cssText = 'position:absolute;right:8px;top:50%;transform:translateY(-50%);pointer-events:none;color:#666';

        const daftar = document.createElement('div');
        daftar.id = 'ks_filter_teknisi_list';
        daftar.setAttribute('role', 'listbox');
        daftar.style.cssText = 'display:none;position:fixed;left:0;top:0;width:220px;max-height:240px;overflow-y:auto;' +
            'background:#fff;border:1px solid #bbb;border-radius:4px;box-shadow:0 4px 12px rgba(0,0,0,.2);z-index:2147483000';

        const info = document.createElement('span');
        info.id = 'ks_filter_teknisi_info';
        info.style.cssText = 'color:#666;font-size:12px';

        function tersaring() {
            const q = inp.dataset.mengetik ? inp.value.trim().toLowerCase() : '';
            return opsiTeknisi.filter(o => !q || o.t.toLowerCase().includes(q));
        }

        function gambarDaftar() {
            const hasil = tersaring();
            if (sorot >= hasil.length) sorot = Math.max(0, hasil.length - 1);
            daftar.textContent = '';
            if (!hasil.length) {
                const kosong = document.createElement('div');
                kosong.textContent = 'Tidak ada ' + IST_KECIL + ' yang cocok';
                kosong.style.cssText = 'padding:6px 10px;color:#888';
                daftar.appendChild(kosong);
                // Tidak ada di daftar kita -> tawarkan pencarian dengan filter Teknisi bawaan Erzap (seluruh pegawai)
                const q = inp.value.trim();
                if (q && bisaPakaiBawaan()) {
                    const alih = document.createElement('div');
                    alih.setAttribute('role', 'option');
                    alih.textContent = 'Cari "' + q + '" dengan filter bawaan ▸';
                    alih.style.cssText = 'padding:6px 10px;cursor:pointer;color:#0d6efd;border-top:1px solid #eee;background:#f4f8ff';
                    const ambilAlih = e => { e.preventDefault(); e.stopPropagation(); pakaiBawaan(q); };
                    alih.addEventListener('pointerdown', ambilAlih);
                    alih.addEventListener('mousedown', ambilAlih);
                    daftar.appendChild(alih);
                }
                return;
            }
            hasil.forEach((o, i) => {
                const it = document.createElement('div');
                it.setAttribute('role', 'option');
                it.textContent = o.t;
                const aktif = o.v === teknisiTerpilih;
                it.style.cssText = 'padding:6px 10px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' +
                    (i === sorot ? ';background:#e7f1ff' : '') + (aktif ? ';font-weight:600' : '');
                // pointerdown/mousedown (bukan click) supaya terjadi sebelum input kehilangan fokus; dijaga agar hanya sekali jalan
                const ambil = e => { e.preventDefault(); e.stopPropagation(); if (it.dataset.dipilih) return; it.dataset.dipilih = '1'; pilih(o); };
                it.addEventListener('pointerdown', ambil);
                it.addEventListener('mousedown', ambil);
                it.addEventListener('click', ambil);
                // sorotan hanya diubah gayanya, elemen TIDAK dibangun ulang (membangun ulang saat kursor lewat membuat klik meleset)
                it.addEventListener('mouseenter', () => {
                    sorot = i;
                    Array.from(daftar.children).forEach((c, k) => { c.style.background = k === i ? '#e7f1ff' : ''; });
                });
                daftar.appendChild(it);
            });
            // gulir di dalam daftar saja (scrollIntoView ikut menggulir halaman)
            const sel = daftar.children[sorot];
            if (sel) {
                if (sel.offsetTop < daftar.scrollTop) daftar.scrollTop = sel.offsetTop;
                else if (sel.offsetTop + sel.offsetHeight > daftar.scrollTop + daftar.clientHeight) daftar.scrollTop = sel.offsetTop + sel.offsetHeight - daftar.clientHeight;
            }
        }

        // Daftar dipasang di <body> dengan position:fixed (bukan di dalam panel): elemen lain di panel / sidebar tidak bisa
        // menutupinya dan menelan klik, dan overflow panel tidak memotongnya.
        function letakkanDaftar() {
            const r = inp.getBoundingClientRect();
            const bawah = window.innerHeight - r.bottom;
            const tinggi = Math.min(240, Math.max(120, bawah - 8));
            daftar.style.left = r.left + 'px';
            daftar.style.top = (r.bottom + 2) + 'px';
            daftar.style.width = r.width + 'px';
            daftar.style.maxHeight = tinggi + 'px';
        }

        function buka() {
            if (daftar.parentElement !== document.body) document.body.appendChild(daftar);
            daftar.style.display = 'block';
            letakkanDaftar();
            inp.setAttribute('aria-expanded', 'true');
            gambarDaftar();
        }
        function tutup() {
            daftar.style.display = 'none';
            inp.setAttribute('aria-expanded', 'false');
            delete inp.dataset.mengetik;
            inp.value = labelPilihan();
        }
        // ----- Mode filter bawaan: kotak Teknisi asli Erzap ditampilkan lagi (autocomplete seluruh pegawai) -----
        function kotakBawaan() {
            const nama = document.getElementById('user_teknisi_user_nama');
            return nama ? { nama, isi: nama.closest('.autocomplete_pegawai_content') } : null;
        }
        function bisaPakaiBawaan() {
            const b = kotakBawaan();
            return !!(b && b.isi && wrap.dataset.mode === 'panel');
        }
        function pakaiBawaan(q) {
            const b = kotakBawaan();
            if (!b || !b.isi) return;
            tutup();
            inp.blur();
            wrap.dataset.bawaan = '1';
            wrap.style.display = 'none';
            b.isi.style.display = 'flex'; // tampilan aslinya (display:flex)
            // petunjuk + tombol kembali, tepat di bawah kotak bawaan
            let petunjuk = document.getElementById('ks_bawaan_petunjuk');
            if (!petunjuk) {
                petunjuk = document.createElement('div');
                petunjuk.id = 'ks_bawaan_petunjuk';
                petunjuk.style.cssText = 'font-size:12px;color:#666;margin-top:3px';
                petunjuk.append('Filter bawaan: pilih nama dari daftar, lalu tekan tombol Filter. ');
                const kembali = document.createElement('a');
                kembali.href = '#';
                kembali.textContent = '‹ kembali ke filter cepat';
                kembali.addEventListener('click', ev => { ev.preventDefault(); kembaliKeFilterKita(); });
                petunjuk.appendChild(kembali);
                b.isi.after(petunjuk);
            }
            petunjuk.style.display = '';
            // isi kotak bawaan dengan yang diketik, lalu pancing autocomplete-nya (jQuery UI mendengar event DOM biasa)
            b.nama.value = q;
            b.nama.focus();
            b.nama.dispatchEvent(new Event('input', { bubbles: true }));
            b.nama.dispatchEvent(new KeyboardEvent('keydown', { key: q.slice(-1), bubbles: true }));
            b.nama.dispatchEvent(new KeyboardEvent('keyup', { key: q.slice(-1), bubbles: true }));
        }
        function kembaliKeFilterKita() {
            const b = kotakBawaan();
            delete wrap.dataset.bawaan;
            wrap.style.display = 'block';
            if (b && b.isi) b.isi.style.display = 'none';
            const petunjuk = document.getElementById('ks_bawaan_petunjuk');
            if (petunjuk) petunjuk.style.display = 'none';
        }

        function pilih(o) {
            teknisiTerpilih = o.v;
            tutup();
            inp.blur();
            terapkanFilterTeknisi();
            sinkronLebar();
            terapkanKeServer(o); // filter di server (lintas halaman) bila nama + ID teknisinya diketahui
        }

        inp.addEventListener('focus', () => { delete inp.dataset.mengetik; sorot = 0; inp.select(); buka(); });
        inp.addEventListener('click', () => { if (daftar.style.display === 'none') { sorot = 0; buka(); } });
        inp.addEventListener('blur', tutup);
        inp.addEventListener('input', () => { inp.dataset.mengetik = '1'; sorot = 0; buka(); });
        inp.addEventListener('keydown', e => {
            const hasil = tersaring();
            if (e.key === 'ArrowDown') { e.preventDefault(); if (daftar.style.display === 'none') buka(); else { sorot = Math.min(sorot + 1, hasil.length - 1); gambarDaftar(); } }
            else if (e.key === 'ArrowUp') { e.preventDefault(); sorot = Math.max(sorot - 1, 0); gambarDaftar(); }
            else if (e.key === 'Enter') {
                e.preventDefault();
                if (hasil[sorot]) pilih(hasil[sorot]);
                else if (inp.value.trim() && bisaPakaiBawaan()) pakaiBawaan(inp.value.trim()); // tidak ada yang cocok -> filter bawaan
            }
            else if (e.key === 'Escape') { tutup(); inp.blur(); }
        });
        // isi daftar bisa berubah saat data teknisi masuk -> gambar ulang kalau sedang terbuka
        wrap.gambarUlang = () => { if (daftar.style.display !== 'none') gambarDaftar(); else inp.value = labelPilihan(); };

        inp.value = labelPilihan();
        const lamaDiBody = document.getElementById('ks_filter_teknisi_list'); // sisa combobox lama (halaman diganti AJAX)
        if (lamaDiBody) lamaDiBody.remove();
        daftar.addEventListener('mousedown', e => e.preventDefault()); // klik scrollbar daftar tidak boleh membuat kotak kehilangan fokus (daftar menutup)
        const geser = () => { if (daftar.style.display !== 'none' && inp.isConnected) letakkanDaftar(); else if (!inp.isConnected) daftar.remove(); };
        window.addEventListener('scroll', geser, true);
        window.addEventListener('resize', geser);
        kotak.append(inp, panah);
        wrap.append(lab, kotak, info);
        wrap.dataset.mode = '';
        tempatkanFilter(wrap, tabel);
        kunciOpsi = ''; // opsi harus dibangun ulang di wrap baru
        return wrap;
    }

    // Tempat combobox: menggantikan kotak "Teknisi" bawaan di panel Pencarian (kanan). Kotak bawaan disembunyikan
    // (isiannya kosong, jadi tidak ikut menyaring di server). Kalau panel tidak ada -> di atas tabel.
    function tempatkanFilter(wrap, tabel) {
        const asli = document.getElementById('user_teknisi_user_nama');
        const field = asli ? asli.closest('.field2') : null;
        const lab = wrap.querySelector('label');
        const kotak = lab ? lab.nextElementSibling : null;
        if (field) {
            const isi = field.querySelector('.autocomplete_pegawai_content');
            // sembunyikan kotak Teknisi bawaan, kecuali pengguna sedang memakainya (mode filter bawaan)
            if (isi && !wrap.dataset.bawaan && isi.style.display !== 'none') isi.style.display = 'none';
            if (wrap.parentElement !== field) field.appendChild(wrap);
            if (wrap.dataset.mode !== 'panel') {
                wrap.dataset.mode = 'panel';
                wrap.style.cssText = 'display:block;margin:0;font-size:13px';
                if (lab) lab.style.display = 'none'; // label "Teknisi" bawaan sudah ada di atasnya
                if (kotak) kotak.style.cssText = 'position:relative;width:100%;min-width:0;max-width:100%';
            }
        } else if (!wrap.isConnected || wrap.dataset.mode === 'panel') {
            wrap.dataset.mode = 'atas';
            wrap.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin:6px 0;font-size:13px';
            if (lab) lab.style.display = '';
            if (kotak) kotak.style.cssText = 'position:relative;min-width:220px;max-width:100%';
            const wadah = tabel.closest('.dataTables_wrapper') || tabel;
            wadah.before(wrap);
        }
    }

    function perbaruiFilterTeknisi() {
        const tabel = document.querySelector('table#data_table');
        if (!tabel) return;
        bacaPilihanAwal();
        const wrap = bangunFilterTeknisi(tabel);
        const baris = Array.from(tabel.querySelectorAll('tbody tr')).filter(tr => tr.querySelector('.' + TANDA));
        const nama = new Set();
        let tanpa = false, belum = 0;
        baris.forEach(tr => {
            if (tr.dataset.ksTeknisi === undefined) { belum++; return; }
            const d = daftarTeknisi(tr);
            if (d.length) d.forEach(x => nama.add(x)); else tanpa = true;
        });
        Object.keys(petaTeknisi).forEach(n => nama.add(n)); // teknisi yang pernah dilihat (walau barisnya tidak ada di halaman ini)
        const urut = Array.from(nama).sort((a, b) => a.localeCompare(b, 'id'));
        const kunciBaru = urut.join('|') + '#' + tanpa + '#' + teknisiTerpilih;
        if (kunciBaru !== kunciOpsi) { // daftar hanya dibangun ulang bila berubah (menjaga posisi sorot / ketikan user)
            kunciOpsi = kunciBaru;
            const opsi = [{ v: SEMUA, t: 'Semua ' + IST_KECIL }];
            urut.forEach(n => opsi.push({ v: n, t: n }));
            if (tanpa || teknisiTerpilih === TANPA) opsi.push({ v: TANPA, t: '(Tanpa ' + IST_KECIL + ')' });
            // pilihan tetap ada walau barisnya (belum) termuat
            if (teknisiTerpilih !== SEMUA && !opsi.some(o => o.v === teknisiTerpilih)) opsi.push({ v: teknisiTerpilih, t: teknisiTerpilih });
            opsiTeknisi = opsi;
            if (wrap.gambarUlang) wrap.gambarUlang();
        }
        wrap.querySelector('#ks_filter_teknisi_info').textContent = belum ? 'memuat ' + IST_KECIL + ' ' + belum + ' baris...' : '';
        terapkanFilterTeknisi();
    }

    function terapkanFilterTeknisi() {
        const tabel = document.querySelector('table#data_table');
        if (!tabel) return;
        tabel.querySelectorAll('tbody tr').forEach(tr => {
            if (!tr.querySelector('.' + TANDA)) return; // baris "tidak ada data"
            let tampil = true;
            if (teknisiTerpilih !== SEMUA) {
                if (tr.dataset.ksTeknisi === undefined) tampil = false; // belum diketahui -> belum bisa dicocokkan
                else {
                    const d = daftarTeknisi(tr);
                    tampil = teknisiTerpilih === TANPA ? d.length === 0 : d.includes(teknisiTerpilih);
                }
            }
            const mau = tampil ? '' : 'none';
            if (tr.style.display !== mau) tr.style.display = mau;
        });
    }

    // ===== Ukuran huruf seragam =====
    // Acuan: ukuran huruf kode servis (link SRxxxx-xxxx) di tabel, DIUKUR SEKALI sebelum aturan seragam aktif (kelas html.ks_fs_aktif),
    // supaya yang terukur ukuran aslinya, bukan hasil aturan kita sendiri. Di layar kecil dibatasi maksimal 13px.
    // Hasilnya disimpan di variabel CSS --ks-fs yang dipakai seluruh isi tabel (lihat pasangStyle).
    let fsAsli = 0, fsTerakhir = '';
    function aturFs(tabel) {
        if (!fsAsli) {
            const kode = Array.from(tabel.querySelectorAll('tbody a')).find(a => /[A-Z]{2}\d{3,}-\d+/.test(a.textContent));
            const acuan = kode || tabel.querySelector('tbody td');
            if (!acuan) return; // tabel belum berisi -> coba lagi nanti
            const px0 = parseFloat(getComputedStyle(acuan).fontSize);
            if (!isFinite(px0) || px0 <= 0) return;
            fsAsli = px0;
        }
        let px = fsAsli;
        if (HP_LAYAR.matches) px = Math.min(px, 13);
        const nilai = (Math.round(px * 10) / 10) + 'px';
        if (nilai === fsTerakhir) return;
        fsTerakhir = nilai;
        document.documentElement.style.setProperty('--ks-fs', nilai);
        document.documentElement.classList.add('ks_fs_aktif');
    }

    // ===== Kolom "Edit Penerimaan" + "Proses Servis" digabung jadi satu kolom "Aksi" =====
    // Kolom dikenali dari ISI selnya (tulisan link), bukan judul header, karena judul header-nya tidak pasti.
    // Isi sel Proses Servis dipindah ke sel Edit Penerimaan (di bawahnya); kolom Proses Servis disembunyikan, bukan dihapus.
    const RE_EDIT = /^\s*edit\s+penerimaan\s*$/i;
    const RE_PROSES = /^\s*proses\s+servis\s*$/i;

    function gabungAksi(tabel) {
        const baris = Array.from(tabel.querySelectorAll('tbody tr')).filter(tr => tr.querySelector('.' + TANDA));
        let iEdit = -1, iProses = -1;
        for (const tr of baris) {
            const sel = Array.from(tr.children);
            const e = sel.findIndex(c => !c.classList.contains('ks_kolom_proses') && RE_EDIT.test(c.textContent));
            const p = sel.findIndex(c => RE_PROSES.test(c.textContent));
            if (e >= 0) iEdit = e;
            if (p >= 0 && !tr.children[p].classList.contains('ks_kolom_proses')) iProses = p;
            else if (p >= 0 && iProses < 0) iProses = p;
            if (iEdit >= 0 && iProses >= 0) break;
        }
        if (iEdit < 0 || iProses < 0 || iEdit === iProses) return;

        // header (kedua thead): judul kolom pertama jadi "Aksi", kolom kedua disembunyikan
        document.querySelectorAll('.dataTables_scrollHead table thead, table#data_table thead').forEach(thead => {
            const akhir = thead.querySelector('tr:last-child');
            if (!akhir) return;
            const hEdit = akhir.children[iEdit], hProses = akhir.children[iProses];
            if (hEdit && teksBersih(hEdit) !== 'Aksi') hEdit.textContent = 'Aksi';
            if (hEdit) hEdit.classList.add('ks_aksi_head'); // judul ikut rata kiri
            if (hProses) hProses.classList.add('ks_kolom_proses');
        });

        // isi: pindahkan konten sel Proses Servis ke sel Edit Penerimaan (sekali per baris)
        baris.forEach(tr => {
            const cEdit = tr.children[iEdit], cProses = tr.children[iProses];
            if (!cEdit || !cProses || cProses.classList.contains('ks_kolom_proses')) return;
            if (cProses.childNodes.length) {
                const wadah = document.createElement('div');
                wadah.className = 'ks_aksi_proses';
                wadah.style.marginTop = '0';
                while (cProses.firstChild) wadah.appendChild(cProses.firstChild); // pindah node asli, pendengar event-nya ikut
                cEdit.appendChild(wadah);
            }
            cProses.classList.add('ks_kolom_proses');
        });

        // rata kiri + ikon (Font Awesome 4 bawaan Erzap, class "fa") di depan tiap tombol
        baris.forEach(tr => {
            const cEdit = tr.children[iEdit];
            if (!cEdit) return;
            cEdit.classList.add('ks_aksi_sel'); // rata kiri dipaksa lewat CSS !important (gaya bawaan Erzap bisa memusatkan isi sel)
            cEdit.querySelectorAll('a, button').forEach(el => {
                if (el.dataset.ksIkon) return;
                const t = el.textContent;
                const kelas = RE_EDIT.test(t) ? 'fa-pencil-square-o' : (RE_PROSES.test(t) ? 'fa-wrench' : '');
                if (!kelas) return;
                el.dataset.ksIkon = '1';
                const ikon = document.createElement('i');
                ikon.className = 'fa ' + kelas;
                ikon.setAttribute('aria-hidden', 'true');
                ikon.style.cssText = 'display:inline-block;width:16px;margin-right:6px;text-align:center';
                el.insertBefore(ikon, el.firstChild);
                el.classList.add('ks_aksi_item');
            });
        });
    }

    // ===== Kolom Pelanggan: nomor HP diganti ikon WhatsApp (>1 nomor -> daftar) =====
    const RE_HP = /(?:\+?62[\s-]?|0)8[\d\s.-]{7,16}\d/g;
    const IKON_WA = '<svg viewBox="0 0 24 24" width="20" height="20" style="vertical-align:middle"><path fill="#25D366" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>';

    function nomorWA(mentah) {
        let d = mentah.replace(/\D/g, '');
        if (d.startsWith('0')) d = '62' + d.slice(1);
        else if (d.startsWith('8')) d = '62' + d;
        return d;
    }

    function linkWA(mentah, denganTeks) {
        const a = document.createElement('a');
        a.href = 'https://wa.me/' + nomorWA(mentah);
        a.target = '_blank';
        a.rel = 'noopener';
        a.title = 'Chat WhatsApp ' + mentah;
        a.className = 'ks_wa';
        a.style.cssText = 'text-decoration:none;white-space:nowrap;color:inherit';
        a.innerHTML = IKON_WA;
        if (denganTeks) a.appendChild(document.createTextNode(' ' + mentah));
        return a;
    }

    function telpJadiWA(tabel) {
        // posisi kolom Pelanggan di baris yang SUDAH disisipi kolom buatan skrip (hitung semua th)
        const ths = tabel.querySelectorAll('thead tr:last-child th');
        let ipPenuh = -1;
        for (let i = 0; i < ths.length; i++) if (teksBersih(ths[i]).toLowerCase() === 'pelanggan') { ipPenuh = i; break; }
        if (ipPenuh < 0) return;
        tabel.querySelectorAll('tbody tr').forEach(tr => {
            const td = tr.children[ipPenuh];
            if (!td || td.dataset.ksWa || td.colSpan > 1) return;
            td.dataset.ksWa = '1';
            const nomor = []; // kunci nomor yang sudah dipakai (tanpa duplikat)
            const simpul = [];
            const walker = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) simpul.push(walker.currentNode);
            simpul.forEach(n => {
                // Nomor diganti di tempatnya: "Telp. 0812..." -> "Telp. [ikon] 0812...". "0812.../0856..." = 2 nomor
                // (pola tidak melewati "/" "," ";"); nomor ke-2 dst sebaris, dipisah "/".
                const teks = n.nodeValue;
                const frag = document.createDocumentFragment();
                let akhir = 0, ada = false;
                for (const m of teks.matchAll(RE_HP)) {
                    const k = nomorWA(m[0]);
                    if (k.length < 11 || k.length > 15) continue; // bukan nomor HP
                    ada = true;
                    const sebelum = teks.slice(akhir, m.index);
                    akhir = m.index + m[0].length;
                    if (nomor.includes(k)) { if (sebelum.trim().replace(/[/,;|-]/g, '')) frag.appendChild(document.createTextNode(sebelum)); continue; } // nomor dobel
                    if (nomor.length) { // nomor ke-2 dst: tetap sebaris, dipisah " / " (atau pemisah aslinya)
                        const pisah = sebelum.trim();
                        frag.appendChild(document.createTextNode(' ' + (pisah || '/') + ' '));
                    } else if (sebelum) frag.appendChild(document.createTextNode(sebelum));
                    nomor.push(k);
                    frag.appendChild(linkWA(m[0].trim(), true));
                }
                if (!ada) return;
                const sisa = teks.slice(akhir);
                if (sisa.trim().replace(/[/,;|-]/g, '')) frag.appendChild(document.createTextNode(sisa));
                // link tel:/wa lama yang membungkus teks ini dibuang bungkusnya (diganti link ikon)
                const lama = n.parentElement && n.parentElement.closest('a');
                if (lama && td.contains(lama) && lama.textContent.trim() === teks.trim()) lama.replaceWith(frag);
                else n.replaceWith(frag);
            });
        });
    }

    // Konten Erzap dimuat ulang lewat AJAX (#ajax_target) -> proses ulang kalau tabel berganti
    function terapkanLebarTipe() {
        const w = lebarTipe();
        document.querySelectorAll('td.' + TANDA_TIPE + ', th.' + TANDA_TIPE).forEach(el => {
            el.style.minWidth = w + 'px';
            el.style.width = w + 'px';
            el.style.maxWidth = ''; // th header kelihatan di-set ulang oleh sinkronLebar
        });
        sinkronLebar();
    }
    window.addEventListener('resize', () => { const t = document.querySelector('table#data_table'); if (t) aturFs(t); terapkanLebarTipe(); });
    let timerProses = null;
    function jadwalkanProses() {
        clearTimeout(timerProses);
        timerProses = setTimeout(proses, 50);
    }
    proses();
    new MutationObserver(jadwalkanProses).observe(document.body, { childList: true, subtree: true });
})();

// ===== Halaman detail servis: validasi tombol "Tutup Servis" (#bt_ok) =====
// Dipisah dari bagian daftar di atas dan dibungkus try/catch, supaya error di satu fitur tidak mematikan yang lain.
try {
    (function() {
        'use strict';

        const STATUS_BOLEH = /^(servis selesai|dibatalkan oleh teknisi|dibatalkan oleh pelanggan)$/i;
        const TANDA = 'ts_terkunci';
        const ID_PESAN = 'ts_pesan';

        function bersih(t) { return String(t || '').replace(/\s+/g, ' ').trim(); }

        // Tombol Tutup Servis: <div id="bt_ok" class="button_action" title="Tutup Servis"> berisi overlay #ok (klik) dan #ok_disable (kunci)
        function cariTombol() {
            return document.querySelector('#bt_ok') || document.querySelector('.button_action[title="Tutup Servis"]');
        }

        // Status Servis tiap unit: servis_elektronik_detail1_status_servis, detail2, ...
        function cariStatus() {
            return Array.from(document.querySelectorAll('select[id$="_status_servis"]'));
        }

        // "Disetujui Oleh": cari label bertuliskan itu, ambil select/input di kotak field yang sama
        function cariDisetujui() {
            for (const l of document.querySelectorAll('label')) {
                if (!/^\s*\*?\s*disetujui\s+oleh/i.test(bersih(l.textContent))) continue;
                const wadah = l.closest('.field, .form-group, div') || l.parentElement;
                const ctl = (l.htmlFor && document.getElementById(l.htmlFor)) ||
                            (wadah && wadah.querySelector('select, input:not([type="hidden"]), textarea'));
                if (ctl) return ctl;
            }
            return null;
        }

        function terisi(ctl) {
            if (!ctl) return false;
            if (!bersih(ctl.value)) return false;
            if (ctl.tagName === 'SELECT') {
                const o = ctl.options[ctl.selectedIndex];
                if (!o || !o.value || /^please select/i.test(bersih(o.textContent))) return false;
            }
            return true;
        }

        // null = form belum ada (jangan mengunci apa pun); [] = semua syarat terpenuhi; selain itu daftar alasan
        function alasanTerkunci() {
            const status = cariStatus();
            if (!status.length) return null;
            const alasan = [];
            const statusSalah = status.some(s => {
                const o = s.options[s.selectedIndex];
                return !o || !STATUS_BOLEH.test(bersih(o.textContent));
            });
            if (statusSalah) alasan.push('Status Servis harus Servis Selesai, Dibatalkan oleh Teknisi, atau Dibatalkan oleh Pelanggan');
            const disetujui = cariDisetujui();
            if (disetujui && !terisi(disetujui)) alasan.push('"Disetujui Oleh" harus diisi');
            return alasan;
        }

        // Klik pada tombol terkunci dihentikan di fase capture, sebelum sampai ke #ok (handler bawaan Erzap)
        function blokirKlik(e) {
            if (!e.currentTarget.classList.contains(TANDA)) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            tampilPesanSebentar();
        }

        function kunci(el, alasan) {
            if (!el.dataset.tsPasang) {
                el.addEventListener('click', blokirKlik, true);
                el.addEventListener('mouseenter', () => { if (el.classList.contains(TANDA)) tampilPesan(true); });
                el.addEventListener('mouseleave', () => tampilPesan(false));
                el.dataset.tsPasang = '1';
            }
            if (!el.classList.contains(TANDA)) el.dataset.tsJudulAsli = el.getAttribute('title') || '';
            el.classList.add(TANDA);
            el.title = ''; // tooltip bawaan dimatikan saat terkunci supaya info hanya muncul satu kali (kotak kuning)
            const od = el.querySelector('#ok_disable');
            if (od) { od.style.display = 'block'; od.style.cursor = 'not-allowed'; }
            else { el.style.opacity = '0.45'; el.style.cursor = 'not-allowed'; } // cadangan kalau overlay bawaan tidak ada
            isiPesan(el, alasan);
        }

        function buka(el) {
            if (!el.classList.contains(TANDA)) return; // jangan ganggu overlay "sibuk" milik Erzap kalau bukan kita yang menyalakan
            el.classList.remove(TANDA);
            el.title = el.dataset.tsJudulAsli || 'Tutup Servis';
            const od = el.querySelector('#ok_disable');
            if (od) { od.style.display = 'none'; od.style.cursor = ''; }
            else { el.style.opacity = ''; el.style.cursor = ''; }
            const p = document.getElementById(ID_PESAN);
            if (p) p.remove();
        }

        // Kotak alasan melayang di bawah tombol (absolute di dalam #bt_ok yang position:relative), tidak menggeser layout toolbar
        function isiPesan(tombol, alasan) {
            let p = document.getElementById(ID_PESAN);
            const kunciIsi = alasan.join('|');
            if (p && p.dataset.kunci === kunciIsi && p.parentElement === tombol) return; // isi sama -> jangan bangun ulang (mencegah loop MutationObserver)
            if (!p) {
                p = document.createElement('div');
                p.id = ID_PESAN;
                p.style.cssText = 'display:none;position:absolute;top:100%;left:0;margin-top:6px;z-index:2000;width:300px;padding:8px 10px;border-radius:4px;' +
                    'background:#fff3cd;color:#664d03;border:1px solid #ffe69c;font-size:12px;line-height:1.4;text-align:left;box-shadow:0 2px 8px rgba(0,0,0,.2);cursor:default';
            }
            p.dataset.kunci = kunciIsi;
            p.textContent = '';
            const judul = document.createElement('strong');
            judul.textContent = 'Tutup Servis belum bisa:';
            p.appendChild(judul);
            const ul = document.createElement('ul');
            ul.style.cssText = 'margin:4px 0 0 16px;padding:0';
            alasan.forEach(a => { const li = document.createElement('li'); li.textContent = a; ul.appendChild(li); });
            p.appendChild(ul);
            if (p.parentElement !== tombol) tombol.appendChild(p);
        }

        function tampilPesan(tampil) {
            const p = document.getElementById(ID_PESAN);
            if (p) p.style.display = tampil ? 'block' : 'none';
        }

        let timerPesan = null;
        function tampilPesanSebentar() {
            tampilPesan(true);
            clearTimeout(timerPesan);
            timerPesan = setTimeout(() => tampilPesan(false), 4000);
        }

        let adaPeringatan = false;
        function periksa() {
            const tombol = cariTombol();
            if (!tombol) {
                if (!adaPeringatan && cariStatus().length) { console.warn('[tutupservis] tombol #bt_ok (Tutup Servis) tidak ditemukan di halaman ini'); adaPeringatan = true; }
                return;
            }
            const alasan = alasanTerkunci();
            if (alasan === null) return;
            if (alasan.length) kunci(tombol, alasan); else buka(tombol);
        }

        let timer = null;
        function jadwalkan() { clearTimeout(timer); timer = setTimeout(periksa, 80); }

        document.addEventListener('change', jadwalkan, true);
        document.addEventListener('input', jadwalkan, true);
        new MutationObserver(jadwalkan).observe(document.body, { childList: true, subtree: true });
        setInterval(periksa, 1500); // cadangan: nilai diubah lewat script halaman tanpa event, atau Erzap menyembunyikan overlay kita
        periksa();
    })();
} catch (e) {
    console.error('[kelolaservis] validasi Tutup Servis gagal dipasang:', e);
}

// ===== Halaman Servis Elektronik baru (/servis_elektroniks/new): Rawat Inap default, Quick Servis dimatikan =====
// (dulu smart_repair.js) Dipisah dari bagian lain dan dibungkus try/catch, supaya error di satu fitur tidak mematikan yang lain.
try {
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
} catch (e) {
    console.error('[kelolaservis] Smart Repair (Rawat Inap default) gagal dipasang:', e);
}
