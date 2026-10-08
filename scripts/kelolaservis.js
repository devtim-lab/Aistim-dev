// ==UserScript==
// @name         Erzap - Kolom Outlet di Kelola Servis
// @namespace    http://tampermonkey.net/
// @version      1.0.39
// @description  [v1.0.39] Daftar Kelola Servis: kolom Outlet (kiri Status), Tipe HP (kanan Pelanggan), teknisi di bawah kode servis dari halaman detail servis, nomor HP jadi ikon WhatsApp. Halaman berikutnya lewat paginasi biasa (muat otomatis saat scroll dihapus)
// @author       You
// @match        https://*.erzap.com/servis_elektroniks/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const CACHE_KEY = 'ks_outlet_cache_v6'; // v6: nilai {outlet, tipe, teknisi}; v5 menyimpan teknisi kosong dari pencari yang salah
    const PARALEL = 4;
    const TANDA = 'ks_outlet_td';
    const TANDA_TIPE = 'ks_tipe_td';
    const HP_LAYAR = window.matchMedia('(max-width: 768px)'); // layar HP/tablet kecil
    const lebarTipe = () => HP_LAYAR.matches ? 170 : 240; // lebar kolom Tipe HP (px): sempit di HP, lega di desktop
    // Kolom tambahan: Outlet di kiri Status, Tipe HP di kanan Pelanggan (dicari dari judul header)
    const KOLOM = [
        { kelas: TANDA, judul: 'Outlet', acuan: 'status', setelah: false },
        { kelas: TANDA_TIPE, judul: 'Tipe HP', acuan: 'pelanggan', setelah: true }
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

    async function ambilOutlet(url) {
        if (url in cache) return cache[url];
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const tipe = cariTipe(doc) || '-';
        const teknisi = cariTeknisi(doc);
        const outlet = cariOutlet(doc) || '-';
        if (outlet === '-') {
            const txt = (doc.body ? doc.body.textContent : '').replace(/\s+/g, ' ');
            const cuplikan = [];
            const re = /outlet/ig;
            let m;
            while ((m = re.exec(txt)) && cuplikan.length < 5) cuplikan.push(txt.slice(Math.max(0, m.index - 40), m.index + 80));
            console.warn('[kelolaservis] Outlet tidak ditemukan di', url, '| cuplikan kata "outlet":', cuplikan);
            return { outlet, tipe, teknisi }; // tidak di-cache supaya dicoba lagi saat dimuat ulang
        }
        if (!teknisi) {
            // Teknisi kosong bisa berarti belum ditugaskan -> jangan di-cache, dicek lagi saat dimuat ulang
            const t = (doc.body ? doc.body.textContent : '').replace(/\s+/g, ' ');
            const cuplikan = [];
            const re = /teknisi/ig;
            let m;
            while ((m = re.exec(t)) && cuplikan.length < 4) cuplikan.push(t.slice(Math.max(0, m.index - 30), m.index + 60));
            console.warn('[kelolaservis] Teknisi kosong di', url, '| input teknisi:', doc.querySelectorAll('input[name*="teknisi"]').length, '| cuplikan:', cuplikan);
            return { outlet, tipe, teknisi };
        }
        cache[url] = { outlet, tipe, teknisi };
        simpanCache();
        return cache[url];
    }

    function jalankanAntrian() {
        while (aktif < PARALEL && antrian.length) {
            const { url, td, tdTipe, elTeknisi } = antrian.shift();
            if (!td.isConnected) continue; // baris sudah hilang karena redraw
            aktif++;
            ambilOutlet(url)
                .then(d => {
                    td.textContent = (d.outlet && d.outlet !== '-') ? d.outlet : TEKS_BELUM;
                    tdTipe.textContent = d.tipe || '-';
                    tdTipe.style.whiteSpace = 'pre-line'; // unit kedua dst tampil di bawahnya
                    if (elTeknisi) elTeknisi.textContent = 'Teknisi: ' + (d.teknisi || '-');
                })
                .catch(e => {
                    td.textContent = '?'; td.title = String(e && e.message || e);
                    tdTipe.textContent = '?'; tdTipe.title = td.title;
                    if (elTeknisi) elTeknisi.textContent = 'Teknisi: ?';
                })
                .finally(() => { aktif--; sinkronLebar(); jalankanAntrian(); });
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
            const baris = tabel.querySelector('tbody tr');
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
                .dataTables_scrollBody td, .dataTables_scrollBody th { font-size: 12px; }
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
                        th.className = (kol.kelas + ' ' + ref.className).replace(/\bsorting\w*\b/g, '').trim() + ' sorting_disabled';
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
            td.textContent = '...';
            td.dataset.ks = String(++nomor);
            acuStatus.before(td);
            const tdTipe = document.createElement('td');
            tdTipe.className = TANDA_TIPE;
            tdTipe.style.cssText = 'min-width:' + lebarTipe() + 'px;width:' + lebarTipe() + 'px'; // inline, supaya menang atas lebar kolom bawaan tabel
            tdTipe.textContent = '...';
            if (acuPelanggan) acuPelanggan.after(tdTipe);

            const a = tr.querySelector('a[href*="/servis_elektroniks/kelola_servis/"]');
            if (!a) { td.textContent = TEKS_BELUM; tdTipe.textContent = '-'; return; }
            let url;
            try { url = new URL(a.getAttribute('href'), location.href).href; } catch (e) { td.textContent = TEKS_BELUM; tdTipe.textContent = '-'; return; }
            // Teknisi: di bawah kode servis (di sel yang sama)
            // Link "Edit Penerimaan" / "Proses Servis" juga mengarah ke kelola_servis/ID -> sel kode dicari lewat teks link (SRxxxx-xxxx)
            // Cari sel yang berisi kode servis (SRxxxx-xxxx), tidak peduli link-nya mengarah ke mana; sel buatan skrip dilewati
            const RE_KODE = /[A-Z]{2}\d{3,}-\d+/;
            const selKode = Array.from(tr.children).find(c => !c.className.includes('ks_') && RE_KODE.test(c.textContent));
            let elTeknisi = null;
            if (selKode) {
                elTeknisi = document.createElement('div');
                elTeknisi.className = 'ks_teknisi';
                elTeknisi.style.cssText = 'font-size:12px;color:#555;margin-top:2px';
                elTeknisi.textContent = 'Teknisi: ...';
                selKode.appendChild(elTeknisi);
            }
            antrian.push({ url, td, tdTipe, elTeknisi });
        });
        telpJadiWA(tabel);
        jalankanAntrian();
        sinkronLebar();
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
    window.addEventListener('resize', terapkanLebarTipe);
    let timerProses = null;
    function jadwalkanProses() {
        clearTimeout(timerProses);
        timerProses = setTimeout(proses, 50);
    }
    proses();
    new MutationObserver(jadwalkanProses).observe(document.body, { childList: true, subtree: true });
})();
