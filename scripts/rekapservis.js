// ==UserScript==
// @name         Erzap - Rekap Kelola Servis per Penerima
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  [v1.0.0] Tombol "Rekap Penerima" di kiri badge Diterima (Daftar Kelola Servis): baca semua halaman, kelompokkan per Penerima Servis + jumlah per status, klik baris untuk lihat detail servisnya
// @author       You
// @match        https://*.erzap.com/servis_elektroniks/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const MAKS_HALAMAN = 300;
    let prosesJalan = false;
    let dibatalkan = false;

    // ===== CSS (prefix rs_) + responsif mobile =====
    function pasangStyle() {
        if (document.getElementById('rs_style')) return;
        const st = document.createElement('style');
        st.id = 'rs_style';
        st.textContent = `
            #rs_btn { cursor: pointer; background: #369BD7; color: #fff; margin-right: 4px; }
            #rs_btn.rs_jalan { background: #6c757d; cursor: progress; }
            .rs_overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 99999;
                display: flex; justify-content: center; align-items: center; padding: 16px; box-sizing: border-box; }
            .rs_box { background: #fff; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,.3);
                width: min(900px, 100%); max-height: 90vh; display: flex; flex-direction: column;
                padding: 18px 20px; box-sizing: border-box; font-size: 13px; color: #333; }
            .rs_box h3 { margin: 0 0 4px; font-size: 17px; }
            .rs_info { color: #666; margin: 0 0 12px; }
            .rs_info.rs_err { color: #dc3545; }
            .rs_scroll { overflow: auto; flex: 1 1 auto; border: 1px solid #dee2e6; border-radius: 4px; }
            .rs_tbl { width: 100%; border-collapse: collapse; }
            .rs_tbl th, .rs_tbl td { padding: 7px 10px; border-bottom: 1px solid #eee; text-align: left; white-space: nowrap; }
            .rs_tbl th { position: sticky; top: 0; background: #f8f9fa; border-bottom: 2px solid #dee2e6; z-index: 1; }
            .rs_tbl td.rs_num, .rs_tbl th.rs_num { text-align: right; }
            .rs_tbl tr.rs_grup { cursor: pointer; }
            .rs_tbl tr.rs_grup:hover { background: #f1f8fd; }
            .rs_tbl tr.rs_grup td:nth-child(2) { white-space: normal; font-weight: bold; }
            .rs_tbl tr.rs_total td { font-weight: bold; background: #f8f9fa; border-top: 2px solid #dee2e6; }
            .rs_tbl tr.rs_detail td { background: #fafafa; color: #555; padding: 0; }
            .rs_detail_list { padding: 6px 10px 8px 34px; white-space: normal; }
            .rs_detail_list div { padding: 2px 0; }
            .rs_detail_list b { color: #369BD7; }
            .rs_tombol { display: flex; gap: 8px; justify-content: center; margin-top: 14px; flex-wrap: wrap; }
            .rs_tombol button { padding: 8px 22px; font-size: 14px; border: none; border-radius: 4px; color: #fff; cursor: pointer; }
            @media (max-width: 768px) {
                .rs_box { padding: 14px 12px; }
                .rs_tbl th, .rs_tbl td { padding: 6px; }
            }
        `;
        document.head.appendChild(st);
    }

    // ===== Baca tabel dari sebuah dokumen (halaman ini atau hasil fetch) =====
    function teksBersih(el) {
        return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
    }

    // Baris pertama yang tidak kosong (mis. "Diterima" dari "Diterima <br> ...")
    function barisPertama(el) {
        if (!el) return '';
        const baris = el.textContent.split('\n').map(s => s.trim()).filter(Boolean);
        return baris[0] || '';
    }

    // Kolom dicari dari judul header, bukan posisi tetap (kolom Erzap bisa bergeser)
    function indeksKolom(tabel) {
        const idx = {};
        tabel.querySelectorAll('thead tr:last-child th').forEach((th, i) => {
            const t = teksBersih(th).toLowerCase();
            if (t === 'penerima servis') idx.penerima = i;
            else if (t === 'status') idx.status = i;
            else if (t === 'kode servis') idx.kode = i;
            else if (t === 'pelanggan') idx.pelanggan = i;
            else if (t === 'umur') idx.umur = i;
        });
        return idx;
    }

    function bacaTabel(doc) {
        const tabel = doc.querySelector('table#data_table');
        if (!tabel) return null;
        const idx = indeksKolom(tabel);
        if (idx.penerima === undefined) return null;

        const baris = [];
        tabel.querySelectorAll('tbody tr').forEach(tr => {
            const td = tr.children;
            if (td.length <= idx.penerima) return; // baris "tidak ada data" (colspan)
            const kodeEl = idx.kode !== undefined ? td[idx.kode] : null;
            const kodeLink = kodeEl ? kodeEl.querySelector('a') : null;
            baris.push({
                penerima: teksBersih(td[idx.penerima]) || '(tanpa penerima)',
                status: idx.status !== undefined ? (barisPertama(td[idx.status]) || '(tanpa status)') : '-',
                kode: kodeLink ? teksBersih(kodeLink) : teksBersih(kodeEl),
                pelanggan: idx.pelanggan !== undefined ? barisPertama(td[idx.pelanggan]) : '',
                umur: idx.umur !== undefined ? teksBersih(td[idx.umur]) : ''
            });
        });
        return baris;
    }

    function linkBerikutnya(doc, base) {
        const a = doc.querySelector('a.pagination_next[href]');
        if (!a || a.classList.contains('disabled')) return null;
        try { return new URL(a.getAttribute('href'), base).href; } catch (e) { return null; }
    }

    // URL halaman 1 dengan filter yang sama: diambil dari link pagination asli Erzap
    function urlHalamanPertama() {
        const a = document.querySelector('a.pagination_next[href], a.pagination_prev[href]');
        if (!a) return null;
        try {
            const u = new URL(a.getAttribute('href'), location.href);
            u.searchParams.delete('page');
            return u.href;
        } catch (e) { return null; }
    }

    // ===== Kumpulkan data semua halaman =====
    async function kumpulkanData(setStatus) {
        const semua = [];
        const kodeTerlihat = new Set();
        let halaman = 0;
        let pesanError = '';

        // Daftar terus bertambah (servis baru masuk di atas), jadi saat paging ada baris
        // yang bergeser ke halaman berikutnya -> dedupe pakai Kode Servis.
        const tambah = rows => rows.forEach(r => {
            if (r.kode) {
                if (kodeTerlihat.has(r.kode)) return;
                kodeTerlihat.add(r.kode);
            }
            semua.push(r);
        });

        let url = urlHalamanPertama();
        if (!url) {
            // Tidak ada pagination = cuma 1 halaman -> baca tabel yang sedang tampil
            const rows = bacaTabel(document);
            if (!rows) return { semua, halaman: 0, pesanError: 'Tabel / kolom "Penerima Servis" tidak ditemukan' };
            tambah(rows);
            return { semua, halaman: 1, pesanError };
        }

        try {
            const dikunjungi = new Set();
            while (url && !dikunjungi.has(url) && halaman < MAKS_HALAMAN) {
                if (dibatalkan) { pesanError = 'Dibatalkan'; break; }
                dikunjungi.add(url);
                setStatus('Membaca halaman ' + (halaman + 1) + '... (' + semua.length + ' data)');

                const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
                if (!res.ok) throw new Error('HTTP ' + res.status + ' di halaman ' + (halaman + 1));
                const urlAsli = res.url || url;
                const doc = new DOMParser().parseFromString(await res.text(), 'text/html');

                const rows = bacaTabel(doc);
                if (!rows) {
                    if (halaman === 0) throw new Error('Tabel tidak ada di HTML halaman (mungkin sesi habis / tabel dimuat terpisah)');
                    break;
                }
                halaman++;
                if (!rows.length) break;
                tambah(rows);
                url = linkBerikutnya(doc, urlAsli);
            }
        } catch (e) {
            pesanError = String(e && e.message || e);
            console.error('[Aistim] Rekap servis gagal:', e);
        }
        return { semua, halaman, pesanError };
    }

    function kelompokkan(semua) {
        const grup = new Map();
        const totalStatus = new Map();
        semua.forEach(r => {
            if (!grup.has(r.penerima)) grup.set(r.penerima, { nama: r.penerima, total: 0, status: new Map(), item: [] });
            const g = grup.get(r.penerima);
            g.total++;
            g.status.set(r.status, (g.status.get(r.status) || 0) + 1);
            g.item.push(r);
            totalStatus.set(r.status, (totalStatus.get(r.status) || 0) + 1);
        });
        const daftar = Array.from(grup.values()).sort((a, b) => b.total - a.total || a.nama.localeCompare(b.nama));
        // Kolom status urut dari yang paling banyak
        const statusKolom = Array.from(totalStatus.entries()).sort((a, b) => b[1] - a[1]).map(e => e[0]);
        return { daftar, statusKolom, totalStatus };
    }

    // ===== Modal =====
    function buatModal() {
        const lama = document.getElementById('rs_modal');
        if (lama) lama.remove();
        const overlay = document.createElement('div');
        overlay.id = 'rs_modal';
        overlay.className = 'rs_overlay';
        const box = document.createElement('div');
        box.className = 'rs_box';
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        return { overlay, box };
    }

    function tombol(teks, warna, onClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = teks;
        b.style.background = warna;
        b.addEventListener('click', onClick);
        return b;
    }

    function el(tag, teks, cls) {
        const e = document.createElement(tag);
        if (teks !== undefined && teks !== null) e.textContent = teks;
        if (cls) e.className = cls;
        return e;
    }

    function tampilkanLoading() {
        const { overlay, box } = buatModal();
        box.style.width = 'min(420px, 100%)';
        box.style.textAlign = 'center';
        box.appendChild(el('h3', 'Rekap per Penerima Servis'));
        const status = el('p', 'Menyiapkan...', 'rs_info');
        box.appendChild(status);
        const aksi = el('div', null, 'rs_tombol');
        aksi.appendChild(tombol('Batal', '#dc3545', () => { dibatalkan = true; }));
        box.appendChild(aksi);
        return { overlay, setStatus: t => { status.textContent = t; } };
    }

    function teksSalin(hasil, statusKolom, jumlahData) {
        const baris = ['REKAP PER PENERIMA SERVIS (' + jumlahData + ' data)', ''];
        hasil.forEach((g, i) => {
            const rincian = statusKolom.filter(s => g.status.get(s)).map(s => s + ' ' + g.status.get(s)).join(', ');
            baris.push((i + 1) + '. ' + g.nama + ': ' + g.total + (rincian ? ' (' + rincian + ')' : ''));
        });
        return baris.join('\n');
    }

    function tampilkanHasil(data) {
        const { semua, halaman, pesanError } = data;
        const { daftar, statusKolom, totalStatus } = kelompokkan(semua);
        const { overlay, box } = buatModal();

        box.appendChild(el('h3', 'Rekap per Penerima Servis'));
        const info = el('p', semua.length + ' data dari ' + halaman + ' halaman, ' + daftar.length + ' penerima. Klik nama untuk lihat detail.' +
            (pesanError ? ' Berhenti: ' + pesanError : ''), 'rs_info' + (pesanError ? ' rs_err' : ''));
        box.appendChild(info);

        const scroll = el('div', null, 'rs_scroll');
        const tbl = el('table', null, 'rs_tbl');
        const kolomTotal = 3 + statusKolom.length;

        const thead = el('thead');
        const trh = el('tr');
        trh.appendChild(el('th', 'No'));
        trh.appendChild(el('th', 'Penerima Servis'));
        statusKolom.forEach(s => trh.appendChild(el('th', s, 'rs_num')));
        trh.appendChild(el('th', 'Total', 'rs_num'));
        thead.appendChild(trh);
        tbl.appendChild(thead);

        const tbody = el('tbody');
        daftar.forEach((g, i) => {
            const tr = el('tr', null, 'rs_grup');
            tr.appendChild(el('td', String(i + 1)));
            tr.appendChild(el('td', '▸ ' + g.nama));
            statusKolom.forEach(s => tr.appendChild(el('td', String(g.status.get(s) || 0), 'rs_num')));
            tr.appendChild(el('td', String(g.total), 'rs_num'));

            let detail = null;
            tr.addEventListener('click', () => {
                if (detail) {
                    detail.remove();
                    detail = null;
                    tr.children[1].textContent = '▸ ' + g.nama;
                    return;
                }
                detail = el('tr', null, 'rs_detail');
                const td = el('td');
                td.colSpan = kolomTotal;
                const list = el('div', null, 'rs_detail_list');
                g.item.forEach(r => {
                    const d = el('div');
                    d.appendChild(el('b', r.kode || '-'));
                    d.appendChild(document.createTextNode(' · ' + (r.pelanggan || '-') + ' · ' + r.status + (r.umur ? ' · ' + r.umur : '')));
                    list.appendChild(d);
                });
                td.appendChild(list);
                detail.appendChild(td);
                tr.after(detail);
                tr.children[1].textContent = '▾ ' + g.nama;
            });
            tbody.appendChild(tr);
        });

        if (daftar.length) {
            const trt = el('tr', null, 'rs_total');
            trt.appendChild(el('td', ''));
            trt.appendChild(el('td', 'TOTAL'));
            statusKolom.forEach(s => trt.appendChild(el('td', String(totalStatus.get(s) || 0), 'rs_num')));
            trt.appendChild(el('td', String(semua.length), 'rs_num'));
            tbody.appendChild(trt);
        }
        tbl.appendChild(tbody);
        scroll.appendChild(tbl);
        if (!daftar.length) scroll.style.display = 'none';
        box.appendChild(scroll);

        const aksi = el('div', null, 'rs_tombol');
        if (daftar.length) {
            const salin = tombol('Salin', '#369BD7', () => {
                const teks = teksSalin(daftar, statusKolom, semua.length);
                const beres = () => { salin.textContent = 'Tersalin ✓'; setTimeout(() => { salin.textContent = 'Salin'; }, 1500); };
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(teks).then(beres, () => prompt('Salin teks ini:', teks));
                } else {
                    prompt('Salin teks ini:', teks);
                }
            });
            aksi.appendChild(salin);
        }
        aksi.appendChild(tombol('Tutup', '#28a745', () => overlay.remove()));
        box.appendChild(aksi);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    }

    async function jalankanRekap(btn) {
        if (prosesJalan) return;
        prosesJalan = true;
        dibatalkan = false;
        btn.classList.add('rs_jalan');
        const loading = tampilkanLoading();
        try {
            const data = await kumpulkanData(loading.setStatus);
            loading.overlay.remove();
            tampilkanHasil(data);
        } finally {
            btn.classList.remove('rs_jalan');
            prosesJalan = false;
        }
    }

    // ===== Tombol di kiri badge "Diterima" =====
    function pasangTombol() {
        const diterima = document.getElementById('info_diterima');
        if (!diterima || document.getElementById('rs_btn')) return;
        pasangStyle();
        const btn = document.createElement('span');
        btn.id = 'rs_btn';
        btn.className = 'badge';
        btn.textContent = '📊 Rekap Penerima';
        btn.title = 'Rekap semua halaman, dikelompokkan per Penerima Servis';
        btn.addEventListener('click', () => jalankanRekap(btn));
        diterima.parentNode.insertBefore(btn, diterima);
    }

    // Konten Erzap dimuat ulang lewat AJAX (#ajax_target) -> pasang ulang kalau hilang
    pasangTombol();
    new MutationObserver(pasangTombol).observe(document.body, { childList: true, subtree: true });
})();
