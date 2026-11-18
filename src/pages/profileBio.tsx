import React, { useEffect, useState } from 'react';
import { ArrowLeft, Ban, ExternalLink, Flag, Globe, MessageSquare, ShieldCheck } from 'lucide-react';
import type { BlockedUserEntry, CitizenRecord, SocialLinks } from '../shared/types';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { KtpCard } from '../components/KtpCard';
import { ReportModal, type ReportTargetPayload } from '../components/ReportModal';
import type { AppPage } from '../components/Navbar';

interface ProfileBioPageProps {
  username: string;
  onNavigate: (page: AppPage, param?: string) => void;
}

const LINK_LABELS: Array<{ key: keyof SocialLinks; label: string }> = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'twitter', label: 'X / Twitter' },
  { key: 'discord', label: 'Discord' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'github', label: 'GitHub' },
  { key: 'website', label: 'Website Pribadi' },
];

export function ProfileBioPage({ username, onNavigate }: ProfileBioPageProps) {
  const { citizen: currentUser } = useAuth();
  const [profile, setProfile] = useState<CitizenRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingDm, setStartingDm] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTargetPayload | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiFetch<{ citizen: CitizenRecord }>(`/api/citizens/${encodeURIComponent(username)}`)
      .then(async (res) => {
        if (!active) return;
        setProfile(res.citizen);
        if (currentUser && res.citizen.user.id !== currentUser.user.id) {
          try {
            const bRes = await apiFetch<{ blocks: BlockedUserEntry[] }>('/api/blocks');
            if (active) {
              setIsBlocked(
                bRes.blocks.some((b) => b.blockedUserId === res.citizen.user.id)
              );
            }
          } catch {
            // ignore
          }
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Warga tidak ditemukan.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [username, currentUser?.user.id]);

  async function handleStartDm() {
    if (!currentUser || !profile) {
      onNavigate('auth');
      return;
    }
    setStartingDm(true);
    setError(null);
    try {
      const res = await apiFetch<{ room: { id: string } }>('/api/chat/dm', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: profile.user.id }),
      });
      onNavigate('chat', res.room.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuka DM.');
    } finally {
      setStartingDm(false);
    }
  }

  async function handleToggleBlock() {
    if (!currentUser || !profile) {
      onNavigate('auth');
      return;
    }
    setBlockBusy(true);
    setError(null);
    try {
      if (isBlocked) {
        await apiFetch(`/api/blocks/${profile.user.id}`, { method: 'DELETE' });
        setIsBlocked(false);
      } else {
        await apiFetch('/api/blocks', {
          method: 'POST',
          body: JSON.stringify({ targetUserId: profile.user.id }),
        });
        setIsBlocked(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui status blokir.');
    } finally {
      setBlockBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="h-64 animate-pulse rounded-2xl border border-[#E4E2DC] bg-white" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <div className="rounded-2xl border border-[#E4E2DC] bg-white p-8">
          <p className="text-sm font-medium text-red-700">{error || 'Profil tidak ditemukan.'}</p>
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="mt-4 rounded-lg border border-[#E4E2DC] px-4 py-2 text-xs font-medium text-[#1C2421]"
          >
            Kembali ke Beranda
          </button>
        </div>
      </div>
    );
  }

  const activeLinks = LINK_LABELS.filter((l) => Boolean(profile.ktp?.socialLinks?.[l.key]?.trim()));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#5B6561] hover:text-[#1C2421]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Kembali ke Direktori</span>
        </button>

        {currentUser?.user.id !== profile.user.id && (
          <div className="flex flex-wrap items-center gap-2">
            {currentUser && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setReportTarget({
                      targetType: 'user',
                      targetId: profile.user.id,
                      targetLabel: `@${profile.user.username}`,
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E2DC] bg-white px-3 py-2 text-xs font-medium text-[#5B6561] hover:border-red-300 hover:text-red-700"
                >
                  <Flag className="h-3.5 w-3.5" />
                  <span>Laporkan</span>
                </button>
                <button
                  type="button"
                  disabled={blockBusy}
                  onClick={handleToggleBlock}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${
                    isBlocked
                      ? 'border-[#0F5E46] bg-[#0F5E46]/10 text-[#0F5E46]'
                      : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                  }`}
                >
                  {isBlocked ? (
                    <>
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>Buka Blokir</span>
                    </>
                  ) : (
                    <>
                      <Ban className="h-3.5 w-3.5" />
                      <span>Blokir</span>
                    </>
                  )}
                </button>
              </>
            )}

            <button
              type="button"
              disabled={startingDm || isBlocked}
              onClick={handleStartDm}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0F5E46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B4A37] disabled:opacity-50"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>
                {isBlocked
                  ? 'Akun Diblokir'
                  : startingDm
                    ? 'Membuka Ruang DM...'
                    : `Kirim Pesan ke @${profile.user.username}`}
              </span>
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800">
          {error}
        </div>
      )}

      <KtpCard citizen={profile} showDownload={true} />

      {/* Dedicated Link-in-Bio Hub */}
      <div className="rounded-2xl border border-[#E4E2DC] bg-white p-6">
        <h2 className="font-display text-lg font-bold text-[#1C2421]">
          Tautan Link-in-Bio @{profile.user.username}
        </h2>
        <p className="mt-1 text-xs text-[#5B6561]">
          Kanal sosial media resmi yang disematkan pada profil warga.
        </p>

        {activeLinks.length === 0 ? (
          <p className="mt-4 text-xs text-[#5B6561]">
            Warga ini belum menambahkan tautan sosial media pada KTP-nya.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {activeLinks.map((item) => {
              const raw = profile.ktp!.socialLinks[item.key]!;
              const href =
                raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
              return (
                <a
                  key={item.key}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#E4E2DC] bg-[#F8F7F4] px-4 py-3 hover:border-[#0F5E46] transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Globe className="h-4 w-4 shrink-0 text-[#0F5E46]" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#1C2421]">{item.label}</p>
                      <p className="truncate font-mono text-[11px] text-[#5B6561]">{raw}</p>
                    </div>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#5B6561]" />
                </a>
              );
            })}
          </div>
        )}
      </div>

      <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
    </div>
  );
}
