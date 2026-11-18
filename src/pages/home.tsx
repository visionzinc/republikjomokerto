import React, { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Compass, CreditCard, MessageSquare, Users } from 'lucide-react';
import {
  HERO_CIVIC_URL,
  REPUBLIC_SEAL_URL,
  type CitizenRecord,
  type MapPinItem,
  type TimelinePost,
} from '../shared/types';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { KtpCard } from '../components/KtpCard';
import type { AppPage } from '../components/Navbar';

interface HomePageProps {
  onNavigate: (page: AppPage, param?: string) => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  const { citizen, publicConfig } = useAuth();
  const [citizens, setCitizens] = useState<CitizenRecord[]>([]);
  const [postsCount, setPostsCount] = useState(0);
  const [pinsCount, setPinsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadSummary() {
      try {
        const [cRes, pRes, mRes] = await Promise.all([
          apiFetch<{ citizens: CitizenRecord[] }>('/api/citizens'),
          apiFetch<{ posts: TimelinePost[] }>('/api/posts'),
          apiFetch<{ pins: MapPinItem[] }>('/api/map/pins'),
        ]);
        if (!active) return;
        setCitizens(cRes.citizens);
        setPostsCount(pRes.posts.length);
        setPinsCount(mRes.pins.length);
      } catch {
        // Ignore on initial load
      } finally {
        if (active) setLoading(false);
      }
    }
    loadSummary();
    return () => {
      active = false;
    };
  }, []);

  const ktpHolders = citizens.filter((c) => Boolean(c.ktp));
  const featuredCitizen = citizen?.ktp ? citizen : ktpHolders[0] || citizens[0];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-12">
      {/* 2-Column Editorial Hero Split */}
      <section className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
        <div className="flex flex-col justify-between rounded-2xl border border-[#E4E2DC] bg-white p-6 sm:p-8 lg:col-span-7">
          <div>
            <div className="flex items-center gap-3 text-xs font-medium text-[#5B6561]">
              <img
                src={REPUBLIC_SEAL_URL}
                alt="Segel Republik Jomokerto"
                referrerPolicy="no-referrer"
                className="h-8 w-8 rounded-md border border-[#E4E2DC] object-cover"
              />
              <span>Portal Sipil Hiburan</span>
              <span aria-hidden="true">·</span>
              <span>Ibu Kota Default: NGAWI</span>
            </div>

            <h1 className="mt-5 font-display text-4xl font-bold tracking-tight text-[#1C2421] sm:text-5xl [text-wrap:balance]">
              Bangun Identitas Warga di Republik Jomokerto
            </h1>

            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#5B6561]">
              Cetak Kartu Tanda Penjomok (KTP) bergaya republik fiktif lengkap dengan
              tautan link-in-bio, jelajahi peta komunitas dari Ngawi hingga Sumeru,
              bagikan momen bergambar di timeline, dan mengobrol secara real-time.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3 pt-4 border-t border-[#E4E2DC]">
            <button
              type="button"
              onClick={() => onNavigate(citizen ? 'ktp' : 'auth')}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0F5E46] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0B4A37] transition-colors whitespace-nowrap shrink-0"
            >
              <CreditCard className="h-4 w-4" />
              <span>{citizen ? 'Buka KTP Studio' : 'Daftar & Cetak KTP'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('map')}
              className="inline-flex items-center gap-2 rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-4 py-2.5 text-sm font-medium text-[#1C2421] hover:border-[#0F5E46] transition-colors whitespace-nowrap shrink-0"
            >
              <Compass className="h-4 w-4 text-[#0F5E46]" />
              <span>Jelajahi Peta Hybrid</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('docs')}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-[#5B6561] hover:text-[#0F5E46] transition-colors whitespace-nowrap shrink-0"
            >
              <BookOpen className="h-4 w-4" />
              <span>Panduan Self-Host &amp; Vercel</span>
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#E4E2DC] bg-white lg:col-span-5">
          <img
            src={HERO_CIVIC_URL}
            alt="Alun-Alun Republik Jomokerto"
            referrerPolicy="no-referrer"
            className="h-64 w-full object-cover lg:h-full"
          />
        </div>
      </section>

      {/* 4-Column Civic Ledger Metrics Row */}
      <section className="grid grid-cols-2 gap-4 rounded-2xl border border-[#E4E2DC] bg-white p-5 sm:grid-cols-4">
        <div className="space-y-1">
          <p className="text-xs text-[#5B6561]">Warga Terdaftar</p>
          <p className="font-mono text-2xl font-semibold tabular-nums text-[#1C2421]">
            {loading ? '—' : citizens.length}
          </p>
          <p className="text-xs text-[#5B6561]">Guest, Member, Admin</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-[#5B6561]">KTP Penjomok Terbit</p>
          <p className="font-mono text-2xl font-semibold tabular-nums text-[#0F5E46]">
            {loading ? '—' : ktpHolders.length}
          </p>
          <p className="text-xs text-[#5B6561]">Template + Link-in-Bio</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-[#5B6561]">Pin Lokasi Aktif</p>
          <p className="font-mono text-2xl font-semibold tabular-nums text-[#1C2421]">
            {loading ? '—' : pinsCount}
          </p>
          <p className="text-xs text-[#5B6561]">Ngawi &amp; Dunia Game</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-[#5B6561]">Kiriman Timeline</p>
          <p className="font-mono text-2xl font-semibold tabular-nums text-[#1C2421]">
            {loading ? '—' : postsCount}
          </p>
          <p className="font-mono text-xs text-[#5B6561]">
            DB:{' '}
            {publicConfig.dbDriver === 'postgres'
              ? 'Prisma Postgres'
              : publicConfig.dbDriver === 'sqlite'
                ? 'SQLite (.db)'
                : 'JSON Sementara'}
          </p>
        </div>
      </section>

      {/* Featured KTP Preview + Quick Feature Modules */}
      <section className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold text-[#1C2421]">
                Contoh Kartu Tanda Penjomok
              </h2>
              <p className="text-sm text-[#5B6561]">
                Template kartu hiburan orisinal dengan QR link-in-bio dan ekspor PNG instan.
              </p>
            </div>
          </div>

          {featuredCitizen ? (
            <KtpCard
              citizen={featuredCitizen}
              onOpenBio={(uname) => onNavigate('bio', uname)}
            />
          ) : (
            <div className="h-64 animate-pulse rounded-2xl border border-[#E4E2DC] bg-white" />
          )}
        </div>

        <div className="space-y-4 lg:col-span-5">
          <h2 className="font-display text-2xl font-bold text-[#1C2421]">
            Layanan Utama Republik
          </h2>
          <div className="divide-y divide-[#E4E2DC] rounded-2xl border border-[#E4E2DC] bg-white">
            <button
              type="button"
              onClick={() => onNavigate('timeline')}
              className="flex w-full items-start justify-between gap-4 p-4 text-left hover:bg-[#F8F7F4] transition-colors"
            >
              <div>
                <p className="text-sm font-semibold text-[#1C2421]">
                  01. Timeline Teks &amp; Gambar
                </p>
                <p className="mt-1 text-xs text-[#5B6561]">
                  Mendukung seluruh format gambar CDN (PNG, JPG, WebP, GIF, AVIF, SVG) serta pembuat gambar Gemini AI.
                </p>
              </div>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#0F5E46]" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('map')}
              className="flex w-full items-start justify-between gap-4 p-4 text-left hover:bg-[#F8F7F4] transition-colors"
            >
              <div>
                <p className="text-sm font-semibold text-[#1C2421]">
                  02. Peta Hybrid Dunia Nyata &amp; Fiktif
                </p>
                <p className="mt-1 text-xs text-[#5B6561]">
                  Beralih antara Google Maps sekitar Ngawi dan Atlas Dunia Game seperti Sumeru, Mondstadt, dan Inazuma.
                </p>
              </div>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#0F5E46]" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('chat')}
              className="flex w-full items-start justify-between gap-4 p-4 text-left hover:bg-[#F8F7F4] transition-colors"
            >
              <div>
                <p className="text-sm font-semibold text-[#1C2421]">
                  03. Ruang Chat Warga &amp; Bupati AI
                </p>
                <p className="mt-1 text-xs text-[#5B6561]">
                  Obrolan antar warga via WebSocket plus asisten AI berbasis Gemini API untuk ide motto dan tanya jawab.
                </p>
              </div>
              <MessageSquare className="mt-1 h-4 w-4 shrink-0 text-[#0F5E46]" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('docs')}
              className="flex w-full items-start justify-between gap-4 p-4 text-left hover:bg-[#F8F7F4] transition-colors"
            >
              <div>
                <p className="text-sm font-semibold text-[#1C2421]">
                  04. Prototipe SaaS, Vercel &amp; Self-Host
                </p>
                <p className="mt-1 text-xs text-[#5B6561]">
                  Otomatis memakai PostgreSQL (Prisma Postgres) di Vercel, SQLite (.db) di VPS/lokal, serta fallback JSON.
                </p>
              </div>
              <Users className="mt-1 h-4 w-4 shrink-0 text-[#0F5E46]" />
            </button>
          </div>
        </div>
      </section>

      {/* Public Citizen Directory */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#1C2421]">
              Direktori Warga &amp; Link-in-Bio
            </h2>
            <p className="text-sm text-[#5B6561]">
              Klik kartu warga untuk membuka halaman profil dan tautan media sosialnya.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {citizens.map((item) => (
            <button
              key={item.user.id}
              type="button"
              onClick={() => onNavigate('bio', item.user.username)}
              className="flex items-start gap-3.5 rounded-xl border border-[#E4E2DC] bg-white p-4 text-left hover:border-[#0F5E46] transition-colors"
            >
              <img
                src={item.user.avatarUrl}
                alt={item.user.username}
                referrerPolicy="no-referrer"
                className="h-12 w-12 shrink-0 rounded-xl border border-[#E4E2DC] object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#1C2421]">
                  {item.ktp?.fullName || `@${item.user.username}`}
                </p>
                <p className="truncate text-xs text-[#5B6561]">
                  @{item.user.username} · {item.user.role}
                </p>
                <p className="mt-1.5 truncate font-mono text-[11px] text-[#0F5E46]">
                  {item.ktp ? `${item.ktp.locationName} · ${item.ktp.ktpSerial}` : 'Belum cetak KTP'}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
