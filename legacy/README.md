# SIMS SMA Timor-Leste — NOSSEF Railaco

Sistem Informasi Manajemen Sekolah untuk Escola Secundária Católica Nossa Senhora de Fátima (NOSSEF) Railaco.
Spesifikasi: `prd.md` (acuan stack), `prd1.md`. Desain antarmuka: `ui.md` (gaya Dropbox, tanpa emoji, tanpa gradien).

## Instal di laptop baru (otomatis)

Salin folder proyek (tanpa `node_modules/` dan `dist/`), lalu dari terminal (Linux/macOS) atau **Git Bash** (Windows):

```bash
bash setup.sh            # pasang Node.js bila perlu, npm install, build, lalu jalankan di http://localhost:4000
bash setup.sh --dev      # mode development (http://localhost:5173)
bash setup.sh --no-start # hanya instal + build
bash setup.sh --reset-db # isi ulang database dengan data demo
```

## Menjalankan di komputer lokal

Prasyarat: Node.js 22.5+ (memakai modul bawaan `node:sqlite`, tanpa kompilasi native).

```bash
npm install          # sekali saja
npm run dev          # API (port 4000) + frontend Vite (port 5173)
```

Buka **http://localhost:5173**. Dari HP/laptop lain di jaringan yang sama: **http://<IP-komputer>:5173**
(IP tampil di terminal pada baris `Network`; izinkan port 5173 di Windows Firewall bila perlu).

Mode produksi (satu port): `npm start` → build lalu buka **http://localhost:4000**.

Reset data ke kondisi awal: `npm run reset-db` lalu restart server (atau login `admin` → Administrasi → Reset Data Demo).

## Database (fase development): SQLite

- File: `server/data/nossef.sqlite` — dibuat otomatis dari `server/seed.js` saat pertama kali dijalankan.
- Setiap koleksi = satu tabel (`students`, `invoices`, `payments`, `scores`, ...) dengan kolom `id` dan `data` (JSON).
  Bisa diperiksa dengan DB Browser for SQLite, misalnya `SELECT json_extract(data,'$.name') FROM students;`.
- Tabel `files` menyimpan **isi** semua file unggahan (BLOB) agar debugging lengkap: dokumen PPDB, kuitansi bank,
  file Excel pauta asli, surat mutasi, lampiran izin/pengumuman, file impor, serta hasil laporan (PDF/XLSX/CSV).
- Tabel `meta` menyimpan profil sekolah dan penghitung nomor (protokol, invoice, kwitansi).

## Aturan bisnis utama

- **Nilai skala 0–10**: Média = TPC 20% + Teste 1 25% + Teste 2 25% + Ezame 30%.
  **REPROVADO** bila Média 0,00–5,00; **APROVADO** bila di atas 5,00. (Konstanta `PASS_ABOVE` di `server/seed.js` dan `src/lib/format.ts`.)
- **Pembayaran SPP hanya dicatat oleh Finansas**: *Tunai* (langsung terverifikasi + kwitansi) atau *Kuitansi Bank*
  (wajib nomor kuitansi + foto/PDF kuitansi; masuk antrean verifikasi; nomor kuitansi ganda ditolak). Siswa/wali tidak mengunggah sendiri.
- **PPDB**: dokumen wajib diunggah (PDF/JPG/PNG ≤ 5 MB) sebelum kirim resmi; setelah kirim tampil bukti pendaftaran dengan
  disclaimer wajib simpan nomor registrasi, nomor tersimpan otomatis di perangkat, dan fitur "Lupa nomor registrasi?"
  (nama + tanggal lahir + HP wali).
- **Laporan** dibuat di server sebagai background job (QUEUED → RUNNING → SUCCEEDED), hasil PDF/XLSX/CSV disimpan di database.

## Bahasa

UI sumber berbahasa Indonesia; seluruh teks antarmuka (menu, judul, tombol, label, placeholder, pesan sukses/error dari server)
diterjemahkan ke **Tetun, Português, English** melalui kamus di `src/i18n/` (lapisan `domTranslator.ts`).
Data (nama, catatan, judul buku) tidak diterjemahkan. Menambah teks baru: tambahkan entri di `src/i18n/dict*.ts`.

## PWA

Manifest + ikon PNG (192/512/maskable) + service worker. Pop-up "Instal aplikasi" muncul otomatis
(Chrome/Edge: tombol instal native; iOS Safari/Android: petunjuk manual). Instalasi penuh memerlukan HTTPS atau `localhost`;
lewat `http://IP-lokal` browser hanya membuat pintasan.

## Akun demo (kata sandi semua: `nossef2026`)

| Username | Peran |
| --- | --- |
| `cristina.amaral` | PRINCIPAL — Diretora Geral (review pauta, publish rapor) |
| `maria.martins` | CURRICULUM_ADMIN — Vise-Diretora Pedagójika |
| `antonio.soares` | TEACHER + HOMEROOM_TEACHER — Profesor da Turma 10º CT-A |
| `agostinho.freitas` | TEACHER |
| `finansas` | FINANCE_ADMIN — Tesoureiro (kasir tunai & kuitansi bank) |
| `sekretaria` | SCHOOL_ADMIN / SECRETARY |
| `admisaun` | ADMISSION_OFFICER (PPDB) |
| `konselora` | COUNSELOR (BK) |
| `biblioteka` | LIBRARIAN |
| `patrimoniu` | ASSET_OFFICER |
| `estudante` | STUDENT (portal baca-saja) |
| `inan-aman` | GUARDIAN (2 anak — child switcher) |
| `admin` | SUPER_ADMIN |

Portal publik PPDB (tanpa login): `/ppdb/apply` dan `/ppdb/status`.

## Belum dikerjakan (sesuai keputusan saat ini)

- Pengiriman email dan Web Push (notifikasi in-app sudah berjalan).
- Transkrip tahun-tahun sebelum 2026 (hanya nilai 2026 yang tercatat yang ditampilkan).
