import React, { useEffect, useState } from 'react';
import { CheckCircle2, ImagePlus, Loader2, Save, Upload } from 'lucide-react';
import {
  DEFAULT_AVATAR_URL,
  type CitizenRecord,
  type LocationType,
  type SocialLinks,
} from '../shared/types';
import { apiFetch, readImageFileAsDataUrl } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { KtpCard } from '../components/KtpCard';
import { AiImageModal } from '../components/AiImageModal';
import type { AppPage } from '../components/Navbar';

interface KtpStudioPageProps {
  onNavigate: (page: AppPage, param?: string) => void;
}

const LOCATION_PRESETS: Array<{ label: string; type: LocationType }> = [
  { label: 'NGAWI', type: 'real' },
  { label: 'Alun-Alun Ngawi', type: 'real' },
  { label: 'Sumeru — Genshin Impact', type: 'fictional' },
  { label: 'Mondstadt Tavern', type: 'fictional' },
  { label: 'Inazuma Archipelago', type: 'fictional' },
  { label: 'Los Santos Ngawi', type: 'fictional' },
];

export function KtpStudioPage({ onNavigate }: KtpStudioPageProps) {
  const { citizen, setCitizenSession } = useAuth();
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('Warga Penjomok Aktif');
  const [locationType, setLocationType] = useState<LocationType>('real');
  const [locationName, setLocationName] = useState('NGAWI');
  const [faction, setFaction] = useState('Serikat Warga Ngawi');
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [motto, setMotto] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(DEFAULT_AVATAR_URL);
  const [socialLinks, setSocialLinks] = useState<SocialLinks>({});

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  useEffect(() => {
    if (!citizen) return;
    setAvatarUrl(citizen.user.avatarUrl || DEFAULT_AVATAR_URL);
    if (citizen.ktp) {
      setFullName(citizen.ktp.fullName);
      setTitle(citizen.ktp.title);
      setLocationType(citizen.ktp.locationType);
      setLocationName(citizen.ktp.locationName || 'NGAWI');
      setFaction(citizen.ktp.faction);
      setBloodGroup(citizen.ktp.bloodGroup);
      setMotto(citizen.ktp.motto);
      setSocialLinks(citizen.ktp.socialLinks || {});
    }
  }, [citizen]);

  if (!citizen) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <div className="rounded-2xl border border-[#E4E2DC] bg-white p-8">
          <h1 className="font-display text-2xl font-bold text-[#1C2421]">
            KTP Studio Republik Jomokerto
          </h1>
          <p className="mt-2 text-sm text-[#5B6561]">
            Anda sedang menjelajah sebagai pengunjung publik. Silakan masuk atau daftar akun terlebih dahulu untuk mencetak Kartu Tanda Penjomok.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('auth')}
            className="mt-5 rounded-lg bg-[#0F5E46] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0B4A37]"
          >
            Masuk / Daftar Sekarang
          </button>
        </div>
      </div>
    );
  }

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const { dataUrl } = await readImageFileAsDataUrl(file);
      setAvatarUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File gambar tidak didukung.');
    }
  }

  async function handleSaveKtp(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedNotice(null);
    try {
      const res = await apiFetch<{ token: string; citizen: CitizenRecord }>('/api/profile/ktp', {
        method: 'PUT',
        body: JSON.stringify({
          fullName,
          title,
          locationType,
          locationName: locationName.trim() || 'NGAWI',
          faction,
          bloodGroup,
          motto,
          socialLinks,
          avatarUrl,
        }),
      });
      setCitizenSession(res.citizen, res.token);
      setSavedNotice(
        `Kartu Tanda Penjomok berhasil diterbitkan! Peran akun Anda sekarang: ${res.citizen.user.role.toUpperCase()}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan KTP.');
    } finally {
      setSaving(false);
    }
  }

  // Live template preview synthesized from current form state
  const livePreviewCitizen: CitizenRecord = {
    user: {
      ...citizen.user,
      avatarUrl,
      role: citizen.user.role === 'guest' ? 'member' : citizen.user.role,
    },
    ktp: {
      userId: citizen.user.id,
      ktpSerial: citizen.ktp?.ktpSerial || 'JMK-PRV-2026-DRAFT',
      fullName: fullName || `@${citizen.user.username}`,
      title: title || 'Warga Penjomok Aktif',
      locationType,
      locationName: locationName || 'NGAWI',
      faction: faction || 'Serikat Warga Ngawi',
      bloodGroup: bloodGroup || 'O+',
      motto: motto || 'Ngopi di Ngawi, mabar sampai pagi.',
      socialLinks,
      verifiedByAdmin: citizen.ktp?.verifiedByAdmin ?? false,
      issuedAt: citizen.ktp?.issuedAt || new Date().toISOString(),
    },
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-[#1C2421]">
          Profil Warga &amp; Studio KTP Penjomok
        </h1>
        <p className="mt-1 text-sm text-[#5B6561]">
          Lengkapi biodata warga untuk mencetak kartu anggota resmi berbasis template (otomatis meningkatkan status Guest menjadi Member).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Form Editor */}
        <form
          onSubmit={handleSaveKtp}
          className="space-y-5 rounded-2xl border border-[#E4E2DC] bg-white p-6 lg:col-span-6"
        >
          {/* Portrait Picker */}
          <div className="flex flex-wrap items-center gap-4 border-b border-[#E4E2DC] pb-4">
            <img
              src={avatarUrl}
              alt="Foto Profil"
              referrerPolicy="no-referrer"
              className="h-16 w-16 rounded-xl border border-[#E4E2DC] object-cover"
            />
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-[#1C2421]">Foto Kartu &amp; Profil</p>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-1.5 text-xs font-medium text-[#1C2421] hover:border-[#0F5E46]">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Unggah Foto</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarFile}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setAiModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E2DC] bg-white px-3 py-1.5 text-xs font-medium text-[#0F5E46] hover:border-[#0F5E46]"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  <span>Buat Avatar AI</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C2421]">
                Nama Lengkap di KTP (Wajib)
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="contoh: Mas Rusdi Sumeru"
                className="w-full rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 text-sm focus:border-[#0F5E46] focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C2421]">
                Gelar / Jabatan Hiburan
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="contoh: Duta Kopi Susu Ngawi"
                className="w-full rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 text-sm focus:border-[#0F5E46] focus:outline-none"
              />
            </div>
          </div>

          {/* Location Selector (Real or Fictional Game Location, default NGAWI) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#1C2421]">
                Lokasi Domisili (Default: NGAWI — Bebas Dunia Nyata atau Game)
              </label>
              <div className="flex items-center gap-1 rounded-lg bg-[#F8F7F4] p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setLocationType('real')}
                  className={`rounded-md px-2 py-1 font-medium ${
                    locationType === 'real' ? 'bg-white text-[#0F5E46] shadow-sm' : 'text-[#5B6561]'
                  }`}
                >
                  Dunia Nyata
                </button>
                <button
                  type="button"
                  onClick={() => setLocationType('fictional')}
                  className={`rounded-md px-2 py-1 font-medium ${
                    locationType === 'fictional'
                      ? 'bg-white text-[#0F5E46] shadow-sm'
                      : 'text-[#5B6561]'
                  }`}
                >
                  Dunia Fiktif / Game
                </button>
              </div>
            </div>

            <input
              type="text"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="NGAWI atau Sumeru — Genshin Impact"
              className="w-full rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 text-sm focus:border-[#0F5E46] focus:outline-none"
              required
            />

            <div className="flex flex-wrap gap-1.5">
              {LOCATION_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setLocationName(preset.label);
                    setLocationType(preset.type);
                  }}
                  className="rounded-md border border-[#E4E2DC] bg-[#F8F7F4] px-2 py-1 text-[11px] text-[#5B6561] hover:border-[#0F5E46] hover:text-[#1C2421]"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C2421]">
                Fraksi / Guild / Komunitas
              </label>
              <input
                type="text"
                value={faction}
                onChange={(e) => setFaction(e.target.value)}
                placeholder="Serikat Warga Ngawi"
                className="w-full rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 text-sm focus:border-[#0F5E46] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C2421]">
                Golongan Energi / Elemen
              </label>
              <input
                type="text"
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                placeholder="O+, Dendro, Electro, Kopi..."
                className="w-full rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 text-sm focus:border-[#0F5E46] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#1C2421]">
              Motto Warga (Wajib)
            </label>
            <input
              type="text"
              value={motto}
              onChange={(e) => setMotto(e.target.value)}
              placeholder="contoh: Kalah ranked urusan belakang, yang penting KTP aman."
              className="w-full rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 text-sm focus:border-[#0F5E46] focus:outline-none"
              required
            />
          </div>

          {/* Link-in-Bio Social Media URLs */}
          <div className="space-y-3 border-t border-[#E4E2DC] pt-4">
            <div>
              <h2 className="text-xs font-semibold text-[#1C2421]">
                Tautan Link-in-Bio pada Kartu &amp; Profil
              </h2>
              <p className="text-[11px] text-[#5B6561]">
                Sematkan akun media sosial Anda (opsional). Akan tampil di KTP dan halaman publik /u/{citizen.user.username}.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {(
                [
                  ['instagram', 'Instagram URL / Handle'],
                  ['twitter', 'X / Twitter URL'],
                  ['discord', 'Discord Invite / Username'],
                  ['tiktok', 'TikTok URL'],
                  ['youtube', 'YouTube Channel'],
                  ['github', 'GitHub URL'],
                  ['website', 'Website Pribadi'],
                ] as Array<[keyof SocialLinks, string]>
              ).map(([key, label]) => (
                <input
                  key={key}
                  type="text"
                  value={socialLinks[key] || ''}
                  onChange={(e) =>
                    setSocialLinks((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  placeholder={label}
                  className="w-full rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-1.5 text-xs focus:border-[#0F5E46] focus:outline-none"
                />
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </div>
          )}

          {savedNotice && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#0F5E46]" />
              <span>{savedNotice}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F5E46] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0B4A37] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span>Simpan Profil &amp; Cetak KTP Penjomok</span>
          </button>
        </form>

        {/* Live Card Preview */}
        <div className="space-y-4 lg:col-span-6">
          <div className="rounded-2xl border border-[#E4E2DC] bg-white p-6">
            <h2 className="font-display text-lg font-bold text-[#1C2421]">
              Pratinjau Kartu Tanda Penjomok (Template Langsung)
            </h2>
            <p className="mt-1 mb-4 text-xs text-[#5B6561]">
              Desain kartu khusus hiburan Republik Jomokerto — tidak menyerupai dokumen resmi pemerintah Indonesia.
            </p>
            <KtpCard
              citizen={livePreviewCitizen}
              onOpenBio={(uname) => onNavigate('bio', uname)}
              showDownload={Boolean(citizen.ktp)}
            />
          </div>
        </div>
      </div>

      <AiImageModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onSelectImage={(url) => setAvatarUrl(url)}
        defaultPrompt="Potret avatar karakter gamer ramah dengan latar belakang studio warna krem hangat"
      />
    </div>
  );
}
