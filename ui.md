# UI DESIGN SPECIFICATION & GOOGLE STITCH BLUEPRINT
## SIMS SMA Timor-Leste — Escola Secundária Católica "Nossa Senhora de Fátima" (NOSSEF) Railaco

> **Dokumen Acuan Desain Antarmuka (UI/UX Source of Truth)**
> **Referensi Visual Utama:** Dropbox Web & Mobile App (`dropbox.com` — Dig Design System)
> **Karakteristik Desain:** Premium, Elegan, Minimalis, Utilitarian, Zero AI-Slop, Zero Emoji
> **Target Platform:** Progressive Web App (PWA) Adaptif — Native Mobile App (`< 768px`), Tablet Split-View (`768px - 1023px`), Desktop Web Workspace (`>= 1024px`)
> **Tumpukan UI:** Next.js / React TypeScript, Tailwind CSS v4, Lucide React Icons (`stroke-width: 1.5px`), TanStack Table, Vaul (Mobile Drawer/Bottom Sheet), Radix UI Primitives

---

## 0. PANDUAN PENGGUNAAN DI GOOGLE STITCH (STEP-BY-STEP WORKFLOW)

Dokumen ini disusun secara modular agar Anda dapat membangun antarmuka **satu per satu (Screen-by-Screen)** di Google Stitch tanpa kehilangan konsistensi desain:

1. **Langkah Pertama (Wajib):** Salin **Bagian 1 (Design System & Global Tokens)** dan **Bagian 2 (Adaptive App Shell Architecture)** ke Google Stitch sebagai instruksi fondasi (*System / Global Context*).
2. **Langkah Kedua (Iteratif):** Salin blok spesifikasi dari **Bagian 3 (`SCREEN-01` hingga `SCREEN-22`)** satu per satu sesuai urutan modul yang ingin Anda bangun. Setiap blok sudah memiliki konteks layout, komponen, ikon Lucide, perilaku responsif (Mobile, Tablet, PC), serta *Prompt Stitch Siap Pakai*.

---

## 1. DESIGN SYSTEM & GLOBAL TOKENS (DROPBOX-INSPIRED MINIMALISM)

### 1.1 Larangan Keras (Anti-AI-Slop & Anti-Emoji Rules)
- **ZERO EMOJI:** Dilarang keras menggunakan karakter emoji dalam bentuk apa pun pada label, status, navigasi, toast, maupun empty state. Semua penanda visual wajib menggunakan komponen ikon dari `lucide-react` atau indikator geometri murni (lingkaran status `6px` atau garis tepi).
- **ZERO AI-SLOP:**
  - Dilarang menggunakan gradien warna mencolok (seperti ungu-ke-biru atau cyan-ke-magenta).
  - Dilarang menggunakan efek *glassmorphism* berlebihan (`backdrop-blur` di atas bola warna-warni), bayangan neon (*glow shadows*), atau sudut kartu terlalu bulat (`rounded-3xl`).
  - Dilarang membuat barisan kartu KPI berwarna-warni seperti pelangi. Gunakan latar putih bersih (`#FFFFFF`) di atas kanvas batu hangat (`#F7F5F2`) dengan garis pemisah tipis `1px solid #E6E4E0`.

### 1.2 Palet Warna (Color Tokens)
Mengadopsi filosofi kontras tajam Dropbox (Tinta Hitam Pekat, Kanvas Putih/Warm Stone, dan Aksen Biru Kobalt Presisi):

| Token CSS / Tailwind | Hex Code | Penggunaan Utama |
| :--- | :--- | :--- |
| `--bg-canvas` (`bg-[#F7F5F2]`) | `#F7F5F2` | Latar belakang aplikasi utama, sidebar kiri desktop, dan header grup tabel. |
| `--bg-surface` (`bg-[#FFFFFF]`) | `#FFFFFF` | Area kerja utama (main workspace), baris tabel, kartu modul, panel inspektur kanan, dan modal. |
| `--bg-hover` (`hover:bg-[#F2F0EC]`) | `#F2F0EC` | Efek sorot (hover) pada baris tabel, item menu navigasi, dan daftar file. |
| `--bg-selected` (`bg-[#EBF2FF]`) | `#EBF2FF` | Baris tabel yang sedang dicentang/dipilih dan item navigasi aktif. |
| `--text-primary` (`text-[#1E1919]`) | `#1E1919` | Judul halaman, nama siswa/guru, nilai utama, dan teks isi penting. |
| `--text-secondary` (`text-[#524A3E]`) | `#524A3E` | Sub-judul, label kolom tabel, metadata sekunder, dan keterangan waktu. |
| `--text-muted` (`text-[#8C8275]`) | `#8C8275` | Teks placeholder input, item non-aktif (disabled), dan teks bantuan. |
| `--accent-primary` (`bg-[#0061FE]`) | `#0061FE` | Dropbox Cobalt Blue — Tombol aksi utama (Primary CTA), indikator tab aktif, dan fokus input. |
| `--accent-hover` (`hover:bg-[#0050D5]`) | `#0050D5` | Warna tombol utama saat kursor diarahkan (hover/active). |
| `--accent-dark` (`bg-[#1E1919]`) | `#1E1919` | Tombol aksi sekunder berdampak tinggi (mis. "Finalizar Notas", "Publicar Pauta"). |
| `--border-hairline` (`border-[#E6E4E0]`) | `#E6E4E0` | Garis pemisah struktural `1px` antar panel, baris tabel, dan kartu. |
| `--border-strong` (`border-[#C6C1B9]`) | `#C6C1B9` | Garis tepi kotak input form dan batas sel spreadsheet nilai. |
| `--status-success` | `#1D783B` (Teks) / `#E8F5EC` (Latar) | Status Lulus (*Aprovado*), Lunas (*PAID*), Hadir (*PRESENT*), Online. |
| `--status-warning` | `#9E5800` (Teks) / `#FEF4E6` (Latar) | Status Ujian Ulang (*Exame*), Menunggu Verifikasi (*PENDING*), Terlambat (*LATE*), Antrean Offline. |
| `--status-danger` | `#C81E1E` (Teks) / `#FDECEC` (Latar) | Status Tinggal Kelas (*Retido*), Tunggakan (*UNPAID/OVERDUE*), Alpa (*ABSENT*), Konflik Sinkronisasi. |

### 1.3 Tipografi & Hirarki (Typography Scale)
- **Font Heading (`--font-display`):** `Outfit`, SemiBold (`600`), `tracking-tight` (`-0.02em`). Memberikan kesan arsitektural seperti tajuk Dropbox.
- **Font UI & Body (`--font-sans`):** `Plus Jakarta Sans`, Regular (`400`), Medium (`500`), SemiBold (`600`). Sangat mudah dibaca pada kepadatan data tinggi.
- **Font Angka & Kode (`--font-mono`):** `JetBrains Mono` dengan `tabular-nums`. **Wajib** digunakan untuk semua Nomor Induk Siswa (`student_no`), Nomor Pendaftaran, Nilai Akademik (`0.00 - 20.00` / `0 - 100`), Nominal Uang (`USD $148.50`), Nomor Invoice, dan Nomor Protokol (`PV-NOSSEF-2026-8914`).

| Elemen | Ukuran & Ketebalan | Kelas Tailwind |
| :--- | :--- | :--- |
| Judul Halaman (Page Title) | `24px` / `30px`, SemiBold | `font-display text-xl md:text-2xl font-semibold text-[#1E1919] tracking-tight` |
| Judul Panel / Modal | `18px` / `24px`, SemiBold | `font-display text-lg font-semibold text-[#1E1919]` |
| Header Kolom Tabel | `12px` / `16px`, SemiBold, Uppercase | `text-xs font-semibold uppercase tracking-wider text-[#524A3E]` |
| Teks Baris Tabel / Isi | `14px` / `20px`, Regular/Medium | `text-sm text-[#1E1919]` |
| Metadata / Badge Status | `12px` / `16px`, Medium | `text-xs font-medium` |

### 1.4 Standar Komponen & Ikonografi
- **Ikonografi:** Hanya menggunakan `lucide-react`. Ukuran standar `16px` (`w-4 h-4`) di dalam tombol dan tabel, serta `20px` (`w-5 h-5`) di navigasi utama. Ketebalan garis konsisten `strokeWidth={1.5}`.
- **Radius Sudut (Border Radius):**
  - Tombol, Input, Badge, Dropdown: `6px` (`rounded-md`).
  - Kontainer Tabel, Kartu, Panel Modal: `8px` (`rounded-lg`).
  - Bottom Sheet Mobile: `16px` hanya pada dua sudut atas (`rounded-t-2xl`).
- **Elevation / Bayangan:**
  - Kartu dan tabel di dalam halaman **tidak menggunakan shadow** (`shadow-none`), melainkan dibatasi oleh border `1px solid #E6E4E0`.
  - Bayangan halus (`shadow-lg border border-[#E6E4E0]`) hanya digunakan pada elemen melayang: Dropdown Menu, Command Palette (`Cmd+K`), Modal Dialog, dan Slide-over Drawer.

---

## 2. ADAPTIVE APP SHELL ARCHITECTURE (MOBILE, TABLET, DESKTOP)

Sistem ini adalah **PWA (Progressive Web App)** yang mengubah struktur tata letaknya secara otomatis agar terasa seperti **aplikasi native di Smartphone dan Tablet**, serta **aplikasi web produktivitas (seperti Dropbox Web) di PC/Laptop**.

```text
+-----------------------------------------------------------------------------------+
| DESKTOP (>= 1024px): DROPBOX 3-PANE WORKSPACE                                     |
+------------------+---------------------------------------------+------------------+
| LEFT SIDEBAR     | TOP UTILITY BAR (Search, Sync, Lang, Zoom)  | RIGHT INSPECTOR  |
| (240px Fixed)    +---------------------------------------------+ DRAWER           |
| bg-[#F7F5F2]     | CONTEXTUAL HEADER & ACTION BAR              | (360px Slide/Fix)|
|                  +---------------------------------------------+ bg-[#FFFFFF]     |
| - Brand NOSSEF   | MAIN WORKSPACE (bg-[#FFFFFF])               |                  |
| - Role Switcher  | - Filter Pills Bar                          | - Record Preview |
| - Nav Groups     | - High-Density Data Table / Grid            | - Quick Actions  |
| - Offline Status | - Sticky Pagination Footer                  | - Audit Timeline |
+------------------+---------------------------------------------+------------------+

+-----------------------------------------------------------------------------------+
| TABLET (768px - 1023px): NATIVE TABLET RAIL + MASTER-DETAIL                       |
+-------+--------------------------------------------------------+------------------+
| RAIL  | TOP BAR + BREADCRUMB + PRIMARY ACTIONS                 | SLIDE-OVER       |
| (64px)|--------------------------------------------------------+ INSPECTOR        |
| Icons | TOUCH-OPTIMIZED TABLE / SPLIT LIST                     | (Overlay 340px)  |
+-------+--------------------------------------------------------+------------------+

+---------------------------------------+
| MOBILE (< 768px): NATIVE MOBILE APP   |
+---------------------------------------+
| STICKY TOP APP BAR (56px, Safe-Area)  |
| [Title / Back]    [Sync] [Search] [+] |
+---------------------------------------+
| HORIZONTAL FILTER CHIPS (Scrollable)  |
+---------------------------------------+
| NATIVE LIST VIEW (1-Column Cards/Rows)|
| - Tap row -> Opens Bottom Sheet Detail|
| - Long-press / Checkbox -> Bulk Bar   |
+---------------------------------------+
| FIXED BOTTOM TAB BAR (64px + Inset)   |
| [Home] [ Siswa ] [Absen] [Nilai] [Menu]|
+---------------------------------------+
```

