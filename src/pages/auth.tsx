import React, { useState } from 'react';
import { KeyRound, Loader2, LogIn, Upload, UserPlus } from 'lucide-react';
import { DEFAULT_AVATAR_URL, type CitizenRecord } from '../shared/types';
import { apiFetch, readImageFileAsDataUrl } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { AppPage } from '../components/Navbar';

interface AuthPageProps {
  onNavigate: (page: AppPage) => void;
}

type AuthTab = 'login' | 'register' | 'reset';

export function AuthPage({ onNavigate }: AuthPageProps) {
  const { setCitizenSession, publicConfig } = useAuth();
  const [tab, setTab] = useState<AuthTab>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Login state
  const [loginId, setLoginId] = useState('');
  const [loginPass, setLoginPass] = useState('');

  // Register state
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regAvatar, setRegAvatar] = useState<string>(DEFAULT_AVATAR_URL);
  const [customAvatarSelected, setCustomAvatarSelected] = useState(false);

  // Google prototype SSO modal state
  const [googleEmailInput, setGoogleEmailInput] = useState('');
  const [showGoogleBox, setShowGoogleBox] = useState(false);

  // Reset password state
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetNewPass, setResetNewPass] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ token: string; citizen: CitizenRecord }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: loginId, password: loginPass }),
      });
      setCitizenSession(res.citizen, res.token);
      onNavigate(res.citizen.ktp ? 'home' : 'ktp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ token: string; citizen: CitizenRecord }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: regUsername,
          email: regEmail || undefined,
          password: regPassword,
          avatarUrl: customAvatarSelected ? regAvatar : DEFAULT_AVATAR_URL,
        }),
      });
      setCitizenSession(res.citizen, res.token);
      onNavigate('ktp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pendaftaran gagal.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const { dataUrl } = await readImageFileAsDataUrl(file);
      setRegAvatar(dataUrl);
      setCustomAvatarSelected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File gambar tidak valid.');
    }
  }

  async function handleGooglePrototypeLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!googleEmailInput.includes('@')) {
      setError('Masukkan alamat email Google yang valid.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ token: string; citizen: CitizenRecord }>('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({
          demoGoogleEmail: googleEmailInput,
          demoGoogleName: googleEmailInput.split('@')[0],
        }),
      });
      setCitizenSession(res.citizen, res.token);
      onNavigate(res.citizen.ktp ? 'home' : 'ktp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google SSO gagal.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ message: string; previewResetToken: string }>(
        '/api/auth/request-reset',
        {
          method: 'POST',
          body: JSON.stringify({ email: resetEmail }),
        }
      );
      setResetToken(res.previewResetToken);
      setNotice(`${res.message} Kode pemulihan Anda: ${res.previewResetToken}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal meminta reset password.');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, newPassword: resetNewPass }),
      });
      setNotice(res.message);
      setTab('login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengganti password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Main Auth Card */}
        <div className="rounded-2xl border border-[#E4E2DC] bg-white p-6 sm:p-8 lg:col-span-7">
          <div className="flex items-center justify-between gap-4 border-b border-[#E4E2DC] pb-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-[#1C2421]">
                Loket Warga Republik Jomokerto
              </h1>
              <p className="mt-1 text-xs text-[#5B6561]">
                Masuk, daftar akun baru, atau pulihkan kata sandi melalui email opsional.
              </p>
            </div>
          </div>

          {/* Interactive Tabs */}
          <div className="mt-4 flex items-center gap-1 rounded-lg bg-[#F8F7F4] p-1">
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setError(null);
              }}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === 'login' ? 'bg-white text-[#1C2421] shadow-sm' : 'text-[#5B6561]'
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('register');
                setError(null);
              }}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === 'register' ? 'bg-white text-[#1C2421] shadow-sm' : 'text-[#5B6561]'
              }`}
            >
              Daftar Akun
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('reset');
                setError(null);
              }}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === 'reset' ? 'bg-white text-[#1C2421] shadow-sm' : 'text-[#5B6561]'
              }`}
            >
              Reset Password
            </button>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </div>
          )}
          {notice && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              {notice}
            </div>
          )}

          {tab === 'login' && (
            <form onSubmit={handleLogin} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C2421]">
                  Username atau Email
                </label>
                <input
                  type="text"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder="contoh: presiden_jomok"
                  className="w-full rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 text-sm focus:border-[#0F5E46] focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C2421]">
                  Password
                </label>
                <input
                  type="password"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 text-sm focus:border-[#0F5E46] focus:outline-none"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F5E46] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0B4A37] disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                <span>Masuk ke Portal</span>
              </button>

              <div className="border-t border-[#E4E2DC] pt-4">
                <button
                  type="button"
                  onClick={() => setShowGoogleBox((v) => !v)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#E4E2DC] bg-white px-4 py-2 text-xs font-semibold text-[#1C2421] hover:border-[#0F5E46]"
                >
                  <span>Masuk Cepat dengan Google SSO</span>
                </button>

                {showGoogleBox && (
                  <div className="mt-3 rounded-xl border border-[#E4E2DC] bg-[#F8F7F4] p-3 text-xs space-y-2">
                    <p className="text-[#5B6561]">
                      {publicConfig.googleClientId
                        ? 'Google OAuth aktif. Masukkan email Google Anda untuk terhubung:'
                        : 'Mode Prototipe SSO Google (Self-Host): masukkan email Google untuk masuk/buat akun otomatis.'}
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={googleEmailInput}
                        onChange={(e) => setGoogleEmailInput(e.target.value)}
                        placeholder="nama@gmail.com"
                        className="flex-1 rounded-lg border border-[#E4E2DC] bg-white px-3 py-1.5 text-xs focus:border-[#0F5E46] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleGooglePrototypeLogin}
                        disabled={loading}
                        className="rounded-lg bg-[#0F5E46] px-3 py-1.5 font-semibold text-white hover:bg-[#0B4A37] whitespace-nowrap"
                      >
                        Lanjut SSO
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </form>
          )}

          {tab === 'register' && (
            <form onSubmit={handleRegister} className="mt-5 space-y-4">
              <div className="flex items-center gap-4 rounded-xl border border-[#E4E2DC] bg-[#F8F7F4] p-3">
                <img
                  src={regAvatar}
                  alt="Foto Profil Warga"
                  referrerPolicy="no-referrer"
                  className="h-14 w-14 rounded-xl border border-[#E4E2DC] object-cover bg-white"
                />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-[#1C2421]">
                    Foto Profil (Opsional)
                  </p>
                  <p className="text-[11px] text-[#5B6561]">
                    Jika tidak diunggah, sistem otomatis memakai foto warga default.
                  </p>
                  <label className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[#E4E2DC] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1C2421] hover:border-[#0F5E46]">
                    <Upload className="h-3 w-3" />
                    <span>Pilih Foto</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C2421]">
                  Username (Wajib)
                </label>
                <input
                  type="text"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="contoh: pendekar_ngawi"
                  className="w-full rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 text-sm focus:border-[#0F5E46] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C2421]">
                  Email (Opsional — untuk reset password &amp; notifikasi)
                </label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="boleh dikosongkan"
                  className="w-full rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 text-sm focus:border-[#0F5E46] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C2421]">
                  Password (Wajib, min. 6 karakter)
                </label>
                <input
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 text-sm focus:border-[#0F5E46] focus:outline-none"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F5E46] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0B4A37] disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                <span>Daftar sebagai Warga Guest</span>
              </button>
            </form>
          )}

          {tab === 'reset' && (
            <div className="mt-5 space-y-5">
              <form onSubmit={handleRequestReset} className="space-y-3">
                <p className="text-xs text-[#5B6561]">
                  1. Masukkan email yang pernah Anda daftarkan untuk membuat kode reset password.
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="email@contoh.com"
                    className="flex-1 rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 text-sm focus:border-[#0F5E46] focus:outline-none"
                    required
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-lg border border-[#0F5E46] px-4 py-2 text-xs font-semibold text-[#0F5E46] hover:bg-[#0F5E46]/10 whitespace-nowrap"
                  >
                    Minta Kode
                  </button>
                </div>
              </form>

              <form onSubmit={handleConfirmReset} className="space-y-3 border-t border-[#E4E2DC] pt-4">
                <p className="text-xs text-[#5B6561]">
                  2. Masukkan kode reset dan password baru Anda.
                </p>
                <input
                  type="text"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="Kode reset (contoh: JMK-RST-...)"
                  className="w-full rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 font-mono text-sm focus:border-[#0F5E46] focus:outline-none"
                  required
                />
                <input
                  type="password"
                  value={resetNewPass}
                  onChange={(e) => setResetNewPass(e.target.value)}
                  placeholder="Password baru (min. 6 karakter)"
                  className="w-full rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 text-sm focus:border-[#0F5E46] focus:outline-none"
                  required
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F5E46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B4A37]"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>Simpan Password Baru</span>
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Prototype Demo Accounts Helper */}
        <div className="space-y-4 lg:col-span-5">
          <div className="rounded-2xl border border-[#E4E2DC] bg-white p-6">
            <h2 className="font-display text-lg font-bold text-[#1C2421]">
              Akun Uji Coba Peran (Prototipe)
            </h2>
            <p className="mt-1 text-xs text-[#5B6561]">
              Klik salah satu akun di bawah untuk mengisi form login dengan cepat (kata sandi:{' '}
              <code className="font-mono text-[#1C2421]">password123</code>).
            </p>

            <div className="mt-4 divide-y divide-[#E4E2DC] rounded-xl border border-[#E4E2DC]">
              {[
                { username: 'presiden_jomok', role: 'superadmin', note: 'Kontrol penuh & kelola peran' },
                { username: 'menteri_ngawi', role: 'admin', note: 'Moderasi & verifikasi KTP' },
                { username: 'nahida_ngawi', role: 'member', note: 'Punya KTP (Sumeru)' },
                { username: 'warga_pendatang', role: 'guest', note: 'Belum mencetak KTP' },
              ].map((demo) => (
                <button
                  key={demo.username}
                  type="button"
                  onClick={() => {
                    setTab('login');
                    setLoginId(demo.username);
                    setLoginPass('password123');
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-[#F8F7F4] transition-colors"
                >
                  <div>
                    <p className="font-mono text-xs font-semibold text-[#1C2421]">
                      @{demo.username}
                    </p>
                    <p className="text-[11px] text-[#5B6561]">{demo.note}</p>
                  </div>
                  <span className="font-mono text-[11px] font-medium text-[#0F5E46]">
                    {demo.role}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
