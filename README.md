# Republik Jomokerto

Portal komunitas hiburan, generator **Kartu Tanda Penjomok (KTP)** berbasis template, Link-in-Bio warga, Timeline teks & gambar, ruang Chat real-time, Peta Hybrid (Google Maps + Atlas Dunia Game), serta asisten **Gemini AI**. Dirancang sebagai prototipe SaaS yang persisten di **Vercel** (via **Prisma Postgres** / `POSTGRES_URL`) sekaligus siap di-**self-host** menggunakan SQLite lokal (`data/jomokerto.db`).

---

## Fitur Utama

1. **Registrasi, Login, Reset Password & Google SSO**
   - Pendaftaran menggunakan `username`, `email` (opsional, untuk self-reset password & notifikasi), `password`, dan foto profil opsional (otomatis memakai avatar default jika tidak diunggah).
   - Mendukung **Google SSO** via Google Identity Token verification maupun mode prototipe self-host.
   - Alur **Self-Reset Password** menggunakan email pemulihan.
2. **Kartu Tanda Penjomok (KTP) Berbasis Template**
   - Tidak memanggil AI untuk setiap pembuatan kartu — kartu dicetak instan memakai template SVG/HTML/Canvas eksklusif yang berbeda dari KTP/SIM resmi Indonesia.
   - Semua kolom diisi bebas oleh pengguna. Melengkapi profil setelah daftar tidak diwajibkan untuk akun Guest, namun **wajib** jika ingin mencetak KTP dan naik status menjadi Member.
   - Lokasi default: **`NGAWI`**, dan bebas memilih lokasi dunia nyata maupun fiktif dari game (misalnya *Sumeru — Genshin Impact*, *Mondstadt Tavern*, *Los Santos*).
   - Dilengkapi kode QR dan tautan **Link-in-Bio** (Instagram, X, Discord, TikTok, YouTube, GitHub, Website) serta unduhan kartu format PNG.
3. **Timeline Postingan Warga (Teks & Gambar Saja)**
   - Mendukung teks dan seluruh varian MIME gambar ramah CDN (`image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif`, `image/svg+xml`, `image/bmp`, `image/tiff`).
   - Menolak file multimedia non-gambar (video, audio, dokumen).
   - Terintegrasi dengan **Studio Gambar AI** (8 rasio aspek: `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `9:16`, `16:9`, `21:9`).
4. **Chat Antar Warga & Bupati AI**
   - Kanal publik (`#alun-alun-ngawi`, `#sumeru-tavern`, `#lfg-mabar`) dan Direct Message (DM) antar warga via WebSocket (`/ws`) dengan fallback HTTP polling otomatis di Vercel.
   - Kanal **Bupati AI** ditenagai server-side `@google/genai` (`gemini-4-hydrogen`).
5. **Peta Interaktif Hybrid (Google Maps + Dunia Game)**
   - **Peta Dunia Nyata**: Google Maps (`@vis.gl/react-google-maps`) dengan `AdvancedMarkerElement` dan pencarian tempat berbasis **Maps Grounding** (`gemini-4-hydrogen`).
   - **Atlas Dunia Game**: Peta kanvas interaktif untuk menyematkan pin komunitas pada dunia fiktif seperti *Ngawi Prime*, *Sumeru*, *Mondstadt*, dan *Inazuma*.
6. **Sistem Peran (RBAC)**
   - `superadmin` / `dev`: Kelola seluruh peran pengguna, moderasi, verifikasi KTP, ekspor `.db.json`.
   - `admin`: Verifikasi KTP warga dan moderasi konten.
   - `member`: Warga terdaftar yang telah mencetak KTP.
   - `guest`: Akun terdaftar yang belum mencetak KTP.
   - `public`: Pengunjung non-login.

---

## Akun Uji Coba (Prototipe)

Semua akun bawaan pada `data/jomokerto-seed.db.json` menggunakan password: `password123`

| Username | Peran | Domisili KTP |
| :--- | :--- | :--- |
| `presiden_jomok` | `superadmin` | `NGAWI` |
| `menteri_ngawi` | `admin` | `NGAWI SELATAN` |
| `nahida_ngawi` | `member` | `Sumeru — Genshin Impact` |
| `mas_rusdi_warnet` | `member` | `Inazuma — Sektor Warnet` |
| `warga_pendatang` | `guest` | *(Belum cetak KTP)* |

---

## Quick Start (Lokal)

```bash
npm install
cp .env.example .env
npm run dev
```

Buka `http://localhost:3000`. Database SQLite lokal akan otomatis dibuat di `data/jomokerto.db` dari `data/jomokerto-seed.db.json`.

## Dokumen Pendukung

- [ARCHITECTURE.md](./ARCHITECTURE.md) — Arsitektur sistem, RBAC, & strategi dual `.db`
- [DEPLOYMENT_VERCEL.md](./DEPLOYMENT_VERCEL.md) — Panduan deploy ke Vercel tanpa Firebase
- [SELF_HOSTING.md](./SELF_HOSTING.md) — Panduan self-hosting VPS, Node.js, & Reverse Proxy WebSocket
- [API_DOCS.md](./API_DOCS.md) — Referensi lengkap endpoint REST & event WebSocket