### 2.1 Spesifikasi Perilaku Responsif Global
1. **Desktop (`>= 1024px` - PC/Web Mode):**
   - **Left Sidebar (`240px`):** Latar `#F7F5F2`, border kanan `1px solid #E6E4E0`. Menampilkan logo resmi NOSSEF Railaco, pemilih Tahun Ajaran & Trimestre aktif (`2026 - 1º Trimestre`), serta daftar menu vertikal dengan ikon Lucide.
   - **Top Utility Bar (`56px`):** Berisi Global Search Bar (`Cari siswa, NIS, invoice, atau menu... [Ctrl+K]`), tombol cepat `[Upload Valor Excel]` (khusus Guru/Wali Kelas), indikator status PWA (`Online` / `Offline - 3 Pending Sync`), pemilih 4 Bahasa (`TET | PT | ID | EN`), kontrol skala Zoom (`85% - 160%`), lonceng notifikasi, dan profil pengguna.
   - **Contextual Action Bar (Gaya Dropbox):** Saat tidak ada baris tabel yang dipilih, bar menampilkan tombol utama halaman (mis. `+ Tambah Siswa`, `Import Excel`, `Export PDF`). Saat pengguna mencentang 1 atau lebih baris tabel, bar ini **berubah secara instan** menjadi bar aksi massal berwarna `#1E1919` atau `#EBF2FF` (`"4 siswa dipilih" -> [Pindah Kelas] [Cetak Kartu] [Batalkan Pilihan]`).
   - **Right Inspector Drawer (`360px`):** Saat pengguna mengklik satu baris di tabel (tanpa berpindah halaman), panel kanan terbuka menampilkan ringkasan detail, dokumen PDF terlampir, atau riwayat log.

2. **Tablet (`768px - 1023px` - Tablet App Mode):**
   - Sidebar kiri menyusut menjadi **Navigation Rail (`64px`)** yang hanya menampilkan ikon dengan tooltip, dapat diperluas sebagai overlay jika tombol menu diklik.
   - Tabel menyesuaikan kolom menjadi 4-5 kolom esensial; kolom sekunder dipindahkan ke dalam **Slide-Over Inspector Drawer** ketika baris diketuk.
   - Semua tombol dan sel input absensi/nilai memiliki ukuran sentuh minimal `44px x 44px`.

3. **Mobile Phone (`< 768px` - Native Mobile App Mode):**
   - **Tidak ada Sidebar Kiri.** Digantikan oleh **Fixed Bottom Tab Bar (`64px` + `env(safe-area-inset-bottom)`)** berisi 4 menu utama sesuai peran (contoh untuk Guru: `Beranda`, `Jadwal`, `Absensi`, `Nilai`) ditambah tab ke-5 `Menu` (`LayoutGrid` icon) yang membuka lembaran penuh (Full-Screen Categorized Menu Drawer).
   - **Tidak ada Tabel Horizontal Lebar.** Setiap baris data dirender sebagai **Dropbox Mobile File Row** (`72px` tinggi): Avatar/Kode di kiri, Nama Utama + Sub-info Kelas/Jurusan di tengah, dan Nilai/Nominal/Badge Status beserta tombol `MoreVertical` (`...`) di kanan.
   - **Bottom Sheet (`Vaul`):** Mengetuk item daftar, filter, atau form tambah data akan memunculkan *Bottom Sheet* yang dapat digeser ke bawah (*swipe-to-dismiss*).

---

## 3. SPESIFIKASI DETAIL PER TAMPILAN (UNTUK BUILD SATU PER SATU DI STITCH)

Gunakan setiap bagian di bawah ini secara berurutan di Google Stitch.

---

### SCREEN-01: Autentikasi, Pemulihan Sandi & Status Keamanan Sesi
- **Rute Canonical:** `/login`, `/forgot-password`, `/reset-password`
- **Aktor:** Publik / Semua Pengguna

#### A. Struktur Layout & Komponen
1. **Top Utility Strip:** Bar tipis di bagian atas layar menampilkan nama institusi `"Escola Secundária Católica Nossa Senhora de Fátima (NOSSEF) Railaco"` di kiri, dan pemilih bahasa (`Tetun`, `Português`, `Indonesia`, `English`) beserta indikator status jaringan PWA di kanan.
2. **Centered Auth Container (`max-w-[400px]`):**
   - Di atas latar `#F7F5F2`, kotak login berdiri bersih dengan latar `#FFFFFF`, border `1px solid #E6E4E0`, `rounded-lg`, dan padding `p-8`.
   - **Header Identitas:** Logo monokrom/resmi NOSSEF (`40px x 40px`), judul `"Masuk ke Sistem Informasi NOSSEF"`, dan sub-teks `"Gunakan akun resmi sekolah Anda"`.
   - **Form Login:**
     - Field `Username atau Email` (Input tinggi `40px`, border `#C6C1B9`, fokus `#0061FE`).
     - Field `Kata Sandi` dengan tombol ikon `Eye` / `EyeOff` di sisi kanan dalam input, serta tautan `"Lupa kata sandi?"` di kanan atas label.
     - Kotak peringatan error inline (jika terjadi `AUTH_INVALID_CREDENTIALS` atau `AUTH_ACCOUNT_INACTIVE`) dengan latar `#FDECEC`, border `#C81E1E`, dan ikon `AlertCircle`.
     - Tombol Utama `"Masuk"` (`w-full h-10 bg-[#0061FE] hover:bg-[#0050D5] text-white font-medium rounded-md`).
   - **Footer Portal Publik:** Garis pemisah tipis `1px solid #E6E4E0` diikuti tautan cepat menuju Portal Pendaftaran Siswa Baru (`/admissions`) dan Cek Status Kelulusan PPDB (`/admissions/status`) dengan ikon `ArrowUpRight`.

#### B. Perilaku Responsif (Mobile / Tablet / PC)
- **PC & Tablet:** Kartu berada tepat di tengah layar vertikal dan horizontal (`min-h-screen flex items-center justify-center bg-[#F7F5F2]`).
- **Mobile Phone:** Latar menjadi putih penuh (`bg-white`), tanpa border kartu luar, tampak seperti halaman login aplikasi mobile native dengan tombol `"Masuk"` yang mudah dijangkau ibu jari.

#### C. Prompt Google Stitch (Salin untuk Build SCREEN-01)
> **Prompt Stitch SCREEN-01:**
> Build a Dropbox.com-inspired minimalist Login and Password Reset screen for "SIMS SMA NOSSEF Railaco Timor-Leste". Zero emojis, zero gradients, zero AI-slop. Use background `#F7F5F2`, surface `#FFFFFF`, primary text `#1E1919`, border `1px solid #E6E4E0`, and primary button Cobalt Blue `#0061FE`. Include a top header bar with language switcher (`TET | PT | ID | EN`) and PWA network badge (`Online`). Center a `400px` login card containing the school crest placeholder, title in Outfit font, Username/Email input, Password input with `Eye` icon toggle, an inline error alert state for `AUTH_INVALID_CREDENTIALS`, a solid `#0061FE` submit button, and bottom links for "Pendaftaran Siswa Baru (PPDB)" and "Cek Status Seleksi". On mobile (`<768px`), render as a full-screen native mobile app login view.

---

### SCREEN-02: Portal Publik PPDB Online & Cek Status Seleksi
- **Rute Canonical:** `/admissions`, `/admissions/apply`, `/admissions/status`
- **Aktor:** `PUBLIC_GUEST` (Calon Siswa Baru & Orang Tua)

#### A. Struktur Layout & Komponen
1. **Public Header (`h-16 bg-white border-b border-[#E6E4E0]`):** Logo NOSSEF, judul `"Portal Penerimaan Siswa Baru (PPDB)"`, badge status periode aktif (`"Periode 2026/2027: DIBUKA"` dengan titik hijau `#1D783B`), dan tombol `"Cek Status Pendaftaran"`.
2. **Stepper Progress Horizontal (4 Langkah):**
   - `01. Identitas Calon Siswa` -> `02. Data Orang Tua/Wali` -> `03. Unggah Dokumen Resmi` -> `04. Tinjau & Kirim`.
3. **Workspace Formulir (`max-w-3xl mx-auto bg-white border border-[#E6E4E0] rounded-lg p-6 md:p-8`):**
   - **Bagian 1 (`Applicant`):** Nama Lengkap Resmi, Tempat & Tanggal Lahir, Jenis Kelamin, Sekolah Asal (*Escola Pre-Sekundária*), Nomor Telepon, Email, Alamat Lengkap, dan Pilihan Minat Jurusan (`IPA / Ciências e Tecnologias` atau `IPS / Ciências Sociais e Humanidades` — diberi keterangan sebagai *preferensi awal*).
   - **Bagian 2 (`ApplicantGuardian`):** Nama Wali, Hubungan (`FATHER`, `MOTHER`, `GUARDIAN`), Pekerjaan, Nomor Telepon Aktif, dan penanda `Kontak Utama`.
   - **Bagian 3 (`ApplicantDocument`):** Area unggah dokumen gaya Dropbox File Request. Setiap jenis dokumen wajib (Ijazah/SKHUN, Akta Kelahiran/Baptis, Pasfoto 3x4) memiliki baris kotak unggah bertitik (`border-dashed border-[#C6C1B9]`), indikator batas ukuran/tipe (`PDF/JPG maks 5MB`), dan status unggah (`Uploaded` / `Pending`).
   - **Sticky Bottom Action Bar:** Tombol `"Simpan Draf"` (`border border-[#C6C1B9] bg-white text-[#1E1919]`) di kiri dan `"Kirim Pendaftaran Resmi"` (`bg-[#0061FE] text-white`) di kanan.
4. **Tab/Halaman Cek Status (`/admissions/status`):**
   - Kotak pencarian berbasis Nomor Registrasi (`registration_no` dalam font monospace, mis. `REG-2026-0194`) dan Tanggal Lahir/Token agar tidak dapat ditebak secara berurutan.
   - Menampilkan kartu hasil seleksi resmi (`ACCEPTED`, `WAITING_LIST`, `REJECTED`) beserta instruksi Daftar Ulang jika diterima.

