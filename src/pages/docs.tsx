import React, { useState } from 'react';
import { BookOpen, Database, Globe, Server } from 'lucide-react';

type DocTab = 'readme' | 'vercel' | 'selfhost' | 'gemini';

export function DocsPage() {
  const [tab, setTab] = useState<DocTab>('readme');

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-[#1C2421]">
          Dokumentasi Teknis &amp; Panduan Deployment
        </h1>
        <p className="mt-1 text-sm text-[#5B6561]">
          Ringkasan berkas dokumentasi lengkap (README.md, ARCHITECTURE.md, DEPLOYMENT_VERCEL.md, SELF_HOSTING.md, dan API_DOCS.md) yang disertakan di repositori.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 rounded-xl border border-[#E4E2DC] bg-white p-1.5">
        {[
          { id: 'readme', label: 'README & Arsitektur', icon: BookOpen },
          { id: 'vercel', label: 'Deploy ke Vercel (.db)', icon: Globe },
          { id: 'selfhost', label: 'Self-Host & Docker/VPS', icon: Server },
          { id: 'gemini', label: 'FAQ Gemini AI & Maps', icon: Database },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as DocTab)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === item.id
                  ? 'bg-[#0F5E46] text-white'
                  : 'text-[#5B6561] hover:text-[#1C2421]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-[#E4E2DC] bg-white p-6 space-y-4 text-sm leading-relaxed text-[#1C2421]">
        {tab === 'readme' && (
          <>
            <h2 className="font-display text-xl font-bold">
              Republik Jomokerto — Prototipe SaaS &amp; Self-Host
            </h2>
            <p className="text-[#5B6561]">
              Aplikasi ini dirancang sebagai prototipe komunitas hiburan dengan alur peran lengkap:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
              <li>
                <strong>Public (Non-Login)</strong>: Menjelajahi Beranda, Direktori Warga, Link-in-Bio, Timeline publik, dan Peta Hybrid.
              </li>
              <li>
                <strong>Guest</strong>: Akun baru (username + password + email opsional + avatar default) yang belum mengisi profil lengkap/mencetak KTP. Bisa posting di Timeline dan ikut Chat.
              </li>
              <li>
                <strong>Member</strong>: Otomatis aktif setelah mengisi formulir profil di <em>KTP Studio</em> (lokasi default <code className="font-mono">NGAWI</code> atau lokasi fiktif seperti <code className="font-mono">Sumeru — Genshin Impact</code>) untuk menerbitkan Kartu Tanda Penjomok + Link-in-Bio.
              </li>
              <li>
                <strong>Admin &amp; Superadmin / Dev</strong>: Memverifikasi KTP warga, moderasi postingan/pin, mengatur peran RBAC, dan mengekspor database.
              </li>
            </ul>
          </>
        )}

        {tab === 'vercel' && (
          <>
            <h2 className="font-display text-xl font-bold">
              Persistensi Vercel dengan Prisma Postgres + Fallback .db
            </h2>
            <p className="text-xs sm:text-sm text-[#5B6561]">
              Vercel Serverless Functions berjalan di filesystem read-only dan setiap container baru mereset folder <code className="font-mono">/tmp</code>. Karena itu, <code className="font-mono">server/db.ts</code> menerapkan prioritas 3 lapis otomatis:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
              <li>
                <strong>1. PostgreSQL / Prisma Postgres (<code className="font-mono">postgres</code>)</strong>: Aktif otomatis apabila <code className="font-mono">DATABASE_URL_POOLED</code>, <code className="font-mono">POSTGRES_URL</code>, atau <code className="font-mono">DATABASE_URL</code> tersedia. Skema tabel &amp; kolom tambahan (termasuk grup obrolan, blokir, laporan, dan sidang banding) dibuat otomatis secara idempoten (<code className="font-mono">CREATE TABLE IF NOT EXISTS</code> &amp; <code className="font-mono">ALTER TABLE ... ADD COLUMN IF NOT EXISTS</code>) tanpa menghapus data yang sudah ada.
              </li>
              <li>
                <strong>2. SQLite Lokal (<code className="font-mono">sqlite</code>)</strong>: Aktif otomatis saat dijalankan secara lokal/VPS ke berkas <code className="font-mono">data/jomokerto.db</code> dengan sinkronisasi disk langsung (<code className="font-mono">journal_mode = DELETE</code>, <code className="font-mono">synchronous = FULL</code>).
              </li>
              <li>
                <strong>3. Fallback JSON (<code className="font-mono">vercel-json</code>)</strong>: Hanya aktif jika Postgres belum dihubungkan di Vercel (bersifat sementara di <code className="font-mono">/tmp/jomokerto.db.json</code>). Pastikan integrasi Prisma Postgres Anda sudah berstatus <em>Connected</em> ke proyek Vercel agar <code className="font-mono">POSTGRES_URL</code> &amp; <code className="font-mono">DATABASE_URL_POOLED</code> terinjeksi saat deploy.
              </li>
            </ul>
          </>
        )}

        {tab === 'selfhost' && (
          <>
            <h2 className="font-display text-xl font-bold">
              Self-Hosting di VPS, Node.js, atau Docker
            </h2>
            <p className="text-xs sm:text-sm text-[#5B6561]">
              Saat di-host di VPS/Node.js pribadi tanpa Postgres, <code className="font-mono">server.ts</code> menjalankan Express + WebSocket (<code className="font-mono">/ws</code>) secara bersamaan dan otomatis memakai SQLite lokal pada berkas <code className="font-mono">data/jomokerto.db</code> (atau gunakan <code className="font-mono">POSTGRES_URL</code> bila memakai database PostgreSQL).
            </p>
            <pre className="overflow-x-auto rounded-xl border border-[#E4E2DC] bg-[#F8F7F4] p-4 font-mono text-xs text-[#1C2421]">
{`npm install
npm run build
NODE_ENV=production PORT=3000 npm start`}
            </pre>
            <p className="text-xs text-[#5B6561]">
              Pastikan reverse proxy (Nginx/Caddy) meneruskan header <code className="font-mono">Upgrade</code> dan <code className="font-mono">Connection</code> pada path <code className="font-mono">/ws</code> untuk chat real-time.
            </p>
          </>
        )}

        {tab === 'gemini' && (
          <>
            <h2 className="font-display text-xl font-bold">
              Tentang Chat AI, Peta &amp; API Key Gemini
            </h2>
            <p className="text-xs sm:text-sm text-[#5B6561]">
              Menjawab pertanyaan Anda: <strong>Ya</strong>, untuk fitur Chat AI (Bupati AI), pencarian lokasi Maps Grounding, dan Studio Gambar AI diperlukan <code className="font-mono">GEMINI_API_KEY</code> di sisi server (<code className="font-mono">server/gemini.ts</code>). Sedangkan fitur inti <strong>Pembuat Kartu KTP</strong> menggunakan template HTML/SVG/Canvas murni tanpa memanggil AI agar cepat dan hemat kuota.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
              <li>
                <strong>Chat AI &amp; Maps Grounding</strong>: Memakai <code className="font-mono">gemini-4-hydrogen</code> dengan <code className="font-mono">ThinkingLevel.LOW</code> dan streaming SSE pada <code className="font-mono">/api/ai/chat/stream</code> agar respons cepat di Vercel.
              </li>
              <li>
                <strong>Studio Gambar AI</strong>: Memakai <code className="font-mono">gemini-3.1-flash-lite-image</code>, <code className="font-mono">gemini-nano-banana-2.1</code>, atau <code className="font-mono">gemini-3-pro-image</code> dengan 8 pilihan rasio aspek (<code className="font-mono">1:1</code> hingga <code className="font-mono">21:9</code>) — membutuhkan API key Gemini dengan billing aktif.
              </li>
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
