# Panduan Deployment ke Vercel (dengan Prisma Postgres)

Republik Jomokerto dirancang agar dapat langsung di-deploy ke **Vercel** (tanpa Firebase) menggunakan konfigurasi `vercel.json`, `api/index.ts`, dan database **Vercel Prisma Postgres** (serta fallback `.db` untuk pengembangan lokal).

---

## 1. Cara Kerja Persistensi di Vercel

Vercel Serverless Functions bersifat *stateless* — setiap cold start atau pergantian container akan mereset direktori `/tmp`. Karena itu, `server/db.ts` menggunakan prioritas adapter 3-lapis otomatis:

1. **PostgreSQL / Vercel Prisma Postgres (`postgres`) — Wajib untuk Produksi Vercel**
   - Aktif otomatis apabila `DATABASE_URL_POOLED`, `POSTGRES_URL`, `DATABASE_URL`, atau URL `postgres://` tersedia di Environment Variables.
   - Menggunakan driver `pg` (`Pool`) tanpa perlu langkah build Prisma CLI tambahan.
   - Saat permintaan pertama masuk, `server/db.ts` otomatis membuat seluruh tabel (`users`, `profiles_ktp`, `posts`, `post_likes`, `chat_rooms`, `chat_messages`, `map_pins`, `password_resets`) dan menyalin seed awal dari `data/jomokerto-seed.db.json` apabila tabel `users` masih kosong.
   - Semua data user baru, KTP, chat, postingan timeline, like, dan pin peta tersimpan **permanen** di database Postgres meski halaman di-refresh atau container serverless restart.

2. **SQLite Lokal (`sqlite`) — Self-Host / Lokal**
   - Aktif otomatis saat menjalankan `npm run dev` atau `npm start` tanpa koneksi Postgres, menulis langsung ke berkas `data/jomokerto.db` (`journal_mode = DELETE`, `synchronous = FULL`).

3. **Fallback JSON (`vercel-json`)**
   - Hanya aktif apabila belum ada `POSTGRES_URL` / `DATABASE_URL_POOLED` di Vercel. Penyimpanan jatuh ke `/tmp/jomokerto.db.json` (data hilang saat container restart).

---

## 2. Langkah Menghubungkan Prisma Postgres & Deploy

1. Buka dashboard Vercel Anda → tab **Storage** → pilih database Prisma Postgres Anda (misalnya `prisma-postgres-teal-horizon`).
2. Pastikan Anda klik **Connect Project** dan hubungkan ke proyek Vercel Republik Jomokerto (centang Environment: `Production`, `Preview`, dan `Development`).
3. Vercel akan otomatis mengisi variabel berikut di Project Settings → Environment Variables:
   - `DATABASE_URL_POOLED` *(diprioritaskan untuk koneksi serverless)*
   - `POSTGRES_URL`
   - `PRISMA_DATABASE_URL`
4. Tambahkan Environment Variables tambahan berikut bila diperlukan:
   - `SESSION_SECRET` — string acak panjang yang konstan (penting agar token login tidak invalid antar instance serverless!).
   - `GEMINI_API_KEY` — API key Gemini dari Google AI Studio.
   - `VITE_GOOGLE_MAPS_API_KEY` — API key Google Maps JavaScript API (opsional jika hanya memakai Atlas Dunia Game).
   - `GOOGLE_CLIENT_ID` — opsional untuk verifikasi Google Sign-In resmi.
5. Lakukan **Redeploy** pada proyek Vercel Anda agar variabel Postgres baru terbaca oleh fungsi serverless `/api/index.ts`.
6. Setelah aktif, buka **Beranda** atau **Konsol Admin** — pastikan indikator mesin database menunjukkan **`Prisma Postgres`** / **`PostgreSQL (Prisma Postgres)`**.

---

## 3. Catatan Chat Real-Time di Vercel

Karena Vercel Serverless Functions tidak mendukung koneksi WebSocket persisten, halaman Chat (`src/pages/chat.tsx`) secara otomatis beralih dari WebSocket ke **HTTP POST + sinkronisasi polling setiap 4,5 detik** yang membaca & menulis langsung ke Prisma Postgres.

---

## 4. Catatan Gemini AI di Vercel

- **Streaming Chat (`/api/ai/chat/stream`)**: Chat Bupati AI menggunakan Server-Sent Events (SSE) dengan `ThinkingLevel.LOW` dan `maxDuration: 60` di `vercel.json` agar respons muncul bertahap tanpa terkena batas timeout awal Vercel.
- **Model Gambar & Maps Grounding**: Studio Gambar (`gemini-3.1-flash-lite-image`, `gemini-nano-banana-2.1`, `gemini-3-pro-image`) serta sebagian kuota Maps Grounding memerlukan API key Google AI Studio yang telah mengaktifkan **Billing (Paid Tier)**; pada kunci *Free Tier* server akan mengembalikan diagnostik kuota `429` dengan jelas dan halaman Peta menyediakan tautan buka langsung ke Google Maps.