#### B. Prompt Google Stitch (Salin untuk Build SCREEN-02)
> **Prompt Stitch SCREEN-02:**
> Build a clean, Dropbox-style Public Student Admission Portal (`/admissions/apply` and `/admissions/status`) for NOSSEF Railaco High School. Use a distraction-free single-column workspace (`max-w-3xl`) on a `#F7F5F2` canvas. Include a 4-step horizontal progress indicator: 1. Data Siswa, 2. Wali/Inan-Aman, 3. Dokumen Persyaratan, 4. Konfirmasi. Use crisp 1px `#E6E4E0` borders, Outfit headings, and Dropbox-style file upload dropzones for required documents (Certificate, Birth Record, Photo 3x4) showing file name, size in KB, and `CheckCircle2` or `UploadCloud` Lucide icons. Include a switchable view for "Cek Status Pendaftaran" where applicants enter their `registration_no` (monospace) and birth date to view their status (`ACCEPTED`, `WAITING_LIST`, `REJECTED`). Fully responsive for mobile phones with sticky bottom action buttons.

---

### SCREEN-03: Dashboard Eksekutif & Operasional Multi-Peran
- **Rute Canonical:** `/dashboard`
- **Aktor:** Semua Pengguna Terautentikasi (Menyesuaikan Role: `PRINCIPAL`, `SCHOOL_ADMIN`, `CURRICULUM_ADMIN`, `FINANCE_ADMIN`, `TEACHER`, `HOMEROOM_TEACHER`)

#### A. Struktur Layout & Komponen
1. **Header Sambutan & Konteks Periode:**
   - Menampilkan judul `"Ringkasan Operasional"`, pemilih konteks cepat (`Tahun Ajaran 2026` | `1º Trimestre (CAU 1)`), dan tombol aksi cepat sesuai peran.
2. **Banner Aksi Cepat Guru & Wali Kelas (Khusus Role `TEACHER` / `HOMEROOM_TEACHER`):**
   - Panel horizontal berbingkai tegas (`bg-[#F7F5F2] border border-[#C6C1B9] rounded-lg p-4 flex items-center justify-between`) bertuliskan: `"Painél Professór & Profesor da Turma: Submete Pauta Valor via EXCEL"` lengkap dengan tombol langsung `[Upload Valor Excel]` (ikon `FileSpreadsheet`) dan `[Download Modelo Excel]` (ikon `Download`).
3. **Dropbox-Style Metric Strip (Tanpa Kartu Warna-Warni):**
   - Satu kontainer horizontal putih (`bg-white border border-[#E6E4E0] rounded-lg grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-y md:divide-y-0 md:divide-x divide-[#E6E4E0]`):
     - **Siswa Aktif:** `642` (Sub-info: `X: 220 | XI: 214 | XII: 208`)
     - **Presensi Hari Ini:** `96.4%` (Sub-info: `18 Alpa/Sakit`)
     - **Kelengkapan CAU 1:** `84%` (Sub-info: `6 Kelas Belum Final`)
     - **Koleksi SPP (USD):** `$18,450.00` (Font mono, Sub-info: `Bulan berjalan`)
     - **Tunggakan SPP:** `$3,120.00` (Font mono, teks `#C81E1E`)
     - **Verifikasi Bank Pending:** `12 Bukti` (Tautan langsung ke antrean verifikasi)
4. **Grid Workspace Utama (2 Kolom Asimetris di Desktop `lg:grid-cols-12 gap-6`):**
   - **Kolom Kiri (`lg:col-span-8`):**
     - **Tabel Kesiapan Akademik & Pauta per Rombel:** Daftar kelas (`10º CT-A`, `10º CSH`, `11º CT`, `12º CT`, dll.) dengan kolom Wali Kelas (*Profesor da Turma*), Status Presensi Hari Ini, Status Input Nilai CAU, dan tombol aksi cepat.
     - **Ringkasan Tarif Resmi SPP (Etapa 1 & Etapa 2):** Tabel referensi cepat Kelas 10 (`$148.50`), Kelas 11 (`$132.00`), Kelas 12 (`$137.00`).
   - **Kolom Kanan (`lg:col-span-4`):**
     - **Top 5 Ranking Jeral (CT & CSH):** Daftar ringkas 5 siswa dengan rata-rata tertinggi (Skala 0-20 / 0-100) dalam font `JetBrains Mono`.
     - **Log Aktivitas & Protokol Terbaru:** 5 aktivitas terakhir (mis. `PV-NOSSEF-2026-8914 dikirim oleh Prof. António`, `Pembayaran SPP #PAY-092 diverifikasi`).

#### B. Prompt Google Stitch (Salin untuk Build SCREEN-03)
> **Prompt Stitch SCREEN-03:**
> Build the main Desktop, Tablet, and Mobile PWA Dashboard (`/dashboard`) for SIMS SMA NOSSEF Railaco using the Dropbox.com design language. Include the full App Shell: left sidebar (`240px` on desktop, `64px` rail on tablet, bottom navigation bar on mobile) with `#F7F5F2` background and `#E6E4E0` 1px borders, plus top utility bar with global search, language selector (`TET/PT/ID/EN`), zoom control (`100%`), PWA sync indicator, and primary button `[Upload Valor Excel]`. Inside the main `#FFFFFF` workspace: (1) A prominent teacher action banner for submitting Excel Grade Sheets (`Pauta Valor`), (2) A 6-column horizontal metric strip separated by 1px hairlines showing Active Students, Attendance Rate, CAU 1 Completion, SPP Collected in USD (monospace), Arrears in USD, and Pending Bank Proofs, (3) A two-column lower grid with a Classroom Readiness Table on the left and Top 5 Student Rankings + Recent Protocol Audit Feed on the right.

---

### SCREEN-04: Manajemen Pendaftaran & Meja Verifikasi PPDB (Staf Admissions)
- **Rute Canonical:** `/admissions/periods`, `/admissions/applicants`, `/admissions/applicants/[id]`
- **Aktor:** `ADMISSION_OFFICER`, `SCHOOL_ADMIN`, `PRINCIPAL`

#### A. Struktur Layout & Komponen
1. **Contextual Top Bar:** Filter periode (`PPDB 2026/2027`), filter status (`DRAFT`, `SUBMITTED`, `VERIFIED`, `ACCEPTED`, `RE_REGISTERED`, `ENROLLED`), filter pilihan jurusan (`IPA`, `IPS`), dan tombol `[Batch Kirim ke Kelas 10]` (aktif saat pendaftar berstatus `RE_REGISTERED` dicentang).
2. **Tabel Antrean Pendaftar (Master View):**
   - Kolom: Checkbox, `No. Registrasi` (Mono), `Nama Lengkap`, `Sekolah Asal`, `Minat Jurusan`, `Status Dokumen` (`3/3 Valid`), `Skor/Rank`, `Status Alur`, dan menu aksi.
3. **Split-Screen Verification Workspace (Saat baris pendaftar diklik):**
   - **Panel Kiri (Pratinjau Dokumen):** Penampil PDF/Gambar terintegrasi untuk memeriksa Ijazah dan Akta Kelahiran tanpa mengunduh keluar browser.
   - **Panel Kanan (Formulir Verifikasi & Keputusan):**
     - Checklist masing-masing dokumen dengan tombol radio `[Valid]` / `[Invalid + Alasan]`.
     - Input Skor Seleksi & Peringkat.
     - Tombol transisi status eksplisit: `[Verifikasi Berkas]` -> `[Tetapkan Keputusan: Terima / Cadangan / Tolak]` -> `[Konfirmasi Daftar Ulang]` -> `[Konversi Menjadi Siswa Aktif (Atomic Enroll)]`.

#### B. Prompt Google Stitch (Salin untuk Build SCREEN-04)
> **Prompt Stitch SCREEN-04:**
> Build the Admissions Officer Workspace (`/admissions/applicants`) in Dropbox.com style. Feature a high-density applicant data table with filter pills (`Semua`, `Submitted`, `Verified`, `Accepted`, `Re-Registered`) and a contextual bulk action bar when rows are checked (`[Tetapkan Keputusan]`, `[Batch Masuk Kelas 10]`). Include a split-screen Right Inspector Drawer (`420px` wide) showing an applicant's verification workspace: a document previewer on top, document verification toggles (`PENDING`, `VALID`, `INVALID`) in the middle, and atomic workflow buttons (`Verify`, `Accept`, `Re-Register`, `Enroll to Student`) at the bottom.

---

### SCREEN-05: Direktori Siswa Terpadu, Beasiswa, Ketua Kelas & Arsip 2002–2026
- **Rute Canonical:** `/students`
- **Aktor:** `SCHOOL_ADMIN`, `PRINCIPAL`, `CURRICULUM_ADMIN`, `TEACHER` (Scoped), `HOMEROOM_TEACHER` (Scoped)

#### A. Struktur Layout & Komponen
1. **Sub-Navigation Tabs (Gaya Dropbox Folder Tabs):**
   - `Semua Siswa Aktif` | `Penerima Beasiswa (Bolseiru)` | `Ketua Kelas (Chefe de Turma)` | `Arsip Historis (2002-2026)`
2. **Filter Bar & Pencarian Cepat:**
   - Dropdown Tahun Ajaran (`2026`), Tingkat (`Kelas X`, `Kelas XI`, `Kelas XII`), Jurusan (`IPA / CT`, `IPS / CSH`), Rombel (`X IPA 1`, dst.), Status (`ACTIVE`, `TRANSFERRED`, `GRADUATED`), disertai tombol `[Import Siswa]` dan `[Export XLSX/PDF]`.
3. **Tabel Data Siswa (`TanStack Table`):**
   - Kolom: Checkbox, `NIS / EMIS` (Mono), `Nama Lengkap Siswa` (dengan avatar inisial monokrom), `Tingkat & Jurusan`, `Rombel Aktif`, `Wali Utama & No. HP`, `Status Beasiswa`, `Status Siswa`, dan ikon `ChevronRight`.
4. **Right Inspector Drawer (Pratinjau Cepat Siswa):**
   - Menampilkan pasfoto formal 3x4, QR Code Kartu Pelajar Digital, ringkasan kehadiran trimester berjalan, status lunas SPP (hanya jika role memiliki izin keuangan), dan tombol `[Buka Profil 360 Lengkap]`.

