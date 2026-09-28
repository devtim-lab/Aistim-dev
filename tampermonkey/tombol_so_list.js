// ==UserScript==
// @name         Tombol Daftar Stok Opnam (Test)
// @namespace    http://tampermonkey.net/
// @version      0.1.0
// @description  Tombol placeholder di halaman Daftar Stok Opnam, belum ada fungsi -- buat uji coba lokasi & tampilan dulu.
// @author       You
// @match        https://*.erzap.com/stok_opnams*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// @require      https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
// ==/UserScript==

(function() {
    'use strict';

    function cariJudul() {
        const heading = document.querySelector('h1');
        return heading && heading.textContent.trim() === 'Daftar Stok Opnam' ? heading : null;
    }

    // Format nilai Erzap: "Rp 135,000.00" (koma = ribuan, titik = desimal),
    // kadang minus di depan atau dibungkus kurung "(Rp 50,000.00)" buat negatif.
    function parseRupiah(teks) {
        if (!teks) return NaN;
        let s = teks.trim();
        const negatifKurung = /^\(.*\)$/.test(s);
        s = s.replace(/[()]/g, '').replace(/Rp\s?/i, '').replace(/,/g, '');
        let n = parseFloat(s);
        if (isNaN(n)) return NaN;
        if (negatifKurung) n = -Math.abs(n);
        return n;
    }

    function formatRupiah(n) {
        const negatif = n < 0;
        const [utuh, desimal] = Math.abs(n).toFixed(2).split('.');
        const denganRibuan = utuh.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return (negatif ? '-' : '') + 'Rp ' + denganRibuan + '.' + desimal;
    }

    // Ekspor isi tabel popup Hasil Koreksi SO ke file .xlsx (lewat SheetJS yang
    // di-load via @require). Nilainya dibaca langsung dari textContent sel tabel
    // saat tombol diklik -- kalau masih "..." (belum selesai fetch) atau "Gagal",
    // itu ikut ditulis apa adanya biar user tau datanya belum lengkap.
    function eksporKeXlsx(baris) {
        if (typeof XLSX === 'undefined') {
            alert('Library XLSX gagal dimuat (butuh koneksi internet). Coba reload halaman lalu ulangi.');
            return;
        }

        const rows = baris
            .filter(({ tr }) => !tr || tr.style.display !== 'none') // ikutkan cuma baris yang lolos filter Gudang
            .map(({ item, tdSKU, tdSebelum, tdSesudah, tdSelisih }) => {
                const sku = parseInt(tdSKU.textContent, 10);
                const sebelum = parseRupiah(tdSebelum.textContent);
                const sesudah = parseRupiah(tdSesudah.textContent);
                const selisih = parseRupiah(tdSelisih.textContent);
                return {
                    'No Formulir': item.noFormulir,
                    'Tanggal': item.tanggal,
                    'Gudang': item.gudang,
                    'Pelaksana SO': item.pelaksanaSO,
                    'Jumlah SKU': isNaN(sku) ? tdSKU.textContent : sku,
                    'Nilai Sebelum': isNaN(sebelum) ? tdSebelum.textContent : sebelum,
                    'Nilai Setelah': isNaN(sesudah) ? tdSesudah.textContent : sesudah,
                    'Selisih': isNaN(selisih) ? tdSelisih.textContent : selisih
                };
            });

        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 30 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Hasil Koreksi SO');

        const namaFile = 'hasil_koreksi_so_' + new Date().toISOString().slice(0, 10) + '.xlsx';
        XLSX.writeFile(wb, namaFile);
    }

    // Susun URL absolut dari href relatif (dipakai buat halaman hasil fetch yang
    // tidak punya location sendiri). null kalau href kosong/bukan origin yang sama.
    function bersihkanUrl(href, base) {
        if (!href || href === '#' || /^javascript:/i.test(href)) return null;
        try {
            const u = new URL(href, base);
            u.hash = '';
            return u.origin === location.origin ? u.href : null;
        } catch (e) { return null; }
    }

    // Link "Berikutnya »" di pagination daftar Stok Opnam. Di halaman terakhir
    // elemennya jadi <span class="...disabled"> (bukan <a>), jadi otomatis null.
    function cariLinkBerikutnyaList(root) {
        const a = root.querySelector('a.pagination_next');
        return a ? a.getAttribute('href') : null;
    }

    // Cari semua link "Hasil Koreksi SO" di root (kolom Formulir), ambil info baris
    // terkait (No Formulir, Tanggal Formulir tampilan & ISO). root bisa dokumen
    // halaman ini atau dokumen hasil fetch (DOMParser) -- makanya href-nya
    // diresolve manual pakai baseUrl, bukan lewat properti a.href yang cuma
    // akurat untuk dokumen live. tanggalISO diambil dari atribut data-order
    // ("2026-09-24 11:19:05 +0700" -> "2026-09-24"), dipakai buat filter rentang.
    function cariHasilKoreksiSO(root, baseUrl) {
        const hasil = [];
        root.querySelectorAll('a').forEach(a => {
            if (a.textContent.trim() !== 'Hasil Koreksi SO') return;
            const tr = a.closest('tr');
            const noFormulir = tr && tr.cells[2] ? tr.cells[2].textContent.trim() : '-';
            const tdTanggal = tr ? tr.cells[3] : null;
            const tanggal = tdTanggal ? tdTanggal.textContent.trim() : '-';
            const tanggalISO = tdTanggal ? (tdTanggal.getAttribute('data-order') || '').slice(0, 10) : '';
            const gudang = tr && tr.cells[6] ? tr.cells[6].textContent.trim() : '-';
            const pelaksanaSO = tr && tr.cells[8] ? tr.cells[8].textContent.trim() : '-';
            let href;
            try { href = new URL(a.getAttribute('href'), baseUrl).href; } catch (e) { return; }
            hasil.push({ noFormulir, tanggal, tanggalISO, gudang, pelaksanaSO, href });
        });
        return hasil;
    }

    // Label buat judul/pesan popup: "2026-09-01 s/d 2026-09-24", "mulai 2026-09-01",
    // "sampai 2026-09-24", atau null kalau dua-duanya kosong.
    function isoKeTampil(iso) {
        if (!iso) return iso;
        const [y, m, d] = iso.split('-');
        return d + '/' + m + '/' + y;
    }

    function labelRentangTanggal(mulai, akhir) {
        if (mulai && akhir) return isoKeTampil(mulai) + ' s/d ' + isoKeTampil(akhir);
        if (mulai) return 'mulai ' + isoKeTampil(mulai);
        if (akhir) return 'sampai ' + isoKeTampil(akhir);
        return null;
    }

    // Telusuri halaman pagination "Daftar Stok Opnam" (ikuti "Berikutnya »") dan
    // kumpulkan "Hasil Koreksi SO" yang tanggalnya ada di rentang [tanggalMulai,
    // tanggalAkhir] (masing-masing opsional, inklusif). Daftar ini terurut
    // terbaru->terlama, jadi kalau tanggalMulai diisi: begitu item TERLAMA di
    // suatu halaman sudah lebih lama dari tanggalMulai, halaman-halaman
    // berikutnya dipastikan lebih lama lagi semua -> penelusuran berhenti di situ
    // (tidak perlu buka semua halaman). Tanpa tanggalMulai, tetap telusuri semua
    // halaman (tidak ada titik henti yang aman).
    // Tidak pernah throw: kalau satu halaman gagal dimuat, berhenti di situ dan
    // kembalikan apa yang sudah terkumpul plus pesan error, biar data yang sudah
    // didapat tetap bisa ditampilkan (bukan semuanya hilang).
    // onProgress(halamanKe) dipanggil tiap pindah halaman; masihAktif() dicek tiap
    // iterasi supaya berhenti sendiri kalau popup-nya sudah ditutup user.
    async function kumpulkanSemuaHasilKoreksiSO(onProgress, masihAktif, tanggalMulai, tanggalAkhir) {
        function dalamRentang(item) {
            if (tanggalMulai && item.tanggalISO && item.tanggalISO < tanggalMulai) return false;
            if (tanggalAkhir && item.tanggalISO && item.tanggalISO > tanggalAkhir) return false;
            return true;
        }
        function masihPerluLanjut(itemHalamanIni) {
            if (!tanggalMulai || !itemHalamanIni.length) return true;
            const terlama = itemHalamanIni[itemHalamanIni.length - 1];
            return !terlama.tanggalISO || terlama.tanggalISO >= tanggalMulai;
        }

        const itemHalaman1 = cariHasilKoreksiSO(document, location.href);
        let hasil = itemHalaman1.filter(dalamRentang);
        let halamanKe = 1;
        let url = masihPerluLanjut(itemHalaman1) ? bersihkanUrl(cariLinkBerikutnyaList(document), location.href) : null;
        const dikunjungi = new Set([bersihkanUrl(location.href, location.href)]);
        let error = null;

        while (url && !dikunjungi.has(url) && dikunjungi.size < 200) {
            if (masihAktif && !masihAktif()) break;
            dikunjungi.add(url);
            halamanKe++;
            if (onProgress) onProgress(halamanKe);
            try {
                const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
                const itemHalamanIni = cariHasilKoreksiSO(doc, url);
                hasil = hasil.concat(itemHalamanIni.filter(dalamRentang));
                url = masihPerluLanjut(itemHalamanIni) ? bersihkanUrl(cariLinkBerikutnyaList(doc), url) : null;
            } catch (e) {
                error = 'Berhenti di halaman ' + halamanKe + ': ' + String(e && e.message || e);
                console.error('[TombolSO] Gagal memuat halaman', halamanKe, e);
                break;
            }
        }

        return { items: hasil, error, halamanTerakhir: halamanKe };
    }

    // Ambil Jumlah SKU & Nilai Persediaan (Sebelum/Setelah Koreksi/Selisih) dari
    // halaman "Dokumen Stok Opnam" (href hasil klik "Hasil Koreksi SO").
    // Dokumen panjang bisa kepecah jadi beberapa <table> (page-break saat cetak),
    // jadi baris data dijumlah dari semua tabel & baris ringkasan dicari di semua
    // tabel juga (kalau berulang, nilai terakhir yang dipakai).
    async function ambilDataDokumen(href) {
        const res = await fetch(href, { credentials: 'same-origin', cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const tables = doc.querySelectorAll('table.no_data_table.table');
        if (!tables.length) throw new Error('Tabel tidak ditemukan');

        let jumlahSKU = 0;
        const nilai = { sebelum: '-', sesudah: '-', selisih: '-' };
        const label = {
            sebelum: 'Nilai Persediaan Sebelum Koreksi',
            sesudah: 'Nilai Persediaan Setelah Koreksi',
            selisih: 'Selisih'
        };

        tables.forEach(table => {
            table.querySelectorAll('tbody tr').forEach(tr => {
                const labelCell = tr.querySelector('td[colspan]');
                if (labelCell) {
                    const cells = tr.querySelectorAll('td');
                    const value = cells.length ? cells[cells.length - 1].textContent.trim() : '-';
                    const teksLabel = labelCell.textContent.trim();
                    if (teksLabel.includes(label.sebelum)) nilai.sebelum = value;
                    else if (teksLabel.includes(label.sesudah)) nilai.sesudah = value;
                    else if (teksLabel.includes(label.selisih)) nilai.selisih = value;
                    return;
                }
                if (!tr.querySelector('th')) jumlahSKU++;
            });
        });

        return { jumlahSKU, ...nilai };
    }

    const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const NAMA_HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

    function formatTanggalTampil(d) {
        const pad = n => String(n).padStart(2, '0');
        return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
    }
    function keISO(d) {
        const pad = n => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    // Widget date-range dua kalender + preset, mirip picker "Pilih Tanggal" yang
    // sudah dipakai di halaman lain Erzap. onTerapkan(mulaiISO|null, akhirISO|null)
    // dipanggil begitu user klik Terapkan (mulaiISO/akhirISO format "YYYY-MM-DD").
    function buatDateRangePicker(onTerapkan) {
        let rangeMulai = null;
        let rangeAkhir = null;
        let klikBerikutnyaMulai = true; // klik pertama set Mulai, klik kedua set Akhir
        const hariIni = new Date();
        hariIni.setHours(0, 0, 0, 0);
        let bulanDasar = new Date(hariIni.getFullYear(), hariIni.getMonth(), 1);

        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;';

        const tombolSummary = document.createElement('button');
        tombolSummary.type = 'button';
        tombolSummary.style.cssText = 'width:100%;text-align:left;padding:10px 12px;font-size:14px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;color:#333;';
        const labelSummary = document.createElement('span');
        const panahSummary = document.createElement('span');
        panahSummary.textContent = '▾';
        panahSummary.style.color = '#999';
        tombolSummary.appendChild(labelSummary);
        tombolSummary.appendChild(panahSummary);

        function perbaruiSummary() {
            if (rangeMulai && rangeAkhir) labelSummary.textContent = 'Pilih Tanggal: ' + formatTanggalTampil(rangeMulai) + ' - ' + formatTanggalTampil(rangeAkhir);
            else if (rangeMulai) labelSummary.textContent = 'Pilih Tanggal: mulai ' + formatTanggalTampil(rangeMulai);
            else if (rangeAkhir) labelSummary.textContent = 'Pilih Tanggal: sampai ' + formatTanggalTampil(rangeAkhir);
            else labelSummary.textContent = 'Pilih Tanggal: Semua Data';
        }
        perbaruiSummary();

        const panel = document.createElement('div');
        panel.style.cssText = 'display:none;position:absolute;top:100%;left:0;margin-top:4px;background:#fff;border:1px solid #ddd;border-radius:6px;box-shadow:0 6px 20px rgba(220,53,69,.3);z-index:10;max-width:calc(100vw - 64px);max-height:70vh;overflow:auto;';

        const isiPanel = document.createElement('div');
        isiPanel.style.cssText = 'display:flex;flex-wrap:wrap;';

        const sidebar = document.createElement('div');
        sidebar.style.cssText = 'border-right:1px solid #eee;padding:10px;display:flex;flex-direction:column;gap:2px;min-width:140px;';

        function buatPreset(teks, fn) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = teks;
            btn.style.cssText = 'text-align:left;padding:8px 10px;font-size:13px;border:none;background:none;border-radius:4px;cursor:pointer;color:#333;white-space:nowrap;';
            btn.addEventListener('mouseenter', () => { btn.style.background = '#fdecea'; });
            btn.addEventListener('mouseleave', () => { btn.style.background = 'none'; });
            btn.addEventListener('click', () => {
                const r = fn();
                rangeMulai = r ? r[0] : null;
                rangeAkhir = r ? r[1] : null;
                klikBerikutnyaMulai = true;
                if (rangeMulai) bulanDasar = new Date(rangeMulai.getFullYear(), rangeMulai.getMonth(), 1);
                perbaruiSummary();
                renderKalender();
            });
            return btn;
        }

        sidebar.appendChild(buatPreset('Minggu Ini', () => {
            const awal = new Date(hariIni);
            awal.setDate(awal.getDate() - awal.getDay());
            return [awal, hariIni];
        }));
        sidebar.appendChild(buatPreset('Bulan Ini', () => [new Date(hariIni.getFullYear(), hariIni.getMonth(), 1), hariIni]));
        sidebar.appendChild(buatPreset('3 Bulan Terakhir', () => [new Date(hariIni.getFullYear(), hariIni.getMonth() - 3, hariIni.getDate()), hariIni]));
        sidebar.appendChild(buatPreset('Semua Data', () => null));
        isiPanel.appendChild(sidebar);

        const navWrap = document.createElement('div');
        navWrap.style.cssText = 'display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:center;gap:16px;padding:12px;';

        const btnPrev = document.createElement('button');
        btnPrev.type = 'button';
        btnPrev.textContent = '‹';
        btnPrev.style.cssText = 'border:none;background:none;font-size:18px;cursor:pointer;color:#dc3545;padding:0 4px;';
        btnPrev.addEventListener('click', () => {
            bulanDasar = new Date(bulanDasar.getFullYear(), bulanDasar.getMonth() - 1, 1);
            renderKalender();
        });

        const kalenderKiri = document.createElement('div');
        const kalenderKanan = document.createElement('div');

        const btnNext = document.createElement('button');
        btnNext.type = 'button';
        btnNext.textContent = '›';
        btnNext.style.cssText = 'border:none;background:none;font-size:18px;cursor:pointer;color:#dc3545;padding:0 4px;';
        btnNext.addEventListener('click', () => {
            bulanDasar = new Date(bulanDasar.getFullYear(), bulanDasar.getMonth() + 1, 1);
            renderKalender();
        });

        navWrap.appendChild(btnPrev);
        navWrap.appendChild(kalenderKiri);
        navWrap.appendChild(kalenderKanan);
        navWrap.appendChild(btnNext);
        isiPanel.appendChild(navWrap);

        function pilihTanggal(d) {
            if (klikBerikutnyaMulai || !rangeMulai) {
                rangeMulai = d;
                rangeAkhir = null;
                klikBerikutnyaMulai = false;
            } else if (d.getTime() < rangeMulai.getTime()) {
                rangeAkhir = rangeMulai;
                rangeMulai = d;
                klikBerikutnyaMulai = true;
            } else {
                rangeAkhir = d;
                klikBerikutnyaMulai = true;
            }
            perbaruiSummary();
            renderKalender();
        }

        function renderBulanTunggal(container, tahun, bulan) {
            container.innerHTML = '';
            const judulBulan = document.createElement('div');
            judulBulan.style.cssText = 'text-align:center;font-weight:bold;font-size:13px;color:#333;margin-bottom:8px;';
            judulBulan.textContent = NAMA_BULAN[bulan] + ' ' + tahun;
            container.appendChild(judulBulan);

            const tabel = document.createElement('table');
            tabel.style.cssText = 'border-collapse:collapse;font-size:12px;';
            const thead = document.createElement('thead');
            const trHead = document.createElement('tr');
            NAMA_HARI.forEach(h => {
                const th = document.createElement('th');
                th.textContent = h;
                th.style.cssText = 'padding:4px 6px;color:#999;font-weight:normal;';
                trHead.appendChild(th);
            });
            thead.appendChild(trHead);
            tabel.appendChild(thead);

            const tbody = document.createElement('tbody');
            const offsetAwal = new Date(tahun, bulan, 1).getDay();
            const jumlahHari = new Date(tahun, bulan + 1, 0).getDate();

            let tanggal = 1 - offsetAwal;
            for (let minggu = 0; minggu < 6 && tanggal <= jumlahHari; minggu++) {
                const tr = document.createElement('tr');
                for (let h = 0; h < 7; h++, tanggal++) {
                    const td = document.createElement('td');
                    td.style.cssText = 'padding:1px;text-align:center;';
                    if (tanggal < 1 || tanggal > jumlahHari) {
                        td.innerHTML = '&nbsp;';
                    } else {
                        const dCell = new Date(tahun, bulan, tanggal);
                        const waktu = dCell.getTime();
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.textContent = String(tanggal);
                        btn.style.cssText = 'width:28px;height:28px;border:none;background:none;cursor:pointer;border-radius:4px;font-size:12px;color:#333;';

                        const dalamRange = rangeMulai && rangeAkhir && waktu >= rangeMulai.getTime() && waktu <= rangeAkhir.getTime();
                        const batasAwal = rangeMulai && waktu === rangeMulai.getTime();
                        const batasAkhir = rangeAkhir && waktu === rangeAkhir.getTime();

                        if (batasAwal || batasAkhir) {
                            btn.style.background = '#dc3545';
                            btn.style.color = '#fff';
                            btn.style.fontWeight = 'bold';
                        } else if (dalamRange) {
                            btn.style.background = '#fdecea';
                        }
                        if (waktu === hariIni.getTime() && !batasAwal && !batasAkhir) {
                            btn.style.border = '1px solid #dc3545';
                        }

                        btn.addEventListener('click', () => pilihTanggal(dCell));
                        td.appendChild(btn);
                    }
                    tr.appendChild(td);
                }
                tbody.appendChild(tr);
            }
            tabel.appendChild(tbody);
            container.appendChild(tabel);
        }

        function renderKalender() {
            renderBulanTunggal(kalenderKiri, bulanDasar.getFullYear(), bulanDasar.getMonth());
            const bulanKanan = new Date(bulanDasar.getFullYear(), bulanDasar.getMonth() + 1, 1);
            renderBulanTunggal(kalenderKanan, bulanKanan.getFullYear(), bulanKanan.getMonth());
        }
        renderKalender();

        const footer = document.createElement('div');
        footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding:10px 12px;border-top:1px solid #eee;';

        const btnBatal = document.createElement('button');
        btnBatal.type = 'button';
        btnBatal.textContent = 'Batal';
        btnBatal.style.cssText = 'padding:6px 16px;font-size:13px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;color:#333;';
        btnBatal.addEventListener('click', () => { panel.style.display = 'none'; });

        const btnTerapkan = document.createElement('button');
        btnTerapkan.type = 'button';
        btnTerapkan.textContent = 'Terapkan';
        btnTerapkan.style.cssText = 'padding:6px 16px;font-size:13px;font-weight:bold;border:none;background:#dc3545;color:#fff;border-radius:4px;cursor:pointer;';
        btnTerapkan.addEventListener('click', () => {
            panel.style.display = 'none';
            onTerapkan(rangeMulai ? keISO(rangeMulai) : null, rangeAkhir ? keISO(rangeAkhir) : null);
        });

        footer.appendChild(btnBatal);
        footer.appendChild(btnTerapkan);

        panel.appendChild(isiPanel);
        panel.appendChild(footer);

        tombolSummary.addEventListener('click', e => {
            e.stopPropagation();
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });
        // Sengaja TIDAK ditutup otomatis kalau klik di luar panel -- panel cuma
        // tertutup lewat tombol Terapkan/Batal, atau klik ulang tombol ringkasannya.

        wrap.appendChild(tombolSummary);
        wrap.appendChild(panel);
        return wrap;
    }

    // Dropdown searchable buat filter Gudang: tombol ringkasan + panel berisi
    // kotak cari & daftar opsi yang ter-filter saat mengetik. opsi: array
    // {value, label, jumlah}. onPilih(value) dipanggil begitu satu opsi diklik
    // (value === '' berarti "Semua Gudang").
    function buatFilterGudang(opsi, totalSemua, onPilih) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;';

        const tombolSummary = document.createElement('button');
        tombolSummary.type = 'button';
        tombolSummary.style.cssText = 'padding:6px 10px;font-size:13px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;display:flex;align-items:center;gap:8px;color:#333;min-width:220px;justify-content:space-between;';
        const labelSummary = document.createElement('span');
        labelSummary.textContent = 'Semua Gudang (' + totalSemua + ')';
        const panahSummary = document.createElement('span');
        panahSummary.textContent = '▾';
        panahSummary.style.color = '#999';
        tombolSummary.appendChild(labelSummary);
        tombolSummary.appendChild(panahSummary);

        const panel = document.createElement('div');
        panel.style.cssText = 'display:none;position:absolute;top:100%;left:0;margin-top:4px;background:#fff;border:1px solid #ddd;border-radius:6px;box-shadow:0 6px 20px rgba(220,53,69,.3);z-index:10;width:280px;max-width:calc(100vw - 64px);max-height:320px;flex-direction:column;';

        const inputCari = document.createElement('input');
        inputCari.type = 'text';
        inputCari.placeholder = 'Cari gudang...';
        inputCari.style.cssText = 'margin:8px;padding:8px 10px;font-size:13px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;';

        const daftarWrap = document.createElement('div');
        daftarWrap.style.cssText = 'overflow-y:auto;flex:1 1 auto;';

        function buatOpsiEl(teks, value, jumlah) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = teks + (jumlah !== undefined ? ' (' + jumlah + ')' : '');
            btn.style.cssText = 'display:block;width:100%;text-align:left;padding:8px 12px;font-size:13px;border:none;background:none;cursor:pointer;color:#333;';
            btn.addEventListener('mouseenter', () => { btn.style.background = '#fdecea'; });
            btn.addEventListener('mouseleave', () => { btn.style.background = 'none'; });
            btn.addEventListener('click', () => {
                labelSummary.textContent = value ? (teks + ' (' + jumlah + ')') : ('Semua Gudang (' + totalSemua + ')');
                panel.style.display = 'none';
                onPilih(value);
            });
            return btn;
        }

        function renderDaftar(kataKunci) {
            daftarWrap.innerHTML = '';
            const kk = (kataKunci || '').trim().toLowerCase();
            if (!kk) daftarWrap.appendChild(buatOpsiEl('Semua Gudang', '', undefined));
            const cocok = opsi.filter(o => o.label.toLowerCase().includes(kk));
            cocok.forEach(o => daftarWrap.appendChild(buatOpsiEl(o.label, o.value, o.jumlah)));
            if (kk && cocok.length === 0) {
                const kosong = document.createElement('div');
                kosong.textContent = 'Tidak ditemukan';
                kosong.style.cssText = 'padding:8px 12px;font-size:13px;color:#999;text-align:center;';
                daftarWrap.appendChild(kosong);
            }
        }
        renderDaftar('');
        inputCari.addEventListener('input', () => renderDaftar(inputCari.value));

        tombolSummary.addEventListener('click', e => {
            e.stopPropagation();
            const buka = panel.style.display === 'none';
            panel.style.display = buka ? 'flex' : 'none';
            if (buka) { inputCari.value = ''; renderDaftar(''); inputCari.focus(); }
        });
        // Beda dengan date-range picker: di sini klik satu opsi langsung
        // menerapkan filter (tidak ada tombol Terapkan terpisah), jadi wajar
        // kalau klik di luar panel juga menutupnya.
        document.addEventListener('click', e => {
            if (!wrap.contains(e.target)) panel.style.display = 'none';
        });

        panel.appendChild(inputCari);
        panel.appendChild(daftarWrap);
        wrap.appendChild(tombolSummary);
        wrap.appendChild(panel);
        return wrap;
    }

    // Buka dokumen "Hasil Koreksi SO" di popup dalam halaman (iframe) alih-alih
    // tab baru, biar user tidak perlu pindah-pindah tab pas ngecek banyak SO.
    function bukaDokumenPopup(href) {
        const overlayDoc = document.createElement('div');
        overlayDoc.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100000;display:flex;justify-content:center;align-items:center;padding:16px;box-sizing:border-box;';
        overlayDoc.addEventListener('click', e => { if (e.target === overlayDoc) overlayDoc.remove(); });

        const boxDoc = document.createElement('div');
        boxDoc.style.cssText = 'background:#fff;border-radius:8px;box-shadow:0 4px 20px rgba(220,53,69,.4);width:min(1000px,calc(100vw - 32px));height:min(800px,calc(100vh - 32px));display:flex;flex-direction:column;overflow:hidden;';

        const headerDoc = document.createElement('div');
        headerDoc.style.cssText = 'display:flex;justify-content:flex-end;padding:8px;border-bottom:1px solid #eee;flex:0 0 auto;';
        const btnTutupDoc = document.createElement('button');
        btnTutupDoc.type = 'button';
        btnTutupDoc.textContent = 'Tutup';
        btnTutupDoc.style.cssText = 'padding:6px 16px;font-size:13px;font-weight:bold;background:#dc3545;color:#fff;border:none;border-radius:4px;cursor:pointer;';
        btnTutupDoc.addEventListener('click', () => overlayDoc.remove());
        headerDoc.appendChild(btnTutupDoc);

        const iframe = document.createElement('iframe');
        iframe.src = href;
        iframe.style.cssText = 'flex:1 1 auto;border:none;width:100%;';

        boxDoc.appendChild(headerDoc);
        boxDoc.appendChild(iframe);
        overlayDoc.appendChild(boxDoc);
        document.body.appendChild(overlayDoc);
    }

    function tampilkanPopupHasilKoreksi() {
        const lama = document.getElementById('popupHasilKoreksiSO');
        if (lama) lama.remove();

        const overlay = document.createElement('div');
        overlay.id = 'popupHasilKoreksiSO';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;justify-content:center;align-items:center;padding:16px;box-sizing:border-box;';
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

        const box = document.createElement('div');
        box.style.cssText = 'background:#fff;border-radius:8px;box-shadow:0 4px 20px rgba(220,53,69,.4);width:min(1200px,calc(100vw - 32px));max-height:90vh;display:flex;flex-direction:column;padding:20px;box-sizing:border-box;';

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        const judul = document.createElement('p');
        judul.style.cssText = 'font-size:16px;font-weight:bold;color:#333;margin:0 0 12px;text-align:center;';
        judul.textContent = 'Hasil Koreksi SO';
        box.appendChild(judul);

        // --- Form rentang tanggal (opsional) sebelum mulai menelusuri halaman ---
        // Ditempel LANGSUNG ke box (bukan ke listWrap di bawah), karena listWrap
        // overflow:auto akan meng-clip panel dropdown date-range picker kalau
        // panelnya lebih tinggi dari area listWrap yang masih kosong.
        const form = document.createElement('div');
        form.style.cssText = 'margin-bottom:16px;';

        const picker = buatDateRangePicker(function(mulai, akhir) {
            form.remove();
            muatDanTampilkanHasilKoreksi(overlay, box, judul, listWrap, tombolBawah, tutup, mulai, akhir);
        });

        const hint = document.createElement('p');
        hint.style.cssText = 'font-size:12px;color:#999;text-align:center;margin:8px 0 0;';
        hint.textContent = 'Pilih preset atau tanggal di kalender lalu klik Terapkan. "Semua Data" / tanpa Tanggal Mulai menelusuri semua halaman; mengisi Tanggal Mulai bikin prosesnya lebih cepat karena berhenti otomatis begitu ketemu data yang lebih lama.';

        form.appendChild(picker);
        form.appendChild(hint);
        box.appendChild(form);

        const listWrap = document.createElement('div');
        listWrap.style.cssText = 'overflow:auto;flex:1 1 auto;margin-bottom:16px;';
        box.appendChild(listWrap);

        const tombolBawah = document.createElement('div');
        tombolBawah.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center;';
        const tutup = document.createElement('button');
        tutup.type = 'button';
        tutup.textContent = 'Tutup';
        tutup.style.cssText = 'padding:8px 25px;font-size:14px;background:#dc3545;color:#fff;border:none;border-radius:4px;cursor:pointer;box-shadow:0 2px 6px rgba(220,53,69,.5);';
        tutup.addEventListener('click', () => overlay.remove());
        tombolBawah.appendChild(tutup);
        box.appendChild(tombolBawah);
    }

    async function muatDanTampilkanHasilKoreksi(overlay, box, judul, listWrap, tombolBawah, tutup, tanggalMulai, tanggalAkhir) {
        const status = document.createElement('p');
        status.style.cssText = 'text-align:center;color:#777;font-size:14px;';
        status.textContent = 'Memuat halaman 1...';
        listWrap.appendChild(status);

        // Telusuri halaman pagination dulu (bisa makan waktu kalau datanya banyak
        // halaman & tidak ada Tanggal Mulai yang membatasi) sebelum tabel & fetch
        // detail per-SO dimulai.
        const { items: data, error, halamanTerakhir } = await kumpulkanSemuaHasilKoreksiSO(
            halamanKe => { if (document.body.contains(overlay)) status.textContent = 'Memuat halaman ' + halamanKe + '...'; },
            () => document.body.contains(overlay),
            tanggalMulai, tanggalAkhir
        );

        if (!document.body.contains(overlay)) return; // popup ditutup selagi menelusuri halaman

        // Urutkan terbaru -> terlama. Biasanya sudah begitu dari sumbernya, tapi
        // diurutkan ulang di sini biar pasti benar walau datanya digabung dari
        // beberapa halaman fetch terpisah.
        data.sort((a, b) => (b.tanggalISO || '').localeCompare(a.tanggalISO || ''));

        const labelTanggal = labelRentangTanggal(tanggalMulai, tanggalAkhir);
        judul.textContent = 'Hasil Koreksi SO' + (labelTanggal ? ' - ' + labelTanggal : '') +
            ' (' + data.length + ')' + (halamanTerakhir > 1 ? ' dari ' + halamanTerakhir + ' halaman' : '');

        if (error) {
            const peringatan = document.createElement('p');
            peringatan.style.cssText = 'text-align:center;color:#dc3545;font-size:12px;margin:0 0 8px;';
            peringatan.textContent = error + ' -- data di bawah cuma sampai halaman itu.';
            listWrap.insertBefore(peringatan, status);
        }

        let baris = [];

        if (data.length === 0) {
            status.textContent = 'Tidak ada link "Hasil Koreksi SO" ditemukan.';
        } else {
            status.remove();

            // Filter Gudang: opsi baru diketahui setelah data selesai dimuat
            // (daftar Gudang unik diambil dari hasil, bukan ditentukan di depan).
            const filterBar = document.createElement('div');
            filterBar.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;';
            const labelGudang = document.createElement('label');
            labelGudang.textContent = 'Gudang:';
            labelGudang.style.cssText = 'font-size:13px;font-weight:bold;color:#333;';

            const opsiGudang = Array.from(new Set(data.map(item => item.gudang))).sort().map(g => ({
                value: g,
                label: g,
                jumlah: data.filter(item => item.gudang === g).length
            }));

            const filterGudang = buatFilterGudang(opsiGudang, data.length, function(gudangDipilih) {
                baris.forEach(({ item, tr }) => {
                    tr.style.display = (!gudangDipilih || item.gudang === gudangDipilih) ? '' : 'none';
                });
                hitungTotal();
            });

            filterBar.appendChild(labelGudang);
            filterBar.appendChild(filterGudang);
            // Ditempel ke box, BUKAN ke listWrap, supaya filter ini tidak ikut
            // ke-scroll bareng isi tabel (listWrap yang overflow:auto).
            box.insertBefore(filterBar, listWrap);

            const table = document.createElement('table');
            // border-collapse:separate (bukan collapse) supaya border di sel sticky
            // (header & baris Total) tidak hilang/putus pas di-scroll horizontal --
            // border-collapse:collapse punya bug rendering di kombinasi dgn sticky.
            table.style.cssText = 'width:100%;border-collapse:separate;border-spacing:0;font-size:13px;white-space:nowrap;';
            const thStyle = 'padding:6px 8px;border:1px solid #dee2e6;background:#f8f9fa;position:sticky;top:0;z-index:1;';
            table.innerHTML = `<thead>
                <tr style="border-bottom:2px solid #dee2e6;">
                    <th style="${thStyle}text-align:left;">No Formulir</th>
                    <th style="${thStyle}text-align:left;">Tanggal</th>
                    <th style="${thStyle}text-align:left;white-space:normal;min-width:160px;max-width:240px;">Gudang</th>
                    <th style="${thStyle}text-align:left;white-space:normal;min-width:180px;max-width:280px;">Pelaksana SO</th>
                    <th style="${thStyle}text-align:right;">Jumlah SKU</th>
                    <th style="${thStyle}text-align:right;">Nilai Sebelum</th>
                    <th style="${thStyle}text-align:right;">Nilai Setelah</th>
                    <th style="${thStyle}text-align:right;">Selisih</th>
                    <th style="${thStyle}"></th>
                </tr>
            </thead>`;
            const tbody = document.createElement('tbody');
            baris = data.map(item => {
                const tr = document.createElement('tr');

                const tdNo = document.createElement('td');
                tdNo.style.cssText = 'padding:6px 8px;border:1px solid #dee2e6;';
                tdNo.textContent = item.noFormulir;

                const tdTgl = document.createElement('td');
                tdTgl.style.cssText = 'padding:6px 8px;border:1px solid #dee2e6;';
                tdTgl.textContent = item.tanggal;

                const tdGudang = document.createElement('td');
                tdGudang.style.cssText = 'padding:6px 8px;border:1px solid #dee2e6;white-space:normal;word-break:break-word;min-width:160px;max-width:240px;';
                tdGudang.textContent = item.gudang;

                const tdPelaksana = document.createElement('td');
                tdPelaksana.style.cssText = 'padding:6px 8px;border:1px solid #dee2e6;white-space:normal;word-break:break-word;min-width:180px;max-width:280px;';
                tdPelaksana.textContent = item.pelaksanaSO;

                const tdSKU = document.createElement('td');
                tdSKU.style.cssText = 'padding:6px 8px;border:1px solid #dee2e6;text-align:right;color:#999;';
                tdSKU.textContent = '...';

                const tdSebelum = document.createElement('td');
                tdSebelum.style.cssText = 'padding:6px 8px;border:1px solid #dee2e6;text-align:right;color:#999;';
                tdSebelum.textContent = '...';

                const tdSesudah = document.createElement('td');
                tdSesudah.style.cssText = 'padding:6px 8px;border:1px solid #dee2e6;text-align:right;color:#999;';
                tdSesudah.textContent = '...';

                const tdSelisih = document.createElement('td');
                tdSelisih.style.cssText = 'padding:6px 8px;border:1px solid #dee2e6;text-align:right;color:#999;';
                tdSelisih.textContent = '...';

                const tdLink = document.createElement('td');
                tdLink.style.cssText = 'padding:6px 8px;border:1px solid #dee2e6;text-align:center;';
                const btnBukaDok = document.createElement('button');
                btnBukaDok.type = 'button';
                btnBukaDok.textContent = 'Buka';
                btnBukaDok.style.cssText = 'color:#fff;background:#dc3545;border:none;padding:4px 12px;border-radius:4px;font-weight:bold;font-size:12px;cursor:pointer;';
                btnBukaDok.addEventListener('click', () => bukaDokumenPopup(item.href));
                tdLink.appendChild(btnBukaDok);

                tr.appendChild(tdNo);
                tr.appendChild(tdTgl);
                tr.appendChild(tdGudang);
                tr.appendChild(tdPelaksana);
                tr.appendChild(tdSKU);
                tr.appendChild(tdSebelum);
                tr.appendChild(tdSesudah);
                tr.appendChild(tdSelisih);
                tr.appendChild(tdLink);
                tbody.appendChild(tr);

                return { item, tr, tdSKU, tdSebelum, tdSesudah, tdSelisih };
            });
            table.appendChild(tbody);
            // Baris Total di bagian bawah tabel (tfoot, nempel di bawah kalau di-scroll,
            // sama seperti header yang nempel di atas).
            const tfStyle = 'padding:6px 8px;border:1px solid #dee2e6;background:#eef2f5;position:sticky;bottom:0;';
            const tfoot = document.createElement('tfoot');
            tfoot.innerHTML = `<tr style="font-weight:bold;">
                <td colspan="4" style="${tfStyle}text-align:right;">Total</td>
                <td id="totalSKU" style="${tfStyle}text-align:right;color:#999;">...</td>
                <td id="totalSebelum" style="${tfStyle}text-align:right;color:#999;">...</td>
                <td id="totalSesudah" style="${tfStyle}text-align:right;color:#999;">...</td>
                <td id="totalSelisih" style="${tfStyle}text-align:right;color:#999;">...</td>
                <td style="${tfStyle}"></td>
            </tr>`;
            table.appendChild(tfoot);
            listWrap.appendChild(table);

            const tdTotalSKU = tfoot.querySelector('#totalSKU');
            const tdTotalSebelum = tfoot.querySelector('#totalSebelum');
            const tdTotalSesudah = tfoot.querySelector('#totalSesudah');
            const tdTotalSelisih = tfoot.querySelector('#totalSelisih');

            // Dihitung ulang dari nol setiap dipanggil (bukan akumulasi berjalan),
            // dan cuma dari baris yang sedang TAMPIL (tr.style.display !== 'none')
            // -- supaya totalnya ikut menyesuaikan begitu filter Gudang diganti,
            // baik untuk baris yang datanya sudah selesai atau masih "..." di-fetch.
            function hitungTotal() {
                let totalSKU = 0, totalSebelum = 0, totalSesudah = 0, totalSelisih = 0;
                let adaGagal = false, adaTampil = false;

                baris.forEach(({ tr, tdSKU, tdSebelum, tdSesudah, tdSelisih }) => {
                    if (tr.style.display === 'none') return;
                    adaTampil = true;
                    if (tdSKU.textContent === 'Gagal') { adaGagal = true; return; }

                    const sku = parseInt(tdSKU.textContent, 10);
                    const sebelum = parseRupiah(tdSebelum.textContent);
                    const sesudah = parseRupiah(tdSesudah.textContent);
                    const selisih = parseRupiah(tdSelisih.textContent);
                    if (!isNaN(sku)) totalSKU += sku;
                    if (!isNaN(sebelum)) totalSebelum += sebelum;
                    if (!isNaN(sesudah)) totalSesudah += sesudah;
                    if (!isNaN(selisih)) totalSelisih += selisih;
                });

                if (!adaTampil) {
                    [tdTotalSKU, tdTotalSebelum, tdTotalSesudah, tdTotalSelisih].forEach(td => {
                        td.textContent = '-';
                        td.style.color = '#999';
                    });
                    return;
                }

                const warna = adaGagal ? '#dc3545' : '#333';
                tdTotalSKU.textContent = totalSKU;
                tdTotalSebelum.textContent = formatRupiah(totalSebelum);
                tdTotalSesudah.textContent = formatRupiah(totalSesudah);
                tdTotalSelisih.textContent = formatRupiah(totalSelisih) + (adaGagal ? ' *' : '');
                [tdTotalSKU, tdTotalSebelum, tdTotalSesudah, tdTotalSelisih].forEach(td => td.style.color = warna);
                tdTotalSelisih.title = adaGagal ? 'Sebagian data gagal diambil, total belum lengkap' : '';
            }

            // Fetch data tiap dokumen satu-satu (bukan paralel) supaya tidak
            // membanjiri server dengan banyak request sekaligus. Total dihitung
            // ulang tiap satu baris selesai (lihat hitungTotal di atas).
            (async () => {
                for (const { item, tdSKU, tdSebelum, tdSesudah, tdSelisih } of baris) {
                    if (!document.body.contains(overlay)) return; // popup sudah ditutup
                    try {
                        const d = await ambilDataDokumen(item.href);
                        tdSKU.textContent = d.jumlahSKU;
                        tdSebelum.textContent = d.sebelum;
                        tdSesudah.textContent = d.sesudah;
                        tdSelisih.textContent = d.selisih;
                        [tdSKU, tdSebelum, tdSesudah, tdSelisih].forEach(td => td.style.color = '#333');
                    } catch (e) {
                        [tdSKU, tdSebelum, tdSesudah, tdSelisih].forEach(td => {
                            td.textContent = 'Gagal';
                            td.style.color = '#dc3545';
                        });
                        console.error('[TombolSO] Gagal ambil data', item.href, e);
                    }
                    hitungTotal();
                }
            })();

            const btnXlsx = document.createElement('button');
            btnXlsx.type = 'button';
            btnXlsx.textContent = 'Simpan ke XLSX';
            btnXlsx.style.cssText = 'padding:8px 20px;font-size:12px;font-weight:bold;color:#fff;background:#28a745;border:none;border-radius:4px;cursor:pointer;box-shadow:0 2px 6px rgba(40,167,69,.5);';
            btnXlsx.addEventListener('click', () => eksporKeXlsx(baris));
            tombolBawah.insertBefore(btnXlsx, tutup);
        }
    }

    function pasangTombol() {
        if (document.getElementById('btnHasilKoreksiSO')) return;

        const judul = cariJudul();
        if (!judul) return;

        const btn = document.createElement('button');
        btn.id = 'btnHasilKoreksiSO';
        btn.type = 'button';
        btn.textContent = 'Hasil Koreksi SO';
        btn.style.cssText = `
            margin-left: 12px;
            padding: 6px 16px;
            font-size: 14px;
            font-weight: bold;
            color: #fff;
            background: #dc3545;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            vertical-align: middle;
            box-shadow: 0 2px 6px rgba(220,53,69,.5);
        `;

        btn.addEventListener('click', tampilkanPopupHasilKoreksi);

        judul.appendChild(btn);
    }

    pasangTombol();

    const observer = new MutationObserver(pasangTombol);
    observer.observe(document.body, { childList: true, subtree: true });
})();
