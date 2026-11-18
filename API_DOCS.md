# Referensi API Republik Jomokerto

Seluruh endpoint berada di bawah prefix `/api/*`. Autentikasi menggunakan header `Authorization: Bearer <token>` atau cookie `jomok_session`.

---

## 1. Autentikasi & SSO (`/api/auth/*`)

| Method | Endpoint | Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Daftar akun baru (`username`, `password`, `email?`, `avatarUrl?`). Memulai sebagai role `guest`. |
| `POST` | `/api/auth/login` | Public | Masuk dengan `identifier` (username/email) dan `password`. |
| `POST` | `/api/auth/google` | Public | Masuk/daftar via Google SSO (`credential` Google ID Token atau mode prototipe). |
| `POST` | `/api/auth/request-reset` | Public | Membuat token reset password berdasarkan email opsional terdaftar. |
| `POST` | `/api/auth/reset-password` | Public | Memperbarui password menggunakan `token` dan `newPassword`. |
| `GET` | `/api/auth/me` | Session | Mengambil profil & data KTP pengguna yang sedang login. |
| `POST` | `/api/auth/logout` | Session | Menghapus cookie sesi. |

---

## 2. Warga, KTP Studio & Link-in-Bio

| Method | Endpoint | Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/citizens` | Public | Daftar warga dan KTP publik (tanpa data sensitif). |
| `GET` | `/api/citizens/:username` | Public | Profil lengkap, KTP, dan tautan Link-in-Bio milik `:username`. |
| `PUT` | `/api/profile/basic` | Auth | Memperbarui email opsional atau foto avatar. |
| `PUT` | `/api/profile/ktp` | Auth | Melengkapi profil & mencetak KTP (`fullName`, `locationName`, `locationType`, `motto`, `socialLinks`). Otomatis menaikkan role `guest` -> `member`. |

---

## 3. Timeline Teks & Gambar (`/api/posts/*`)

| Method | Endpoint | Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/posts` | Public | Daftar kiriman timeline terbaru. |
| `POST` | `/api/posts` | Auth | Menerbitkan teks + gambar opsional. Hanya menerima tipe MIME gambar CDN (`jpeg`, `png`, `webp`, `gif`, `avif`, `svg+xml`, `bmp`, `tiff`). |
| `POST` | `/api/posts/:id/like` | Auth | Toggle suka pada kiriman. |
| `DELETE` | `/api/posts/:id` | Author / Admin | Menghapus kiriman. |

---

## 4. Chat Real-Time, Grup & Moderasi Sosial (`/api/chat/*`, `/api/blocks`, `/api/reports`)

| Method | Endpoint | Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/chat/rooms` | Public/Auth | Daftar kanal publik + grup + DM milik pengguna (menyembunyikan DM terblokir). |
| `POST` | `/api/chat/dm` | Auth (Aktif) | Membuka/mengambil ruang DM dengan `targetUserId` (ditolak jika diblokir). |
| `POST` | `/api/chat/groups` | Member / Admin | Membuat grup baru (`name`, `description?`, `realmTag?`, `memberIds`). Creator bersifat permanen. |
| `POST` | `/api/chat/groups/:roomId/members` | Creator / Co-Creator | Menambahkan anggota baru ke grup (ditolak jika grup diarsipkan). |
| `DELETE` | `/api/chat/groups/:roomId/members/:userId` | Creator / Co-Creator / Self | Mengeluarkan anggota atau keluar grup (Creator tidak dapat dihapus). |
| `PATCH` | `/api/chat/groups/:roomId/co-creators` | Creator / Admin | Mengangkat atau mencabut status Co-Creator grup. |
| `PATCH` | `/api/chat/groups/:roomId/archive` | Creator / Admin | Membekukan/mengarsipkan grup menjadi *read-only* (`archived`). |
| `DELETE` | `/api/chat/groups/:roomId` | Creator / Admin | Menghapus grup beserta riwayat pesannya. |
| `GET` | `/api/chat/rooms/:roomId/messages` | Public/Auth | Mengambil riwayat pesan (mendukung `?after=<ISO>` dan filter pesan dari akun terblokir). |
| `POST` | `/api/chat/rooms/:roomId/messages` | Auth (Aktif) | Mengirim pesan baru dan mem-broadcast ke WebSocket (ditolak jika grup diarsipkan). |
| `DELETE` | `/api/chat/messages/:messageId` | Author / Mod / Grup | Menghapus pesan dan mem-broadcast `message:deleted`. |
| `GET` / `POST` / `DELETE` | `/api/blocks` | Auth | Mengelola daftar warga yang diblokir. |
| `POST` | `/api/reports` | Auth (Aktif) | Melaporkan `user`, `post`, atau `message` ke Dewan Moderator. |
| `GET` / `POST` | `/api/appeals/me` · `/api/appeals` · `/:id/respond` | Auth | Mengajukan Pledoi, Duplik, dan Kasasi bagi akun berstatus `suspended`. |

**WebSocket `/ws?roomId=...&token=...`**:
- Client -> Server: `{ "type": "room:join", "roomId": "..." }`, `{ "type": "message:send", "roomId": "...", "messageText": "..." }`
- Server -> Client: `{ "type": "message:new", "roomId": "...", "message": { ... } }`, `{ "type": "message:deleted", "roomId": "...", "messageId": "..." }`, `{ "type": "presence:update", "roomId": "...", "activeUsers": [...] }`

---

## 5. Peta Hybrid & Gemini AI

| Method | Endpoint | Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/map/pins` | Public | Mengambil pin lokasi (`?mode=real` atau `fictional`). |
| `POST` | `/api/map/pins` | Auth (Aktif) | Menambahkan pin dunia nyata (`lat`, `lng`) atau dunia fiktif (`realmId`, `realmX`, `realmY`). |
| `DELETE` | `/api/map/pins/:id` | Author / Admin | Menghapus pin. |
| `POST` | `/api/ai/chat/stream` | Public/Auth | Chat Bupati AI via Server-Sent Events (`gemini-4-hydrogen`, `ThinkingLevel.LOW`). |
| `POST` | `/api/ai/chat` | Public/Auth | Chat non-streaming dengan Bupati AI (`gemini-4-hydrogen`). |
| `POST` | `/api/ai/maps-search` | Public | Pencarian tempat Google Maps Grounding (`gemini-4-hydrogen` + `googleMaps`, `ThinkingLevel.LOW`). |
| `POST` | `/api/ai/generate-image` | Auth (Aktif) | Membuat gambar AI (`gemini-3.1-flash-lite-image`, `gemini-nano-banana-2.1`, atau `gemini-3-pro-image`) dengan `aspectRatio`. |

---

## 6. Konsol Admin & Moderasi (`/api/admin/*`)

| Method | Endpoint | Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/overview` | `admin`, `superadmin` | Ringkasan warga, postingan, pin, laporan pending, sidang aktif, dan driver DB. |
| `PATCH` | `/api/admin/users/:userId/role` | `superadmin` | Mengubah peran pengguna (`guest`, `member`, `admin`, `superadmin`). |
| `PATCH` | `/api/admin/users/:userId/status` | `admin`, `superadmin` | Menangguhkan (`suspended`) atau memulihkan (`active`) akun warga. |
| `PATCH` | `/api/admin/ktp/:userId/verify` | `admin`, `superadmin` | Memberi/mencabut stempel verifikasi KTP. |
| `GET` / `PATCH` | `/api/admin/reports` · `/api/admin/reports/:id` | `admin`, `superadmin` | Meninjau laporan masuk, menghapus konten, menandai selesai/aman, atau suspend akun. |
| `GET` / `PATCH` | `/api/admin/appeals` · `/api/admin/appeals/:id` | `admin`, `superadmin` | Memproses Sidang Banding (terima banding, kirim Replik, buka Kasasi, atau putusan Inkrah). |
| `GET` | `/api/admin/export-db` | `admin`, `superadmin` | Mengunduh snapshot database dalam format `.db.json`. |