#### B. Prompt Google Stitch (Salin untuk Build SCREEN-05)
> **Prompt Stitch SCREEN-05:**
> Build the Unified Student Directory (`/students`) following Dropbox's file-manager table aesthetic. Include 4 top view tabs: `Siswa Aktif`, `Beasiswa (Bolseiru)`, `Ketua Kelas (Chefe de Turma)`, and `Arsip Historis 2002-2026`. Below the tabs, place a filter bar for Academic Year, Grade (`X, XI, XII`), Major (`IPA/CT, IPS/CSH`), Classroom, and Search input. Render a crisp white table with 1px `#E6E4E0` row borders, monospace Student IDs, student names, active classroom badges, scholarship tags (`Mérito`, `Jesuita`, `Sosiál`), and status pills. Include a Dropbox-style Right Inspector Panel showing a selected student's 3x4 formal photo, digital ID QR card preview, active enrollment info, and quick action buttons (`Cetak Kartu`, `Pindah Kelas`, `Profil 360`). On mobile, transform table rows into native touch list items.

---

### SCREEN-06: Profil Siswa 360 Derajat & Riwayat Penempatan (Enrollment History)
- **Rute Canonical:** `/students/[id]`, `/students/[id]/enrollment`, `/students/[id]/guardians`, `/students/[id]/documents`
- **Aktor:** Staf Berwenang (Scoped), Siswa Terkait (`Read-Only`), Wali Terkait (`Read-Only`)

#### A. Struktur Layout & Komponen
1. **Top Identity Header (`bg-white border-b border-[#E6E4E0] p-6`):**
   - Pasfoto 3x4 (`64px x 80px rounded border`), Nama Lengkap Siswa, Nomor Induk (`student_no`) & Nomor Nasional (`national_student_no`), Badge Status (`ACTIVE`), Penempatan Saat Ini (`XI IPA 1 — Tahun Ajaran 2026`), serta tombol aksi `[Mutasi / Pindah Kelas-Jurusan]` dan `[Cetak Kartu Pelajar]`.
2. **Horizontal Section Tabs:**
   - `Ringkasan & Identitas` | `Riwayat Kelas (Enrollment)` | `Orang Tua / Wali` | `Presensi` | `Nilai & Rapor` | `Keuangan SPP` (Restricted) | `Dokumen Privasi`
3. **Konten Utama — Timeline Riwayat Enrollment (Invariant `StudentEnrollment`):**
   - Menampilkan rekam jejak tahunan yang tidak pernah ditimpa (*immutable history*):
     - `2026` -> `Kelas XI` | `Jurusan IPA` | `Rombel XI IPA 1` | `Status: ACTIVE` | `Sumber: PROMOTION`
     - `2025` -> `Kelas X` | `Jurusan IPA` | `Rombel X IPA 1` | `Status: PROMOTED` | `Sumber: ADMISSION`
   - Dilengkapi tabel `StudentTransfer` (mencatat riwayat pindah rombel atau pindah jurusan IPA ke IPS beserta alasan wajib dan nama penyetuju).
4. **Modal Mutasi / Transfer Internal:**
   - Dialog untuk memindahkan siswa antar rombel atau antar jurusan (`INTERNAL_CLASS`, `INTERNAL_MAJOR`, `OUT`) dengan field wajib `Tanggal Efektif`, `Alasan Mutasi`, dan `Unggah Surat Pendukung`.

#### B. Prompt Google Stitch (Salin untuk Build SCREEN-06)
> **Prompt Stitch SCREEN-06:**
> Build the Student 360 Profile & Historical Enrollment View (`/students/[id]`) in Dropbox style. Top profile header displays student 3x4 photo, full name, monospace `student_no` and `national_student_no`, current active placement badge (`XI IPA 1 - 2026`), and action buttons (`Pindah Kelas/Jurusan`, `Unduh Transkrip`). Below, include horizontal navigation tabs: `Identitas`, `Riwayat Enrollment`, `Wali (Guardians)`, `Kehadiran`, `Nilai & Rapor`, `Keuangan SPP`, `Dokumen`. In the main workspace, showcase the immutable `StudentEnrollment` timeline table (`2025: X IPA 1 [PROMOTED]` -> `2026: XI IPA 1 [ACTIVE]`), the Guardian relationship cards (`Primary Contact`, `Financial Contact`), and a clean modal dialog for `Internal Major/Class Transfer` requiring an explicit reason.

---

### SCREEN-07: Direktori Guru, Staf & Panel Khusus Wali Kelas (Profesor da Turma)
- **Rute Canonical:** `/staff/teachers`, `/staff/staff`
- **Aktor:** `SCHOOL_ADMIN`, `PRINCIPAL`, `CURRICULUM_ADMIN`

#### A. Struktur Layout & Komponen
1. **View Switcher Tabs:**
   - `Dewan Guru (Professores)` | `Wali Kelas (Profesor da Turma)` | `Staf Administrasi & Pendukung`
2. **Tabel Guru & Klasifikasi Resmi Timor-Leste:**
   - Filter berdasarkan status kepegawaian: `Funcionário Público (PNS)`, `Kontratadu (MEC)`, `Part-Time`, dan status aktif (`ACTIVE`, `LEAVE`, `INACTIVE`).
   - Kolom: `NIP / Employee No` (Mono), `Nama Lengkap & Gelar`, `Kategori Kepegawaian`, `Spesialisasi / Mata Pelajaran`, `Beban Jam/Minggu` (Mono, mis. `24 Jam`), `Perwalian Kelas`, dan `Status Akun Portal`.
3. **Sub-Tampilan Khusus Wali Kelas (`ProfesorDaTurmaSection`):**
   - Grid 9 Kartu Rombongan Belajar Utama NOSSEF (`10º CT-A`, `10º CT-B`, `10º CSH`, `11º CT`, `11º CSH`, `12º CT`, `12º CSH`, dst.) dengan gaya Dropbox Folder Card (`bg-white border border-[#E6E4E0] rounded-lg p-5`).
   - Setiap kartu menampilkan: Nama Rombel, Nama Wali Kelas (*Titulár de Turma*), Nomor Kontak Darurat, Nama Ketua Kelas (*Chefe de Turma*), Jumlah Siswa, Status Pengumpulan Nilai Excel, serta tombol `[Upload Valor Turma]` dan `[Export PDF/CSV]`.

#### B. Prompt Google Stitch (Salin untuk Build SCREEN-07)
> **Prompt Stitch SCREEN-07:**
> Build the Teacher Directory & Homeroom Teacher (`Profesor da Turma`) Management screen (`/staff/teachers`) in Dropbox minimalist style. Include tabs for `Semua Guru`, `Profesor da Turma (Wali Kelas)`, and `Staf Sekolah`. In the Teacher table, display monospace Employee ID, Full Name, Timor-Leste employment classification badge (`Funcionário Público`, `Kontratadu`, `Part-Time`), assigned subjects, weekly teaching hours (`24h/minggu`), and portal account status. Below or in the second tab, render a clean 3-column grid of Classroom Homeroom Cards (`10º CT-A`, `11º CT`, `12º CSH`, etc.) showing the assigned Homeroom Teacher, Class President (`Chefe de Turma`), student count, and direct buttons for `[Upload Valor Excel]` and `[Lihat Kelas]`.

---

### SCREEN-08: Konfigurasi Akademik, 3 Trimestre, CAU Mapping & Rombel
- **Rute Canonical:** `/academic/years`, `/academic/trimestres`, `/academic/subjects`, `/academic/offerings`, `/academic/classes`, `/academic/teaching-assignments`
- **Aktor:** `CURRICULUM_ADMIN`, `SCHOOL_ADMIN`, `PRINCIPAL`

#### A. Struktur Layout & Komponen
1. **Left Sub-Menu / Horizontal Tabs Akademik:**
   - `Tahun Ajaran & 3 Trimestre` | `Mata Pelajaran & Kurikulum (CT/CSH)` | `Rombel & Ruang` | `Penugasan Mengajar (Teaching Assignment)` | `Jam Pelajaran (Bell Periods)`
2. **Panel Tahun Ajaran & Kesiapan Aktivasi (`AcademicYear Activation Gate`):**
   - Menampilkan Tahun Ajaran aktif (`2026`) beserta **3 Kartu Trimestre Mengikat**:
     - `Trimestre 1` -> Terikat ke `CAU 1` (`Status: CLOSED`)
     - `Trimestre 2` -> Terikat ke `CAU 2` (`Status: ACTIVE` | Jendela Input Nilai: `10 Agu - 25 Agu 2026`)
     - `Trimestre 3` -> Terikat ke `CAU 3` (`Status: DRAFT`)
   - **Checklist Gate Aktivasi:** Indikator kesiapan sistem sebelum tahun ajaran dapat diaktifkan (3 Trimestre valid, CAU 1-3 terpetakan, Kelas X/XI/XII & IPA/IPS tersedia, Jam Pelajaran terisi).
3. **Matriks Kurikulum & Penugasan Mengajar (`SubjectOffering` & `TeachingAssignment`):**
   - Tabel pemetaan mata pelajaran per tingkat (`X, XI, XII`) dan jurusan (`IPA/CT`, `IPS/CSH`), jumlah jam tatap muka per minggu (`weekly_periods`), dan guru pengampu yang ditugaskan.

#### B. Prompt Google Stitch (Salin untuk Build SCREEN-08)
> **Prompt Stitch SCREEN-08:**
> Build the Academic Configuration & Trimester/CAU Mapping workspace (`/academic/years` and `/academic/teaching-assignments`) in Dropbox style. Display an Academic Year header (`Tahun Ajaran 2026 - ACTIVE`) with an Activation Readiness Checklist panel. Render exactly 3 side-by-side Trimester cards (`1º Trimestre -> CAU 1`, `2º Trimestre -> CAU 2`, `3º Trimestre -> CAU 3`) showing start/end dates, grade entry windows, and status badges (`CLOSED`, `ACTIVE`, `DRAFT`). Below, include a tabbed table for `Subject Offerings (IPA/IPS)` and `Teaching Assignments` mapping Teachers to Classrooms and Subjects with weekly period counts.

---

### SCREEN-09: Matriks Jadwal Pelajaran, Deteksi Bentrok & Guru Pengganti
- **Rute Canonical:** `/schedules`, `/schedules/manage`
- **Aktor:** `CURRICULUM_ADMIN` (Editor), `TEACHER`, `STUDENT`, `GUARDIAN` (Read-Only Sesuai Scope)

#### A. Struktur Layout & Komponen
1. **Top Filter & Mode Bar:**
   - Pilihan tampilan: `Per Rombel (mis. X IPA 1)` | `Per Guru` | `Per Ruangan`.
   - Tombol aksi (khusus Admin Kurikulum): `[+ Tambah Slot Jadwal]`, `[Validasi Bentrok (Dry-Run)]`, `[Catat Pengecualian / Guru Pengganti]`, dan `[Cetak PDF]`.
2. **Weekly Timetable Grid (Senin s/d Sabtu x Jam Pelajaran `BellPeriod`):**
   - Matriks berbatas garis `1px solid #E6E4E0` dengan kolom hari (`Segunda` s/d `Sábado`) dan baris urutan jam (`Jam 1: 07:30 - 08:15`, dst.).
   - Setiap sel menampilkan: Kode & Nama Mata Pelajaran, Nama Guru, Kode Ruangan (`R-102`), dan indikator khusus jika ada `ScheduleException` pada tanggal tertentu (mis. badge kuning `"Digantikan oleh Prof. José"` atau `"Dibatalkan"`).
