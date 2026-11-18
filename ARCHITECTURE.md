# Arsitektur Republik Jomokerto

## 1. Gambaran Umum Multi-Halaman

Frontend dibangun menggunakan React 19 + TypeScript + Vite dengan pemisahan modul halaman di `src/pages/`:

- `src/pages/home.tsx`: Beranda publik, ringkasan metrik warga, pratinjau KTP, dan direktori warga.
- `src/pages/auth.tsx`: Masuk, Daftar (email opsional, avatar default), Google SSO, dan Reset Password.
- `src/pages/ktpStudio.tsx`: Formulir profil warga + pratinjau template KTP langsung + ekspor PNG + Link-in-Bio.
- `src/pages/profileBio.tsx`: Halaman publik `/ ?u=username` menampilkan KTP & tautan sosial media.
- `src/pages/timeline.tsx`: Umpan teks & gambar CDN + validator MIME + modal Studio Gambar AI.
- `src/pages/chat.tsx`: Chat antar warga (WebSocket + HTTP fallback) & asisten Bupati AI.
- `src/pages/map.tsx`: Peta Hybrid (Google Maps `AdvancedMarkerElement` + Maps Grounding + Atlas Dunia Game).
- `src/pages/admin.tsx`: Konsol admin & superadmin (RBAC, verifikasi KTP, ekspor `.db.json`).
- `src/pages/docs.tsx`: Pembaca dokumentasi teknis dalam aplikasi.

---

## 2. Strategi Database 3-Lapis (Prisma Postgres + SQLite `.db` + Fallback JSON)

File `server/db.ts` menggunakan pola adapter asinkron otomatis:

1. **Mode Vercel / Produksi (`postgres`)**
   - Aktif otomatis saat `DATABASE_URL_POOLED`, `POSTGRES_URL`, atau `DATABASE_URL` terdeteksi (misalnya dari integrasi **Vercel Prisma Postgres**).
   - Menggunakan `pg.Pool` untuk koneksi serverless-friendly dengan `CREATE TABLE IF NOT EXISTS` idempoten dan auto-seeding dari `data/jomokerto-seed.db.json` ketika tabel `users` kosong.

2. **Mode Self-Host / Lokal (`sqlite`)**
   - Aktif otomatis saat variabel Postgres tidak disetel dan tidak berada di lingkungan read-only Vercel (`DB_DRIVER !== 'json'`).
   - Memuat `better-sqlite3` secara dinamis (agar tidak mematahkan bundel serverless Vercel) dan menulis langsung ke `data/jomokerto.db` dengan `PRAGMA journal_mode = DELETE` serta `PRAGMA synchronous = FULL`.

3. **Mode Fallback Sementara (`vercel-json`)**
   - Hanya aktif sebagai cadangan apabila berjalan di Vercel tanpa koneksi Postgres; menyimpan state sementara ke `/tmp/jomokerto.db.json`.

---

## 3. Integrasi Gemini AI (Server-Side Only)

Apakah Chat AI membutuhkan API Gemini? **Ya.** Seluruh pemanggilan `@google/genai` ditempatkan pada `server/gemini.ts` agar `GEMINI_API_KEY` tidak pernah terekspos ke browser:

- **Chat AI Warga (SSE Streaming)**: `gemini-4-hydrogen` dengan `ThinkingLevel.LOW` (`/api/ai/chat/stream` & `/api/ai/chat`).
- **Google Maps Grounding**: `gemini-4-hydrogen` dengan `ThinkingLevel.LOW` & `tools: [{ googleMaps: {} }]` (`/api/ai/maps-search`).
- **Studio Gambar AI**: `gemini-3.1-flash-lite-image`, `gemini-nano-banana-2.1`, atau `gemini-3-pro-image` dengan pilihan 8 rasio aspek (`1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `9:16`, `16:9`, `21:9`) pada `/api/ai/generate-image`.
- **Template KTP Penjomok**: Menggunakan template SVG/Canvas deterministik di klien (`src/components/KtpCard.tsx`) sehingga tidak memerlukan biaya/kuota AI.
