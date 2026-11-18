import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Globe,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import {
  DEFAULT_AVATAR_URL,
  REPUBLIC_SEAL_URL,
  type CitizenRecord,
  type SocialLinks,
} from '../shared/types';
import { formatDateId } from '../lib/api';

interface KtpCardProps {
  citizen: CitizenRecord;
  onOpenBio?: (username: string) => void;
  showDownload?: boolean;
}

const SOCIAL_LABELS: Array<{ key: keyof SocialLinks; label: string }> = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'twitter', label: 'X / Twitter' },
  { key: 'discord', label: 'Discord' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'github', label: 'GitHub' },
  { key: 'website', label: 'Website' },
];

export function KtpCard({ citizen, onOpenBio, showDownload = true }: KtpCardProps) {
  const [downloading, setDownloading] = useState(false);
  const { user, ktp } = citizen;

  const bioUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?u=${encodeURIComponent(user.username)}`
      : `https://jomokerto.id/?u=${user.username}`;

  const activeSocials = SOCIAL_LABELS.filter((s) => Boolean(ktp?.socialLinks?.[s.key]?.trim()));

  async function handleDownloadPng() {
    if (!ktp) return;
    setDownloading(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1040;
      canvas.height = 640;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Card base background
      ctx.fillStyle = '#F4F1EA';
      ctx.fillRect(0, 0, 1040, 640);

      // Decorative diagonal civic stripes
      ctx.strokeStyle = 'rgba(15, 94, 70, 0.06)';
      ctx.lineWidth = 2;
      for (let i = -640; i < 1680; i += 28) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 640, 640);
        ctx.stroke();
      }

      // Outer Brass & Emerald Frame
      ctx.strokeStyle = '#0F5E46';
      ctx.lineWidth = 8;
      ctx.strokeRect(20, 20, 1000, 600);
      ctx.strokeStyle = '#B8860B';
      ctx.lineWidth = 2;
      ctx.strokeRect(32, 32, 976, 576);

      // Top Header Banner
      ctx.fillStyle = '#0F5E46';
      ctx.fillRect(32, 32, 976, 98);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '700 28px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('REPUBLIK JOMOKERTO', 132, 76);
      ctx.fillStyle = '#F5D061';
      ctx.font = '600 17px "JetBrains Mono", monospace';
      ctx.fillText('KARTU TANDA PENJOMOK  ·  IDENTITAS WARGA HIBURAN', 132, 106);

      // Load Seal + Avatar images
      const loadImg = (src: string) =>
        new Promise<HTMLImageElement | null>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = src;
        });

      const [sealImg, avatarImg] = await Promise.all([
        loadImg(REPUBLIC_SEAL_URL),
        loadImg(user.avatarUrl || DEFAULT_AVATAR_URL),
      ]);

      if (sealImg) {
        ctx.drawImage(sealImg, 52, 46, 68, 68);
      }

      // Serial Box
      ctx.fillStyle = '#1C2421';
      ctx.font = '600 22px "JetBrains Mono", monospace';
      ctx.fillText(`NO. SERI: ${ktp.ktpSerial}`, 60, 178);

      // Citizen Data Lines
      const rows: Array<[string, string]> = [
        ['NAMA PENJOMOK', ktp.fullName.toUpperCase()],
        ['USERNAME', `@${user.username}`],
        ['GELAR WARGA', ktp.title],
        ['DOMISILI / REALM', `${ktp.locationName} (${ktp.locationType === 'fictional' ? 'Dunia Fiktif' : 'Dunia Nyata'})`],
        ['FRAKSI / GUILD', ktp.faction],
        ['GOL. ENERGI', ktp.bloodGroup],
        ['MOTTO HIDUP', `"${ktp.motto}"`],
      ];

      let y = 228;
      for (const [label, val] of rows) {
        ctx.fillStyle = '#5B6561';
        ctx.font = '600 13px "JetBrains Mono", monospace';
        ctx.fillText(label, 60, y);
        ctx.fillStyle = '#1C2421';
        ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(val.slice(0, 44), 265, y);
        y += 46;
      }

      // Portrait Frame on right
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(755, 165, 215, 255);
      ctx.strokeStyle = '#B8860B';
      ctx.lineWidth = 3;
      ctx.strokeRect(755, 165, 215, 255);
      if (avatarImg) {
        ctx.drawImage(avatarImg, 763, 173, 199, 239);
      }

      // Footer Note
      ctx.fillStyle = '#5B6561';
      ctx.font = '500 13px "JetBrains Mono", monospace';
      ctx.fillText(`TERBIT: ${formatDateId(ktp.issuedAt)}  ·  LINK-IN-BIO: /u/${user.username}`, 60, 580);
      ctx.fillStyle = '#0F5E46';
      ctx.font = '700 15px "JetBrains Mono", monospace';
      ctx.fillText(ktp.verifiedByAdmin ? 'STEMPEL TERVERIFIKASI' : 'KARTU HIBURAN RESMI', 755, 455);

      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `KTP-Jomokerto-${user.username}.png`;
      a.click();
    } finally {
      setDownloading(false);
    }
  }

  if (!ktp) {
    return (
      <div className="rounded-xl border border-[#E4E2DC] bg-white p-6 text-center">
        <p className="text-sm font-medium text-[#1C2421]">
          Kartu Tanda Penjomok belum dicetak untuk @{user.username}.
        </p>
        <p className="mt-1 text-xs text-[#5B6561]">
          Akun berstatus Guest dapat melengkapi data warga di KTP Studio untuk menerbitkan kartu.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Bespoke Satirical Civic Card (Non-official template, distinct from real IDs) */}
      <div className="ktp-guilloche relative overflow-hidden rounded-2xl border-2 border-[#0F5E46] shadow-sm transition-transform duration-200 hover:-translate-y-0.5">
        {/* Inner brass hairline */}
        <div className="pointer-events-none absolute inset-2 rounded-xl border border-[#B8860B]/45" />

        {/* Republic Header */}
        <div className="flex items-center justify-between gap-4 bg-[#0F5E46] px-5 py-3.5 text-white">
          <div className="flex items-center gap-3">
            <img
              src={REPUBLIC_SEAL_URL}
              alt="Lambang Republik Jomokerto"
              referrerPolicy="no-referrer"
              className="h-10 w-10 rounded-lg border border-[#B8860B]/70 object-cover bg-white"
            />
            <div>
              <p className="font-display text-base font-bold tracking-tight leading-tight">
                REPUBLIK JOMOKERTO
              </p>
              <p className="font-mono text-[11px] tracking-wider text-[#F5D061] uppercase">
                Kartu Tanda Penjomok · Edisi Hiburan
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono text-xs font-semibold tabular-nums text-white">
              {ktp.ktpSerial}
            </p>
            <p className="font-mono text-[11px] text-emerald-100/85">
              Peran: {user.role.toUpperCase()}
            </p>
          </div>
        </div>

        {/* Main Card Body */}
        <div className="relative z-10 grid grid-cols-1 gap-5 p-5 sm:grid-cols-[1fr_148px]">
          {/* Citizen Details */}
          <div className="space-y-2.5 text-sm">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wider text-[#5B6561]">
                Nama Warga &amp; Gelar
              </p>
              <p className="font-display text-lg font-bold text-[#1C2421] leading-snug">
                {ktp.fullName}
              </p>
              <p className="text-xs font-medium text-[#0F5E46]">
                @{user.username} · {ktp.title}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 border-t border-[#E4E2DC] pt-2.5 sm:grid-cols-2">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-[#5B6561]">
                  Domisili / Realm
                </p>
                <p className="flex items-center gap-1 text-xs font-semibold text-[#1C2421]">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-[#0F5E46]" />
                  <span>{ktp.locationName}</span>
                </p>
                <p className="font-mono text-[11px] text-[#5B6561]">
                  {ktp.locationType === 'fictional' ? 'Lokasi Fiktif / Game' : 'Lokasi Dunia Nyata'}
                </p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-[#5B6561]">
                  Fraksi · Gol. Energi
                </p>
                <p className="text-xs font-semibold text-[#1C2421]">{ktp.faction}</p>
                <p className="font-mono text-[11px] text-[#5B6561]">Energi: {ktp.bloodGroup}</p>
              </div>
            </div>

            <div className="border-t border-[#E4E2DC] pt-2">
              <p className="font-mono text-[10px] uppercase tracking-wider text-[#5B6561]">
                Motto Konstitusional
              </p>
              <p className="text-xs italic text-[#1C2421]">“{ktp.motto}”</p>
            </div>

            {/* Embedded Link-in-Bio Preview */}
            {activeSocials.length > 0 && (
              <div className="border-t border-[#E4E2DC] pt-2">
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-[#5B6561]">
                  Tautan Link-in-Bio
                </p>
                <div className="flex flex-wrap gap-2">
                  {activeSocials.map((s) => {
                    const href = ktp.socialLinks[s.key]!;
                    const normalizedHref =
                      href.startsWith('http://') || href.startsWith('https://')
                        ? href
                        : `https://${href}`;
                    return (
                      <a
                        key={s.key}
                        href={normalizedHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-[#E4E2DC] bg-white/90 px-2 py-1 text-[11px] font-medium text-[#1C2421] hover:border-[#0F5E46] hover:text-[#0F5E46] transition-colors"
                      >
                        <Globe className="h-3 w-3 text-[#0F5E46]" />
                        <span>{s.label}</span>
                        <ExternalLink className="h-2.5 w-2.5 text-[#5B6561]" />
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Portrait + QR Link-in-Bio */}
          <div className="flex flex-row items-center justify-between gap-3 sm:flex-col sm:items-end">
            <div className="overflow-hidden rounded-xl border-2 border-[#B8860B]/70 bg-white p-1">
              <img
                src={user.avatarUrl || DEFAULT_AVATAR_URL}
                alt={`Foto ${ktp.fullName}`}
                referrerPolicy="no-referrer"
                className="h-28 w-24 rounded-lg object-cover sm:h-32 sm:w-28"
              />
            </div>

            <div className="flex flex-col items-end gap-1.5">
              <div className="rounded-lg border border-[#E4E2DC] bg-white p-1.5">
                <QRCodeSVG value={bioUrl} size={64} fgColor="#0F5E46" bgColor="#FFFFFF" />
              </div>
              <div className="flex items-center gap-1 font-mono text-[10px] text-[#0F5E46]">
                {ktp.verifiedByAdmin ? (
                  <>
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Terverifikasi</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-3 w-3" />
                    <span>Terbit {formatDateId(ktp.issuedAt)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions below card */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-3">
          {onOpenBio && (
            <button
              type="button"
              onClick={() => onOpenBio(user.username)}
              className="font-medium text-[#0F5E46] hover:underline whitespace-nowrap shrink-0"
            >
              Buka Halaman Link-in-Bio @{user.username}
            </button>
          )}
        </div>
        {showDownload && (
          <button
            type="button"
            disabled={downloading}
            onClick={handleDownloadPng}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E2DC] bg-white px-3 py-1.5 font-medium text-[#1C2421] hover:border-[#0F5E46] hover:text-[#0F5E46] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{downloading ? 'Menyiapkan PNG...' : 'Unduh Kartu (PNG)'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