3. **Banner Deteksi Bentrok (`Collision Engine Alert`):**
   - Jika admin mencoba menempatkan guru atau ruangan di jam yang sama, muncul panel peringatan tegas dengan kode `SCHEDULE_TEACHER_CONFLICT` atau `SCHEDULE_ROOM_CONFLICT` yang memblokir penyimpanan.

#### B. Perilaku Responsif (Mobile / Tablet / PC)
- **PC & Tablet:** Matriks grid mingguan penuh.
- **Mobile Phone:** Pemilih hari horizontal di bagian atas (`Sen`, `Sel`, `Rab`, `Kam`, `Jum`, `Sab`) diikuti daftar kartu vertikal berurutan per jam pelajaran agar tidak perlu menggeser tabel ke samping.

#### C. Prompt Google Stitch (Salin untuk Build SCREEN-09)
> **Prompt Stitch SCREEN-09:**
> Build the Weekly Class Timetable & Collision Detection screen (`/schedules/manage`) in Dropbox style. Include filter selectors for View Mode (`By Classroom`, `By Teacher`, `By Room`), Academic Year, and Classroom (`X IPA 1`). Render a clean 6-day (`Segunda` to `Sábado`) by 8-BellPeriod timetable grid with 1px `#E6E4E0` borders. Inside each cell, show Subject Name, Teacher Name, and Room badge. Show an active state for a `ScheduleException` cell (e.g., `SUBSTITUTED` badge) and a right-hand Drawer form for adding a Schedule Entry or Substitute Teacher with an inline `SCHEDULE_TEACHER_CONFLICT` validation alert box. On mobile (`<768px`), render as a day-by-day vertical timeline with a horizontal day-picker strip.

---

### SCREEN-10: Presensi Siswa (Online & Offline PWA Queue) + Resolusi Konflik
- **Rute Canonical:** `/attendance/today`, `/attendance/classes/[assignmentId]`, `/attendance/review`
- **Aktor:** `TEACHER`, `HOMEROOM_TEACHER`, `SCHOOL_ADMIN`

#### A. Struktur Layout & Komponen
1. **Session Context & PWA Sync Status Bar:**
   - Menampilkan info sesi: `Rombel: XI IPA 1` | `Mata Pelajaran: Matematika` | `Tanggal: 15 Okt 2026` | `Mode: LESSON` | `Versi Sesi: v4` | `Status: OPEN`.
   - **Indikator Offline PWA Eksplisit:**
     - Saat Online: Badge hijau `Tersinkronisasi ke Server`.
     - Saat Offline: Banner kuning tegas `Mode Offline Aktif — Perubahan disimpan di perangkat (IndexedDB) dan akan disinkronkan saat koneksi pulih [Sinkronkan Sekarang (3)]`.
   - Tombol Aksi Cepat: `[Tandai Semua Hadir]` (aksi eksplisit), `[Simpan Draf]`, dan `[Kirim Sesi (Submit)]`.
2. **Daftar Roster Siswa & Segmented Control Presensi:**
   - Setiap baris siswa menampilkan: Nomor Urut, `NIS` (Mono), `Nama Siswa`, dan **5 Tombol Pilihan Cepat (Segmented Control)** yang ramah sentuhan (`min-h-[40px]`):
     - `[H] PRESENT` (Aktif: latar `#E8F5EC`, teks `#1D783B`, border `#1D783B`)
     - `[S] SICK`
     - `[I] PERMITTED`
     - `[A] ABSENT` (Aktif: latar `#FDECEC`, teks `#C81E1E`, border `#C81E1E`)
     - `[T] LATE` (Saat dipilih, otomatis memunculkan input kecil `Menit Terlambat` dalam font mono, mis. `15 mnt`).
   - Kolom catatan singkat (`note`) di sisi kanan.
3. **Modal Resolusi Konflik Sinkronisasi (`409 ATTENDANCE_VERSION_CONFLICT`):**
   - Jika saat sinkronisasi offline ditemukan bahwa Admin telah mengubah status siswa tersebut di server, tampilkan dialog perbandingan berdampingan:
     - `Data Lokal Anda (Offline): ABSENT` vs `Data Server Saat Ini: PERMITTED (Diubah oleh TU - Surat Izin Dokter)`.
     - Tombol pilihan: `[Gunakan Data Server]` atau `[Ajukan Koreksi dengan Alasan]`.

#### B. Prompt Google Stitch (Salin untuk Build SCREEN-10)
> **Prompt Stitch SCREEN-10:**
> Build the Offline-Capable Student Attendance Recording screen (`/attendance/classes/[assignmentId]`) designed for both Mobile Phone App use in classrooms and Desktop web. Include a top session bar showing Classroom (`XI IPA 1`), Subject, Date, Session Status (`OPEN`, `v4`), an explicit PWA Offline Queue banner (`Offline Mode: 4 mutations queued in IndexedDB [Sync Now]`), and an explicit `[Mark All Present]` button. Render the student roster where each row has the student's monospace ID, full name, and a 5-button touch-friendly segmented control: `PRESENT`, `SICK`, `PERMITTED`, `ABSENT`, `LATE` (with an inline `minutes_late` numeric input when `LATE` is active). Also include a Conflict Resolution Modal (`409 ATTENDANCE_VERSION_CONFLICT`) comparing Local Offline Value vs Current Server Value side-by-side.

---

### SCREEN-11: Buku Nilai (Gradebook), CAU 1/2/3 & Upload Valor Format EXCEL
- **Rute Canonical:** `/grades/gradebook`, `/grades/assessments`, `/grades/finalization`
- **Aktor:** `TEACHER`, `HOMEROOM_TEACHER`, `CURRICULUM_ADMIN`, `PRINCIPAL`

#### A. Struktur Layout & Komponen
1. **Top Context & Action Bar:**
   - Filter: `Tahun Ajaran 2026` | `1º Trimestre (CAU 1)` | `Rombel: 10º CT-A` | `Mata Pelajaran: Física`.
   - Indikator Kelengkapan: `32/32 Siswa Dinilai` | `Skema Bobot: Total 100% (ACTIVE)` | `Status Nilai Akhir: DRAFT`.
   - **Dua Tombol Utama:**
     - `[Upload Valor Excel]` (Ikon `FileSpreadsheet`, membuka Drawer/Modal Unggah Excel Pauta Valor).
     - `[Finalisasi Nilai Trimestre]` (Ikon `Lock`, mengunci `TermGrade` menjadi `FINALIZED`).
2. **Spreadsheet-Like Gradebook Grid (Kolom Nama Sticky):**
   - Tabel bergaya spreadsheet presisi dengan garis sel `1px solid #E6E4E0`, di mana kolom `No`, `NIS`, dan `Nama Siswa` bersifat `sticky left-0 bg-white`.
   - Header komponen menampilkan nama komponen beserta persentase bobotnya:
     - `TPC / Tugas (20%)`
     - `Teste Parcial 1 (25%)`
     - `Teste Parcial 2 (25%)`
     - `CAU 1 / Ezame Trimestral (30%)` — ditandai jelas dengan badge `CAU 1`.
     - `Remedial` (Opsional/Terlacak)
     - `Nilai Akhir (Média Final)` — dihitung otoritatif oleh server dalam font `JetBrains Mono` tebal.
     - `Status / Predikat` (`Aprovado` / `Exame` / `Retido`).
   - Sel yang sedang diedit memiliki ring biru `ring-2 ring-[#0061FE]`, sel yang belum tersimpan memiliki titik kuning di sudut kanan atas, dan sel error (mis. nilai melebihi `max_score`) memiliki border merah `#C81E1E`.
3. **Modal / Drawer Khusus: Upload Nilai Siswa Format EXCEL (`Upload Valor Excel`):**
   - **Langkah 1:** Tombol `[Download Modelo Excel]` yang mengunduh template `.xlsx` berisi daftar nama siswa kelas terkait.
   - **Langkah 2:** Area *Drag-and-Drop* file `.xlsx / .csv` (maks 15 MB) bergaya Dropbox File Uploader.
   - **Langkah 3 (Pratinjau & Validasi):** Menampilkan ringkasan baris valid vs baris error sebelum disimpan.
   - **Langkah 4 (Bukti Protokol Resmi):** Setelah dikirim, menampilkan kotak konfirmasi dengan **Nomor Protokol Resmi** (`PV-NOSSEF-2026-8914`), ditujukan kepada *Diretora Geral da Escola* & *Vise-Diretora Pedagójika*, dengan status `PENDING_DIRECTOR_REVIEW`.

#### B. Prompt Google Stitch (Salin untuk Build SCREEN-11)
> **Prompt Stitch SCREEN-11:**
> Build the Spreadsheet Gradebook, CAU 1-3 Score Entry, and Excel Grade Upload screen (`/grades/gradebook`) in Dropbox style. Top bar shows filters for Academic Year, `1º Trimestre (CAU 1)`, Classroom (`10º CT-A`), Subject (`Física`), weight validation badge (`Weights: 100%`), `[Download Modelo Excel]`, `[Upload Valor Excel]`, and `[Finalize Term Grades]`. Main area is a high-precision spreadsheet table with sticky student ID/Name columns and monospace numeric score cells for `TPC (20%)`, `Teste 1 (25%)`, `Teste 2 (25%)`, `CAU 1 (30%)`, `Server Calculated Final Score`, and Status badge (`Aprovado`, `Exame`, `Retido`). Include a slide-over modal for "Submete Pauta Valor via EXCEL" featuring a Dropbox drag-and-drop `.xlsx` zone, row validation preview, and an official submission receipt showing protocol code `PV-NOSSEF-2026-8914` and status `PENDING_DIRECTOR_REVIEW`.

---

### SCREEN-12: Penerbitan Rapor Trimestre, Transkrip, Kenaikan Kelas & Ujian Nasional XII
- **Rute Canonical:** `/reports/report-cards`, `/reports/transcripts`, `/promotion`, `/national-exams`
- **Aktor:** `HOMEROOM_TEACHER`, `CURRICULUM_ADMIN`, `PRINCIPAL`, `SCHOOL_ADMIN`

#### A. Struktur Layout & Komponen
1. **Sub-Navigation Tabs:**
   - `Rapor Trimestre (Report Cards)` | `Transkrip Akademik` | `Kenaikan Kelas & Kelulusan (Promotion)` | `Ujian Nasional Kelas XII`
