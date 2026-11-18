# Panduan Self-Hosting (VPS / Node.js / Docker)

Untuk penggunaan komunitas permanen dengan **SQLite `.db` asli** dan **WebSocket real-time penuh**, jalankan Republik Jomokerto di server Node.js pribadi (VPS, Docker, Coolify, atau Railway).

---

## 1. Persyaratan Server

- Node.js `v20+` atau `v22+`
- `npm`
- Reverse proxy (Nginx atau Caddy) dengan dukungan WebSocket untuk HTTPS produksi.

---

## 2. Instalasi & Menjalankan Server

```bash
git clone <repo-url> republik-jomokerto
cd republik-jomokerto
npm install
cp .env.example .env
```

Sunting `.env`:
```env
PORT=3000
NODE_ENV=production
DB_DRIVER=sqlite
SESSION_SECRET=ganti-dengan-string-acak-minimal-32-karakter
GEMINI_API_KEY=isi-api-key-gemini-anda
VITE_GOOGLE_MAPS_API_KEY=isi-api-key-google-maps-anda
```

Build frontend dan jalankan server produksi:
```bash
npm run build
NODE_ENV=production npm start
```

Data warga, KTP, postingan, pesan chat, dan pin peta akan tersimpan permanen di `data/jomokerto.db`.

---

## 3. Contoh Konfigurasi Nginx (WebSocket + HTTP)

```nginx
server {
    listen 80;
    server_name jomokerto.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Pastikan header `Upgrade` dan `Connection "upgrade"` aktif agar endpoint `/ws` berfungsi untuk chat antar warga secara real-time.