2. **Workspace Rapor Trimestre (`/reports/report-cards`):**
   - Bar kesiapan kelas: Menampilkan apakah seluruh mata pelajaran di kelas tersebut sudah berstatus `TermGrade: FINALIZED`. Jika belum lengkap, tombol `[Publish Rapor]` dikunci (`REPORT_NOT_READY`).
   - Tabel daftar siswa dengan status rapor (`DRAFT` -> `REVIEWED` -> `PUBLISHED` -> `REOPENED`), nomor revisi (`Rev. 1`), input catatan wali kelas (`homeroom_note`), dan tombol `[Pratinjau PDF]`.
   - **Pratinjau Rapor Resmi (Panel Kanan / Modal Cetak):** Tampilan lembaran dokumen resmi A4 NOSSEF Railaco dengan kop sekolah, identitas siswa, tabel nilai mata pelajaran dan CAU, rekapitulasi presensi (`Hadir, Sakit, Izin, Alpa`), catatan wali kelas, tanda tangan pimpinan, serta kode QR verifikasi.
3. **Workspace Kenaikan Kelas (`/promotion`):**
   - Tabel pratinjau penempatan tahun ajaran berikutnya per rombel (`X IPA 1 -> XI IPA 1`).
   - Pilihan keputusan per siswa: `PROMOTED` (Naik Kelas), `REPEATED` (Tinggal Kelas — wajib isi alasan), `GRADUATED` (Lulus — khusus Kelas XII). Jika ada perubahan jurusan (`IPA <-> IPS`), muncul input wajib `Alasan Pindah Jurusan`.
4. **Tab Ujian Nasional Kelas XII (`/national-exams`):**
   - Tabel terpisah dari CAU untuk mencatat `candidate_no`, status kepesertaan (`REGISTERED`, `ATTENDED`, `PASSED`, `FAILED`), `overall_score`, `certificate_no`, dan lampiran dokumen sertifikat resmi.

#### B. Prompt Google Stitch (Salin untuk Build SCREEN-12)
> **Prompt Stitch SCREEN-12:**
> Build the Report Card Publishing, Promotion Workflow, and Grade XII National Exam screen (`/reports/report-cards` and `/promotion`) in Dropbox minimalist style. Include 4 top tabs: `Rapor Trimestre`, `Transkrip`, `Kenaikan Kelas (Promotion)`, and `Ujian Nasional XII`. On the left, display the class roster showing TermGrade readiness (`8/8 Subjects Finalized`), Report Card status (`DRAFT`, `REVIEWED`, `PUBLISHED`), revision number (`Rev. 1`), and Homeroom Note editor. On the right, display a clean A4 paper preview of the official NOSSEF Trimester Report Card with school header, monospace grades table, attendance snapshot, and QR verification box, plus top action buttons `[Generate Bulk PDF]`, `[Publish Report Card]`, and `[Reopen with Reason]`.

---

### SCREEN-13: Keuangan Sekolah — Tagihan SPP, Kasir, Verifikasi Bank & Reversal
- **Rute Canonical:** `/finance`, `/finance/fee-plans`, `/finance/invoices`, `/finance/payments`, `/finance/payments/pending`, `/finance/arrears`
- **Aktor:** `FINANCE_ADMIN` (Read/Write), `PRINCIPAL` (Read Aggregate)

#### A. Struktur Layout & Komponen
1. **Sub-Navigation Tabs Keuangan:**
   - `Ringkasan & Kasir` | `Daftar Invoice SPP` | `Verifikasi Transfer Bank (Pending)` | `Tunggakan (Arrears)` | `Tarif Resmi & Beasiswa (Fee Plans)`
2. **Workspace Invoice & Generate SPP Bulanan (`/finance/invoices`):**
   - Tombol aksi `[Dry-Run Preview SPP Bulanan]` dan `[Generate Invoice SPP]`.
   - Tabel Invoice: `No. Invoice` (Mono, mis. `INV-2026-00412`), `Nama Siswa & Rombel`, `Periode / Etapa`, `Subtotal`, `Diskon/Beasiswa`, `Total Tagihan (USD)`, `Terbayar (USD)`, `Sisa Saldo / Balance (USD)` (semua angka uang wajib dalam `JetBrains Mono`), dan Status (`UNPAID`, `PARTIALLY_PAID`, `PAID`, `VOID`).
3. **Meja Kasir & Alokasi Pembayaran (`/finance/payments`):**
   - Form penerimaan pembayaran tunai (`CASH`) atau transfer (`BANK_TRANSFER`):
     - Pilih Siswa -> Sistem otomatis menampilkan daftar Invoice yang belum lunas (`UNPAID` / `PARTIALLY_PAID`).
     - Input nominal bayar (`USD Decimal`) -> Sistem mengalokasikan ke invoice (`PaymentAllocation`) dengan proteksi anti-overpayment (`PAYMENT_OVERALLOCATION`).
     - Setelah disimpan, langsung menghasilkan Kwitansi Resmi (`Receipt` snapshot) siap cetak.
4. **Antrean Verifikasi Bukti Transfer Bank (`/finance/payments/pending`):**
   - Layout Split-View: Daftar pembayaran berstatus `PENDING` di kiri, dan pratinjau gambar bukti transfer bank (`BNU Timor`, `Mandiri Dili`, `Telemor Mosan`) di kanan (`FinanceImageModal` / Inspector) dengan tombol tegas `[Verifikasi & Terbitkan Kwitansi]` atau `[Tolak Bukti]`.
5. **Modal Reversal Pembayaran (`PaymentReversal` — Tanpa Hard Delete):**
   - Tombol `[Reverse Payment]` pada pembayaran berstatus `VERIFIED` yang membuka dialog konfirmasi dengan field wajib `Alasan Reversal` untuk mengembalikan saldo tagihan secara transaksional.

#### B. Prompt Google Stitch (Salin untuk Build SCREEN-13)
> **Prompt Stitch SCREEN-13:**
> Build the School Finance, SPP Billing, Cashier Allocation, and Bank Transfer Verification workspace (`/finance`) in Dropbox enterprise style. All currency values must be in USD (`$148.50`) using `JetBrains Mono` tabular font. Include tabs for `Invoices SPP`, `Kasir (Receive Payment)`, `Verifikasi Bank (Pending)`, `Tunggakan (Arrears)`, and `Tabel Biaya (Fee Plans)`. Show the Invoice Table with columns: `Invoice No`, `Student & Class`, `Billing Period`, `Total`, `Paid`, `Balance`, and status badge (`UNPAID`, `PARTIALLY_PAID`, `PAID`, `VOID`). In the Right Inspector Panel, display the Bank Transfer Proof Verification view showing the uploaded bank receipt image (BNU/Mandiri/Mosan), payment allocation breakdown, and buttons for `[Verify Payment & Issue Receipt]` or `[Reverse Payment with Reason]`.

---

### SCREEN-14: Bimbingan Konseling (BK Restricted) & Catatan Kedisiplinan
- **Rute Canonical:** `/counseling`, `/counseling/[id]`, `/discipline`
- **Aktor:** `COUNSELOR` (Akses Penuh BK), `PRINCIPAL` (Authorized), `HOMEROOM_TEACHER` (Ringkasan Non-Sensitif & Disiplin Kelas)

#### A. Struktur Layout & Komponen
1. **Banner Kerahasiaan Data (`Restricted Scope Banner`):**
   - Strip informasi tipis di bagian atas: `"Akses Terbatas (Restricted): Catatan konseling bersifat rahasia dan setiap pembukaan kasus dicatat dalam Audit Log."` (Ikon `ShieldAlert`).
2. **Two-Tab Workspace:**
   - `Kasus Konseling (Counseling Cases)` | `Insiden Kedisiplinan (Discipline Incidents)`
3. **Daftar Kasus & Detail Tindak Lanjut (`/counseling/[id]`):**
   - Tabel kasus dengan kolom: `No. Kasus` (Mono), `Siswa & Kelas`, `Kategori`, `Tingkat Urgensi` (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), `Konselor Penanggung Jawab`, dan `Status` (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`).
   - Panel Detail Kasus menampilkan kronologi rahasia (hanya untuk role `COUNSELOR`), daftar catatan tindak lanjut (`CounselingFollowUp` yang bersifat *append-only*), jadwal pertemuan orang tua, dan lampiran dokumen privasi.
4. **Workspace Kedisiplinan (`/discipline`):**
   - Form dan tabel pelaporan pelanggaran tata tertib (`occurred_at`, `category`, `severity`, `action_taken`, `status: OPEN / RESOLVED / VOID`).

#### B. Prompt Google Stitch (Salin untuk Build SCREEN-14)
> **Prompt Stitch SCREEN-14:**
> Build the Restricted Counseling (`BK`) and Student Discipline workspace (`/counseling` and `/discipline`) in Dropbox minimalist style. Include a subtle security notice banner at the top with a `Shield` Lucide icon indicating `COUNSELING_CASE_ACCESSED` audit logging. Display a master table of Counseling Cases with monospace `case_no`, Student Name, Category, Severity badge (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), Status (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`), and Assigned Counselor. On the right, show the Case Detail & Append-Only Follow-Up Timeline with a button to `[Add Follow-Up Note]` and `[Log Guardian Communication]`.

---

### SCREEN-15: Organisasi Khas NOSSEF & Ekstrakurikuler (KORENOSSEF, Pastoral, Drum Band)
- **Rute Canonical:** `/extracurricular`, `/extracurricular/manage`
- **Aktor:** Pembina Ekstrakurikuler, `SCHOOL_ADMIN`, `PRINCIPAL`, `STUDENT`

#### A. Struktur Layout & Komponen
1. **Header & Filter Unit Kegiatan:**
   - Tab navigasi unit kebanggaan NOSSEF Railaco:
     - `Semua Unit`
     - `KORENOSSEF (Dewan Kepemimpinan Siswa)`
     - `Ekipa Pastoral Eskolár (Liturgi, Koor, Acólitos, Karitas)`
     - `Ekipa Drum Band / Fanfarra`
     - `Olahraga & Klub Akademik`
2. **Kartu Unit & Tabel Keanggotaan (`ExtracurricularMembership`):**
   - Panel atas menampilkan informasi unit: Nama Kegiatan, Guru Pembina (`advisor_teacher_id`), Kuota Kapasitas (`45/50 Anggota Aktif`), dan tombol `[+ Daftarkan Siswa]`, `[Catat Presensi Kegiatan]`, serta `[Cetak Sertifikat Kepemimpinan]`.
   - Tabel anggota di bawahnya menampilkan: `NIS` (Mono), `Nama Siswa`, `Kelas/Jurusan`, `Divisi / Peran` (mis. *Naipe Snare Drum*, *Mayorette*, *Divisi Liturgi*, *Pengurus Inti KORENOSSEF*), `Tanggal Bergabung`, dan `Status Keanggotaan` (`ACTIVE`, `COMPLETED`, `WITHDRAWN`).

#### B. Prompt Google Stitch (Salin untuk Build SCREEN-15)
> **Prompt Stitch SCREEN-15:**
> Build the NOSSEF Extracurricular & Student Organizations screen (`/extracurricular/manage`) in Dropbox style. Feature dedicated category tabs for NOSSEF's signature programs: `KORENOSSEF (Student Leadership Council)`, `Ekipa Pastoral Eskolár`, `Ekipa Drum Band / Fanfarra`, and `Klub Lainnya`. Include an Activity Summary header showing Advisor Teacher, Member Capacity (`45 / 50 Active`), and action buttons `[+ Add Member]`, `[Record Activity Attendance]`, and `[Generate Certificate]`. Below, render the Member & Attendance table showing monospace Student ID, Name, Classroom, assigned Division/Role (e.g., `Acólitos`, `Snare Percussion`, `Presidente KORENOSSEF`), Join Date, and Membership Status.

---

### SCREEN-16: Perpustakaan Sekolah — Katalog Buku, Salinan Fisik & Sirkulasi Peminjaman
- **Rute Canonical:** `/library`, `/library/circulation`, `/library/manage`
- **Aktor:** `LIBRARIAN`, `STUDENT` (Pinjaman Sendiri), `TEACHER`

#### A. Struktur Layout & Komponen
1. **Sub-Navigation Tabs Perpustakaan:**
   - `Meja Sirkulasi (Checkout & Return)` | `Katalog Judul Buku (Books)` | `Salinan Fisik & Barcode (Copies)` | `Daftar Terlambat (Overdue)`
2. **Meja Sirkulasi Cepat (`/library/circulation`):**
   - Dua panel aksi berdampingan di bagian atas:
     - **Peminjaman Baru (`Checkout`):** Input scan/ketik `Barcode Salinan Buku` (`JetBrains Mono`, mis. `BC-NOS-00841`) + Pilih Peminjam (`Siswa` atau `Guru`) + Tanggal Jatuh Tempo (`due_at`) -> Tombol `[Proses Pinjam]`.
     - **Pengembalian / Perpanjangan (`Return / Renew`):** Input `Barcode` -> Menampilkan detail pinjaman terbuka (`OPEN` / `OVERDUE`), nominal denda opsional (`USD`), kondisi buku saat kembali (`GOOD`, `DAMAGED`, `LOST`), serta tombol `[Kembalikan Buku]` dan `[Perpanjang (Renew)]`.
3. **Tabel Katalog & Status Salinan individual (`LibraryBook` & `LibraryCopy`):**
   - Menampilkan `ISBN`, `Judul Buku`, `Penulis`, `Kategori`, dan rincian jumlah salinan berdasarkan status (`AVAILABLE: 4`, `ON_LOAN: 2`, `REPAIR: 1`).

#### B. Prompt Google Stitch (Salin untuk Build SCREEN-16)
> **Prompt Stitch SCREEN-16:**
> Build the School Library Catalog & Circulation Desk screen (`/library/circulation`) in Dropbox minimalist style. Top section features a fast Circulation Desk with two side-by-side action panels: (1) Quick Checkout (Barcode input in monospace, Borrower selector for Student/Teacher, Due Date, `[Checkout Copy]` button) and (2) Quick Return/Renew. Below, render the Library Loans & Physical Copies table with filter tabs (`Open Loans`, `Overdue`, `Book Catalog`, `Physical Copies by Barcode`). Columns include `Copy Barcode` (mono), `Book Title & ISBN`, `Borrower Name & Class`, `Borrowed Date`, `Due Date`, `Fine (USD)`, and Status badge (`AVAILABLE`, `ON_LOAN`, `OVERDUE`, `LOST`).

---

### SCREEN-17: Inventaris Sarana Prasarana & Pemeliharaan Aset
- **Rute Canonical:** `/assets`, `/assets/[id]`
- **Aktor:** `ASSET_OFFICER`, `SCHOOL_ADMIN`, `PRINCIPAL`

#### A. Struktur Layout & Komponen
1. **Filter & Action Bar:**
   - Filter Kategori (`Laboratorium IPA`, `Komputer & IT`, `Perabot Kelas`, `Alat Musik Drum Band`), Filter Kondisi (`GOOD`, `FAIR`, `DAMAGED`, `REPAIR`, `LOST`), Filter Status (`AVAILABLE`, `ASSIGNED`, `MAINTENANCE`, `RETIRED`), dan tombol `[+ Registrasi Aset Baru]`.
2. **Tabel Register Aset (`Asset`):**
   - Kolom: `Kode Aset` (`asset_no` dalam font mono, mis. `AST-LAB-2026-014`), `Nama Barang & No. Seri`, `Kategori`, `Lokasi Ruangan` (`Room`), `Pemegang Saat Ini` (Guru/Staf/Ruang), `Kondisi`, `Nilai Perolehan (USD)`, dan `Status`.
3. **Right Inspector Drawer (`/assets/[id]`):**
   - Menampilkan detail aset, tombol `[Serah Terima / Assign Aset]`, `[Catat Pemeliharaan (Maintenance)]`, `[Pensiunkan Aset (Retire)]`, serta linimasa riwayat penugasan (`AssetAssignment`) dan servis (`AssetMaintenance`).

#### B. Prompt Google Stitch (Salin untuk Build SCREEN-17)
> **Prompt Stitch SCREEN-17:**
> Build the School Asset Register & Maintenance Tracking screen (`/assets`) in Dropbox style. Include filters for Asset Category, Room Location, Condition (`GOOD`, `FAIR`, `DAMAGED`), and Status (`AVAILABLE`, `ASSIGNED`, `MAINTENANCE`, `RETIRED`). Render the Asset table with monospace `asset_no`, Asset Name, Serial Number, Location Room, Current Assignee, Acquisition Cost in USD, Condition badge, and Status pill. Include a Right Inspector Drawer showing active assignment details, maintenance history logs, and action buttons for `[Assign Asset]`, `[Record Maintenance]`, and `[Retire Asset]`.

---

### SCREEN-18: Pengumuman Sekolah, Kalender Akademik & Kotak Masuk Notifikasi
- **Rute Canonical:** `/announcements`, `/communications/announcements`, `/notifications`, `/academic/calendar`
- **Aktor:** Semua Pengguna (Sesuai Target Audiens)

#### A. Struktur Layout & Komponen
1. **Papan Pengumuman & Editor Audiens (`/communications/announcements`):**
   - Daftar pengumuman dengan badge target audiens (`ALL`, `ROLE: TEACHER`, `GRADE: XII`, `MAJOR: IPA`, `CLASS: X IPA 1`, `GUARDIAN`), status (`DRAFT`, `SCHEDULED`, `PUBLISHED`), dan waktu terbit (`publish_at`).
   - Drawer/Modal Pembuatan Pengumuman: Input Judul, Isi Pengumuman (teks bersih terformat), Pemilih Target Audiens Bertingkat, Jadwal Terbit, Lampiran File Resmi, dan opsi kirim Web Push.
2. **Kotak Masuk Notifikasi (`/notifications`):**
   - Daftar umpan notifikasi kronologis (cursor-paginated) dengan penanda belum dibaca (titik biru `#0061FE` di kiri), kategori event (`attendance.absent`, `finance.payment.verified`, `report_card.published`), waktu relatif, dan tombol `[Tandai Semua Dibaca]`.
   - Pengaturan Perangkat Web Push (`PushSubscription`): Tombol aktifkan/nonaktifkan notifikasi perangkat ini.

#### B. Prompt Google Stitch (Salin untuk Build SCREEN-18)
> **Prompt Stitch SCREEN-18:**
> Build the School Announcements & Notification Center (`/announcements` and `/notifications`) in Dropbox style. Split into two switchable views: (1) Announcements Workspace with an audience-targeted list (`ALL`, `GRADE XII`, `GUARDIAN`, `TEACHER`), status badges (`PUBLISHED`, `SCHEDULED`, `DRAFT`), and a clean composer drawer with audience selector and file attachment; (2) Notification Inbox showing user notifications with unread blue dot indicators (`#0061FE`), safe non-sensitive summaries for attendance/finance/report events, deep-link action buttons, and a Web Push device subscription toggle.

---

### SCREEN-19: Pusat Laporan (Canonical Reports), Impor Massal & Antrean Background Jobs
- **Rute Canonical:** `/reports`, `/imports`, `/admin/jobs`
- **Aktor:** `SCHOOL_ADMIN`, `CURRICULUM_ADMIN`, `FINANCE_ADMIN`, `PRINCIPAL`

#### A. Struktur Layout & Komponen
1. **Katalog Laporan Resmi (`/reports` — `ADM-01` s/d `EXT-01`):**
   - Daftar laporan terstruktur per domain (Pendaftaran, Siswa, Presensi, Akademik, Nilai/CAU, Rapor, Keuangan SPP, Perpustakaan, Aset) dengan kode laporan dalam font mono (`STU-01`, `ATT-02`, `GRD-02`, `FIN-03`, dst.).
   - Mengetuk satu laporan membuka panel parameter (`Tahun Ajaran`, `Trimestre`, `Kelas`, `Rentang Tanggal`, `Format: PDF / XLSX / CSV`) dan tombol `[Jalankan Laporan (Async Job)]`.
2. **Pipeline Impor Data 4-Tahap (`/imports`):**
   - **Tahap 1 (`UPLOAD`):** Pilih jenis impor (`STUDENTS`, `TEACHERS`, `SCORES`, `LIBRARY_BOOKS`) dan unggah file template `.xlsx / .csv`.
   - **Tahap 2 (`PREVIEW & VALIDATION`):** Menampilkan ringkasan `Total Baris: 120` | `Baris Valid: 118` | `Baris Error: 2`.
   - **Tahap 3 (`ERROR INSPECTOR`):** Tabel khusus `ImportRowError` yang menampilkan `Nomor Baris`, `Nama Kolom`, `Kode Error` (`ASSESSMENT_SCORE_OUT_OF_RANGE`), dan `Pesan Perbaikan`. Tombol `[Konfirmasi & Eksekusi Impor]` hanya aktif untuk baris yang valid sesuai aturan.
   - **Tahap 4 (`RESULT`):** Status pengerjaan Celery dan tautan unduh file laporan hasil impor.
3. **Monitor Antrean Background Jobs (`/admin/jobs`):**
   - Tabel status `ReportJob` dan `ImportJob` (`QUEUED`, `RUNNING 65%`, `SUCCEEDED`, `FAILED`) lengkap dengan tombol `[Unduh Hasil]` (signed URL) atau `[Coba Lagi (Requeue)]`.

#### B. Prompt Google Stitch (Salin untuk Build SCREEN-19)
> **Prompt Stitch SCREEN-19:**
> Build the Canonical Reports Catalog, 4-Step Bulk Import Pipeline, and Async Job Monitor (`/reports`, `/imports`, `/admin/jobs`) in Dropbox style. Include: (1) A categorized table of Canonical Reports (`ADM-01`, `STU-01`, `ATT-01`, `GRD-02`, `FIN-03`) with parameter selectors and `[Generate PDF/XLSX]` buttons, (2) A 4-step Import Wizard (`1. Upload Template -> 2. Validate & Preview -> 3. Confirm Import -> 4. Result`) displaying summary counters (`Total Rows`, `Valid Rows`, `Invalid Rows`) and an `ImportRowError` table highlighting exact row numbers and field errors before any database write occurs, and (3) An Async Job queue table with progress bars (`RUNNING 70%`, `SUCCEEDED`) and authorized download buttons.

---

### SCREEN-20: Administrasi Sistem, Kontrol Pengguna (RBAC), Profil Sekolah & Log Audit Forensik
- **Rute Canonical:** `/admin/users`, `/admin/roles`, `/admin/school`, `/admin/audit`
- **Aktor:** `SUPER_ADMIN`, `SCHOOL_ADMIN`, `PRINCIPAL` (Audit Read-Only)

#### A. Struktur Layout & Komponen
1. **Manajemen Akun & Multi-Role (`/admin/users` & `/admin/roles`):**
   - Tabel pengguna dengan kolom: `Username`, `Email`, `Profil Terkait` (Guru/Staf/Siswa/Wali), `Peran Aktif` (badge `TEACHER`, `HOMEROOM_TEACHER`, `FINANCE_ADMIN`, dll.), `Login Terakhir`, dan `Status Akun` (`ACTIVE`, `SUSPENDED`, `DISABLED`).
   - Aksi cepat untuk menonaktifkan akun (langsung mencabut sesi aktif), mengatur masa berlaku peran (`valid_from` - `valid_until`), dan mereset kata sandi.
2. **Konfigurasi Identitas Sekolah (`/admin/school` — `SchoolProfile` Singleton):**
   - Pengaturan nama resmi sekolah, alamat di Kotamadya Ermera, logo resmi, zona waktu (`Asia/Dili`), mata uang (`USD`), bahasa default (`tet`/`pt`/`id`), dan struktur organisasi interaktif (`EstruturaEskolaNossef`).
3. **Penjelajah Log Audit Forensik (`/admin/audit` — *Strictly Read-Only*):**
   - Tabel berkecepatan tinggi dengan cursor pagination, filter `event_type` (`TERM_GRADE_REOPENED`, `PAYMENT_REVERSED`, `ROLE_ASSIGNED`, `COUNSELING_CASE_ACCESSED`), filter `actor`, dan rentang waktu.
   - Mengetuk baris log membuka **Right Inspector Drawer** yang menampilkan perbandingan JSON `before` vs `after` dalam blok kode monospace bersih, `request_id`, dan alamat IP. Tidak ada tombol edit atau hapus sama sekali.

#### B. Prompt Google Stitch (Salin untuk Build SCREEN-20)
> **Prompt Stitch SCREEN-20:**
> Build the System Administration, RBAC User Control, and Immutable Forensic Audit Log Viewer (`/admin/users` and `/admin/audit`) in Dropbox enterprise style. Include tabs for `Users & Roles`, `School Profile Settings`, and `Forensic Audit Logs`. In the Audit Log view, render a read-only cursor-paginated table with monospace timestamps (`Asia/Dili`), `event_type` badges (`PAYMENT_REVERSED`, `TERM_GRADE_REOPENED`, `ROLE_ASSIGNED`), Actor username, Target Resource, and Correlation `request_id`. In the Right Inspector Panel, show a clean monospace JSON diff viewer comparing `before` and `after` snapshots without any edit or delete controls.

---

### SCREEN-21: Portal Mandiri Siswa (Read-Only Student PWA Experience)
- **Rute Canonical:** `/student/home`, `/student/schedule`, `/student/attendance`, `/student/grades`, `/student/report-cards`, `/student/finance`, `/student/library`
- **Aktor:** `STUDENT` (*Strictly Read-Only* — Hanya Data Milik Sendiri)

#### A. Struktur Layout & Komponen
1. **Header Identitas & Kartu Pelajar Digital:**
   - Menampilkan sapaan nama siswa, kelas aktif (`12º CT — Tahun Ajaran 2026`), dan tombol `[Tampilkan Kartu Pelajar QR]` yang membuka kartu identitas digital layar penuh saat dibutuhkan di perpustakaan atau gerbang sekolah.
2. **Ringkasan Akademik & Keuangan Pribadi (4 Panel Bersih):**
   - `Jadwal Hari Ini`: Daftar mata pelajaran berikutnya beserta ruangan dan nama guru.
   - `Rekap Kehadiran Trimestre Ini`: Persentase hadir dan rincian jumlah `Hadir`, `Sakit`, `Izin`, `Alpa`.
   - `Nilai & Rapor Terbit`: Daftar nilai `CAU 1/2/3` dan tombol unduh PDF Rapor resmi yang sudah berstatus `PUBLISHED`.
   - `Status SPP & Pinjaman Buku`: Sisa tagihan SPP (`USD`) beserta tombol `[Unggah Bukti Transfer Bank]`, dan daftar buku perpustakaan yang sedang dipinjam beserta tanggal jatuh tempo.
3. **Navigasi Bawah (Mobile First):**
   - `Beranda` (`Home`) | `Jadwal` (`Calendar`) | `Nilai & Rapor` (`Award`) | `SPP` (`CreditCard`) | `Profil` (`User`).

#### B. Prompt Google Stitch (Salin untuk Build SCREEN-21)
> **Prompt Stitch SCREEN-21:**
> Build the Student Self-Service Portal (`/student/home`) optimized as a mobile-first PWA and clean desktop web view in Dropbox style. Strictly read-only except for leave requests and bank transfer proof uploads. Include a top digital Student ID summary banner with a `[Show QR ID Card]` button, followed by 4 clean workspace sections: (1) Today's Class Schedule timeline, (2) Trimester Attendance Summary (`Present`, `Sick`, `Permitted`, `Absent`), (3) Published Grades & downloadable PDF Report Cards (`1º, 2º, 3º Trimestre`), and (4) Personal SPP Invoice Status in USD with an `[Upload Bank Transfer Proof]` button. Include the 5-tab mobile bottom navigation bar.

---

### SCREEN-22: Portal Orang Tua / Wali dengan Pemindah Anak (Guardian Child-Switcher Portal)
- **Rute Canonical:** `/guardian/home`, `/guardian/children/[id]/attendance`, `/guardian/children/[id]/report-cards`, `/guardian/children/[id]/finance`
- **Aktor:** `GUARDIAN` (*Inan-Aman* — Hanya Siswa yang Terhubung Aktif di `StudentGuardian`)

#### A. Struktur Layout & Komponen
1. **Child Switcher Bar (Komponen Kunci di Bagian Atas):**
   - Jika orang tua memiliki lebih dari satu anak yang bersekolah di NOSSEF Railaco, bagian atas menampilkan pil pemilih anak yang sangat jelas:
     - `[ Aktif: Maria da Costa (XI IPA 1) ]` | `[ João da Costa (X IPS 1) ]`
   - Mengganti tab anak secara instan memperbarui seluruh data kehadiran, rapor, dan tagihan SPP di layar sesuai `student_id` yang dipilih.
2. **Kartu Kontak Resmi Wali Kelas (`Profesor da Turma`):**
   - Menampilkan nama Wali Kelas anak tersebut, jadwal konsultasi, dan tombol kontak resmi sekolah.
3. **Panel Pemantauan Anak:**
   - **Status Kehadiran Harian:** Menampilkan apakah anak hadir hari ini (`Hadir pukul 07:25`) dan riwayat ketidakhadiran beserta tombol `[Ajukan Surat Izin/Sakit Anak]`.
   - **Tagihan & Riwayat Pembayaran SPP (USD):** Menampilkan tagihan Etapa 1 / Etapa 2 atau bulanan, jumlah yang sudah dibayar, sisa tunggakan, tombol `[Unduh Kwitansi Resmi PDF]`, dan tombol `[Unggah Bukti Transfer Bank]`.
   - **Rapor Resmi Trimestre:** Daftar rapor anak yang telah diterbitkan (`PUBLISHED`) siap diunduh dalam format PDF.

#### B. Prompt Google Stitch (Salin untuk Build SCREEN-22)
> **Prompt Stitch SCREEN-22:**
> Build the Parent/Guardian Portal (`/guardian/home`) in Dropbox minimalist style, designed for mobile phone app convenience and desktop clarity. Feature a prominent top "Child Switcher" bar allowing parents with multiple children at NOSSEF to switch active context (e.g., `Maria da Costa - XI IPA 1` vs `João da Costa - X IPS 1`). Below, display: (1) Today's live attendance status for the selected child + `[Submit Sick/Leave Request]` button, (2) Official Homeroom Teacher (`Profesor da Turma`) contact card, (3) SPP Fee & Invoice statement in USD (`JetBrains Mono`) with `[Download Official Receipt PDF]` and `[Upload Bank Proof]`, and (4) Published Trimester Report Cards ready for PDF download.

---

## 4. KONTRAK STATE HALAMAN & KOMPONEN GLOBAL (MANDATORY UI STATES)

Setiap tampilan (`SCREEN-01` s/d `SCREEN-22`) ketika dibangun wajib menyertakan 5 state visual berikut dengan gaya Dropbox:

1. **Loading State (Skeleton):** Garis abu-abu hangat (`bg-[#E6E4E0]/60 animate-pulse rounded`) yang mengikuti bentuk baris tabel tanpa spinner berputar yang mengganggu di tengah layar.
2. **Empty State:** Kotak bersih di tengah area tabel dengan satu ikon garis Lucide (`FolderOpen` atau `FileText`, ukuran `32px`, warna `#8C8275`), satu kalimat penjelas lugas, dan satu tombol aksi utama (jika peran memiliki hak buat data).
3. **Offline / Queued State:** Strip indikator di bagian atas tabel (`bg-[#FEF4E6] text-[#9E5800] border-b border-[#E6E4E0] px-4 py-2 text-xs font-medium flex items-center justify-between`) yang menampilkan jumlah perubahan di IndexedDB dan tombol `[Coba Sinkronkan]`.
4. **Permission / Scope Denied State (`403`):** Panel peringatan minimalis dengan ikon `Lock` (`#524A3E`), kode referensi `OBJECT_SCOPE_DENIED` atau `PERMISSION_DENIED`, dan tombol kembali ke `/dashboard`.
5. **Confirmation Dialog untuk Operasi Transaksional:** Setiap aksi finalisasi nilai (`grade.finalize`), penerbitan rapor (`report.publish`), kenaikan kelas (`promotion.execute`), verifikasi pembayaran (`finance.verify_payment`), dan pembalikan transaksi (`finance.reverse_payment`) wajib memunculkan modal konfirmasi berbatas tegas yang merinci dampak aksi dan mewajibkan input alasan (`reason`) bila dipersyaratkan oleh PRD.