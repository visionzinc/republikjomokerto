import React, { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Download,
  Flag,
  Gavel,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import type {
  AccountStatus,
  AppealStage,
  CitizenRecord,
  ContentReport,
  ModerationAppeal,
  UserRole,
} from '../shared/types';
import { apiFetch, formatDateId, formatTimeId, getStoredToken } from '../lib/api';
import { useAuth } from '../context/AuthContext';

type AdminTab = 'citizens' | 'reports' | 'appeals';

const APPEAL_STAGE_BADGE: Record<AppealStage, string> = {
  pledoi: 'Pledoi Masuk · Menunggu Admin',
  replik: 'Replik Terkirim · Menunggu Duplik Warga',
  duplik: 'Duplik Masuk · Menunggu Putusan',
  rejected_for_kasasi: 'Ditolak Tingkat I · Menunggu Kasasi',
  kasasi: 'Memori Kasasi · Putusan Akhir',
  accepted: 'Dikabulkan · Akun Pulih',
  final_rejected: 'Inkrah (Kasasi Ditolak)',
};

export function AdminPage() {
  const { citizen } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('citizens');
  const [citizens, setCitizens] = useState<CitizenRecord[]>([]);
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [appeals, setAppeals] = useState<ModerationAppeal[]>([]);
  const [dbDriver, setDbDriver] = useState<string>('sqlite');
  const [postsCount, setPostsCount] = useState(0);
  const [pinsCount, setPinsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportFilter, setReportFilter] = useState<'all' | 'pending' | 'resolved' | 'dismissed'>(
    'all'
  );
  const [appealDrafts, setAppealDrafts] = useState<Record<string, string>>({});
  const [suspendDrafts, setSuspendDrafts] = useState<Record<string, string>>({});
  const [suspendingUserId, setSuspendingUserId] = useState<string | null>(null);

  const isAdmin =
    citizen?.user.role === 'admin' || citizen?.user.role === 'superadmin';
  const isSuperadmin = citizen?.user.role === 'superadmin';

  const loadAllAdminData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ovRes, repRes, aplRes] = await Promise.all([
        apiFetch<{
          dbDriver: string;
          citizens: CitizenRecord[];
          postsCount: number;
          pinsCount: number;
        }>('/api/admin/overview'),
        apiFetch<{ reports: ContentReport[] }>('/api/admin/reports'),
        apiFetch<{ appeals: ModerationAppeal[] }>('/api/admin/appeals'),
      ]);
      setDbDriver(ovRes.dbDriver);
      setCitizens(ovRes.citizens);
      setPostsCount(ovRes.postsCount);
      setPinsCount(ovRes.pinsCount);
      setReports(repRes.reports);
      setAppeals(aplRes.appeals);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat konsol admin.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadAllAdminData();
  }, [isAdmin, loadAllAdminData]);

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <div className="rounded-2xl border border-[#E4E2DC] bg-white p-8">
          <ShieldAlert className="mx-auto h-8 w-8 text-red-700" />
          <h1 className="mt-3 font-display text-xl font-bold text-[#1C2421]">
            Akses Terbatas Admin &amp; Superadmin
          </h1>
          <p className="mt-1 text-xs text-[#5B6561]">
            Masuk dengan akun <code className="font-mono">presiden_jomok</code> (superadmin) atau{' '}
            <code className="font-mono">menteri_ngawi</code> (admin) untuk mengelola warga, laporan, dan sidang banding.
          </p>
        </div>
      </div>
    );
  }

  async function handleRoleChange(userId: string, role: UserRole) {
    setError(null);
    try {
      await apiFetch(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      setCitizens((prev) =>
        prev.map((c) => (c.user.id === userId ? { ...c, user: { ...c.user, role } } : c))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah peran.');
    }
  }

  async function handleAccountStatusChange(
    userId: string,
    accountStatus: AccountStatus,
    reason?: string
  ) {
    setError(null);
    try {
      const res = await apiFetch<{ user: CitizenRecord['user'] }>(
        `/api/admin/users/${userId}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ accountStatus, reason }),
        }
      );
      setCitizens((prev) =>
        prev.map((c) => (c.user.id === userId ? { ...c, user: res.user } : c))
      );
      setSuspendingUserId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah status akun.');
    }
  }

  async function handleVerifyKtp(userId: string, verified: boolean) {
    setError(null);
    try {
      await apiFetch(`/api/admin/ktp/${userId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ verified }),
      });
      setCitizens((prev) =>
        prev.map((c) =>
          c.user.id === userId && c.ktp
            ? { ...c, ktp: { ...c.ktp, verifiedByAdmin: verified } }
            : c
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui verifikasi KTP.');
    }
  }

  async function handleReportAction(
    reportId: string,
    action: 'resolve' | 'dismiss' | 'delete_content' | 'suspend_user' | 'delete_and_suspend'
  ) {
    setError(null);
    try {
      await apiFetch(`/api/admin/reports/${reportId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      await loadAllAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memproses laporan.');
    }
  }

  async function handleAppealAction(
    appealId: string,
    action: 'accept' | 'replik' | 'reject_to_kasasi' | 'final_reject'
  ) {
    setError(null);
    try {
      await apiFetch(`/api/admin/appeals/${appealId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action,
          text: appealDrafts[appealId] || '',
        }),
      });
      setAppealDrafts((prev) => ({ ...prev, [appealId]: '' }));
      await loadAllAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memproses sidang banding.');
    }
  }

  async function handleDownloadDbSnapshot() {
    const token = getStoredToken();
    const res = await fetch('/api/admin/export-db', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jomokerto-export.db.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  const pendingReportsCount = reports.filter((r) => r.status === 'pending').length;
  const openAppealsCount = appeals.filter(
    (a) => a.stage !== 'accepted' && a.stage !== 'final_rejected'
  ).length;
  const filteredReports = reports.filter(
    (r) => reportFilter === 'all' || r.status === reportFilter
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[#1C2421]">
            Konsol Tata Kelola &amp; Moderasi Republik
          </h1>
          <p className="mt-1 text-sm text-[#5B6561]">
            Kelola peran warga (RBAC), verifikasi KTP, tinjau laporan masuk, dan pimpin Sidang Banding (Replik · Duplik · Kasasi).
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadDbSnapshot}
          className="inline-flex items-center gap-2 rounded-lg border border-[#E4E2DC] bg-white px-4 py-2 text-xs font-semibold text-[#1C2421] hover:border-[#0F5E46]"
        >
          <Download className="h-3.5 w-3.5 text-[#0F5E46]" />
          <span>Ekspor Snapshot .db.json</span>
        </button>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 rounded-2xl border border-[#E4E2DC] bg-white p-5">
        <div>
          <p className="text-xs text-[#5B6561]">Mesin Database Aktif</p>
          <p className="mt-1 font-mono text-base font-semibold text-[#0F5E46]">
            {dbDriver === 'postgres'
              ? 'PostgreSQL (Prisma)'
              : dbDriver === 'sqlite'
                ? 'SQLite (jomokerto.db)'
                : 'JSON Sementara (/tmp)'}
          </p>
        </div>
        <div>
          <p className="text-xs text-[#5B6561]">Total Warga / KTP</p>
          <p className="mt-1 font-mono text-base font-semibold tabular-nums text-[#1C2421]">
            {citizens.length} / {citizens.filter((c) => Boolean(c.ktp)).length}
          </p>
        </div>
        <div>
          <p className="text-xs text-[#5B6561]">Timeline &amp; Pin Peta</p>
          <p className="mt-1 font-mono text-base font-semibold tabular-nums text-[#1C2421]">
            {postsCount} kiriman · {pinsCount} pin
          </p>
        </div>
        <div>
          <p className="text-xs text-[#5B6561]">Antrean Moderasi</p>
          <p className="mt-1 font-mono text-base font-semibold tabular-nums text-[#1C2421]">
            {pendingReportsCount} laporan · {openAppealsCount} sidang
          </p>
        </div>
      </div>

      {dbDriver === 'vercel-json' && (
        <div className="rounded-xl border border-[#C69214]/40 bg-[#C69214]/10 px-4 py-3 text-xs text-[#1C2421]">
          <strong>Peringatan Persistensi Vercel:</strong> Server sedang berjalan dalam mode fallback{' '}
          <code className="font-mono">/tmp/jomokerto.db.json</code> karena variabel{' '}
          <code className="font-mono">POSTGRES_URL</code> atau{' '}
          <code className="font-mono">DATABASE_URL_POOLED</code> belum terdeteksi.
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-[#E4E2DC] bg-white p-1.5">
        <button
          type="button"
          onClick={() => setActiveTab('citizens')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'citizens'
              ? 'bg-[#0F5E46] text-white'
              : 'text-[#5B6561] hover:text-[#1C2421]'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>Warga, KTP &amp; RBAC</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'reports'
              ? 'bg-[#0F5E46] text-white'
              : 'text-[#5B6561] hover:text-[#1C2421]'
          }`}
        >
          <Flag className="h-3.5 w-3.5" />
          <span>Laporan Masuk ({pendingReportsCount})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('appeals')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'appeals'
              ? 'bg-[#0F5E46] text-white'
              : 'text-[#5B6561] hover:text-[#1C2421]'
          }`}
        >
          <Scale className="h-3.5 w-3.5" />
          <span>Sidang Banding ({openAppealsCount})</span>
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}

      {/* TAB 1: Citizens & RBAC */}
      {activeTab === 'citizens' && (
        <div className="overflow-x-auto rounded-2xl border border-[#E4E2DC] bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#E4E2DC] bg-[#F8F7F4] text-[#5B6561]">
              <tr>
                <th className="px-4 py-3 font-semibold">Warga</th>
                <th className="px-4 py-3 font-semibold">Peran RBAC</th>
                <th className="px-4 py-3 font-semibold">Status Akses</th>
                <th className="px-4 py-3 font-semibold">Nomor KTP</th>
                <th className="px-4 py-3 font-semibold text-right">Verifikasi &amp; Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E2DC]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[#5B6561]">
                    Memuat data warga...
                  </td>
                </tr>
              ) : (
                citizens.map((item) => {
                  const isSuspended = item.user.accountStatus === 'suspended';
                  const isSelf = item.user.id === citizen.user.id;
                  const canModerateTarget =
                    !isSelf && (item.user.role !== 'superadmin' || isSuperadmin);

                  return (
                    <tr key={item.user.id} className="hover:bg-[#F8F7F4]/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={item.user.avatarUrl}
                            alt={item.user.username}
                            referrerPolicy="no-referrer"
                            className="h-8 w-8 rounded-full object-cover"
                          />
                          <div>
                            <p className="font-semibold text-[#1C2421]">@{item.user.username}</p>
                            <p className="font-mono text-[11px] text-[#5B6561]">
                              {item.ktp?.locationName || item.user.email || 'tanpa domisili'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isSuperadmin ? (
                          <select
                            value={item.user.role}
                            onChange={(e) =>
                              handleRoleChange(item.user.id, e.target.value as UserRole)
                            }
                            className="rounded-md border border-[#E4E2DC] bg-white px-2 py-1 font-mono text-xs"
                          >
                            <option value="guest">guest</option>
                            <option value="member">member</option>
                            <option value="admin">admin</option>
                            <option value="superadmin">superadmin</option>
                          </select>
                        ) : (
                          <span className="font-mono font-medium text-[#1C2421]">
                            {item.user.role}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isSuspended ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-red-700">
                            Suspended
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-900">
                            Aktif
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums">
                        {item.ktp?.ktpSerial || 'Belum dicetak'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          {item.ktp && (
                            <button
                              type="button"
                              onClick={() =>
                                handleVerifyKtp(item.user.id, !item.ktp!.verifiedByAdmin)
                              }
                              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 font-medium ${
                                item.ktp.verifiedByAdmin
                                  ? 'border-[#0F5E46] bg-[#0F5E46]/10 text-[#0F5E46]'
                                  : 'border-[#E4E2DC] text-[#5B6561] hover:border-[#0F5E46]'
                              }`}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>
                                {item.ktp.verifiedByAdmin ? 'Terverifikasi' : 'Verifikasi'}
                              </span>
                            </button>
                          )}

                          {canModerateTarget &&
                            (isSuspended ? (
                              <button
                                type="button"
                                onClick={() =>
                                  handleAccountStatusChange(item.user.id, 'active')
                                }
                                className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-900 hover:opacity-90"
                              >
                                <ShieldCheck className="h-3.5 w-3.5" />
                                <span>Pulihkan</span>
                              </button>
                            ) : suspendingUserId === item.user.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={suspendDrafts[item.user.id] || ''}
                                  onChange={(e) =>
                                    setSuspendDrafts((prev) => ({
                                      ...prev,
                                      [item.user.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="Alasan suspend..."
                                  className="w-32 rounded border border-[#E4E2DC] bg-[#F8F7F4] px-2 py-1 text-[11px]"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleAccountStatusChange(
                                      item.user.id,
                                      'suspended',
                                      suspendDrafts[item.user.id]
                                    )
                                  }
                                  className="rounded bg-red-700 px-2 py-1 text-[11px] font-semibold text-white"
                                >
                                  OK
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSuspendingUserId(null)}
                                  className="text-[11px] text-[#5B6561] px-1"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setSuspendingUserId(item.user.id)}
                                className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 font-medium text-red-700 hover:bg-red-100"
                              >
                                <Ban className="h-3.5 w-3.5" />
                                <span>Suspend</span>
                              </button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: Reports Moderation */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'all', label: 'Semua' },
                  { id: 'pending', label: 'Menunggu Tinjauan' },
                  { id: 'resolved', label: 'Ditindak / Selesai' },
                  { id: 'dismissed', label: 'Dianggap Aman' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setReportFilter(f.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    reportFilter === f.id
                      ? 'border-[#0F5E46] bg-[#0F5E46]/10 text-[#0F5E46]'
                      : 'border-[#E4E2DC] bg-white text-[#5B6561]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {filteredReports.length === 0 ? (
            <div className="rounded-2xl border border-[#E4E2DC] bg-white p-10 text-center text-xs text-[#5B6561]">
              Tidak ada laporan pada kategori ini.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredReports.map((rep) => (
                <div
                  key={rep.id}
                  className="rounded-2xl border border-[#E4E2DC] bg-white p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-[#1C2421]">#{rep.id}</span>
                        <span className="rounded border border-[#E4E2DC] bg-[#F8F7F4] px-2 py-0.5 font-mono text-[11px]">
                          {rep.targetType}
                        </span>
                        <span className="font-semibold text-red-700">{rep.category}</span>
                      </div>
                      <p className="mt-1 text-xs text-[#5B6561]">
                        Pelapor: <strong className="text-[#1C2421]">@{rep.reporterUsername}</strong> ·
                        Terlapor: <strong className="text-[#1C2421]">@{rep.targetUsername}</strong> ·{' '}
                        <span className="tabular-nums">
                          {formatDateId(rep.createdAt)} {formatTimeId(rep.createdAt)}
                        </span>
                      </p>
                    </div>

                    <span
                      className={`rounded-md border px-2.5 py-0.5 font-mono text-[11px] font-semibold ${
                        rep.status === 'pending'
                          ? 'border-amber-200 bg-amber-50 text-amber-900'
                          : rep.status === 'resolved'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                            : 'border-[#E4E2DC] bg-[#F8F7F4] text-[#5B6561]'
                      }`}
                    >
                      {rep.status}
                    </span>
                  </div>

                  <div className="rounded-xl border border-[#E4E2DC] bg-[#F8F7F4] p-3 text-xs space-y-1">
                    <p className="font-semibold text-[#1C2421]">Bukti / Cuplikan Terlapor:</p>
                    <p className="italic text-[#5B6561]">“{rep.targetSnippet}”</p>
                    <p className="pt-1 font-semibold text-[#1C2421]">Alasan Pelapor:</p>
                    <p className="text-[#1C2421]">{rep.reason}</p>
                  </div>

                  {rep.resolutionNote && (
                    <p className="text-xs text-[#5B6561]">
                      Keputusan ({rep.reviewedBy || 'Moderator'}):{' '}
                      <strong className="text-[#1C2421]">{rep.resolutionNote}</strong>
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleReportAction(rep.id, 'dismiss')}
                      className="rounded-lg border border-[#E4E2DC] px-3 py-1.5 text-xs font-medium text-[#5B6561] hover:border-[#0F5E46] hover:text-[#1C2421]"
                    >
                      Anggap Aman / Abaikan
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReportAction(rep.id, 'resolve')}
                      className="rounded-lg border border-[#E4E2DC] px-3 py-1.5 text-xs font-medium text-[#0F5E46] hover:border-[#0F5E46]"
                    >
                      Tandai Selesai
                    </button>
                    {(rep.targetType === 'post' || rep.targetType === 'message') && (
                      <button
                        type="button"
                        onClick={() => handleReportAction(rep.id, 'delete_content')}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Hapus Konten</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleReportAction(rep.id, 'suspend_user')}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      <span>Suspend @{rep.targetUsername}</span>
                    </button>
                    {(rep.targetType === 'post' || rep.targetType === 'message') && (
                      <button
                        type="button"
                        onClick={() => handleReportAction(rep.id, 'delete_and_suspend')}
                        className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
                      >
                        Hapus &amp; Suspend Akun
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Appeals Court (Replik, Duplik, Kasasi) */}
      {activeTab === 'appeals' && (
        <div className="space-y-4">
          {appeals.length === 0 ? (
            <div className="rounded-2xl border border-[#E4E2DC] bg-white p-10 text-center text-xs text-[#5B6561]">
              Belum ada berkas banding di Mahkamah Banding Republik Jomokerto.
            </div>
          ) : (
            appeals.map((apl) => {
              const needsAdminDecision =
                apl.stage === 'pledoi' || apl.stage === 'duplik' || apl.stage === 'kasasi';

              return (
                <div
                  key={apl.id}
                  className="rounded-2xl border border-[#E4E2DC] bg-white p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E2DC] pb-3">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={apl.avatarUrl}
                        alt={apl.username}
                        referrerPolicy="no-referrer"
                        className="h-8 w-8 rounded-full object-cover"
                      />
                      <div>
                        <p className="text-sm font-bold text-[#1C2421]">
                          Perkara @{apl.username}{' '}
                          <span className="font-mono text-xs font-normal text-[#5B6561]">
                            #{apl.id}
                          </span>
                        </p>
                        <p className="text-xs text-[#5B6561]">
                          Alasan Suspend: {apl.suspendedReason || 'Pelanggaran tata tertib'}
                        </p>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1 rounded-md border border-[#E4E2DC] bg-[#F8F7F4] px-2.5 py-1 font-mono text-[11px] font-semibold text-[#1C2421]">
                      <Gavel className="h-3.5 w-3.5 text-[#B8860B]" />
                      {APPEAL_STAGE_BADGE[apl.stage]}
                    </span>
                  </div>

                  {/* Case Transcript */}
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-[#E4E2DC] bg-[#F8F7F4] p-3 text-xs space-y-1">
                      <p className="font-semibold text-[#0F5E46]">1. Pledoi Warga</p>
                      <p className="whitespace-pre-line text-[#1C2421]">{apl.pledoiText}</p>
                    </div>

                    {apl.replikText && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs space-y-1">
                        <p className="font-semibold text-amber-950">2. Replik Moderator</p>
                        <p className="whitespace-pre-line text-amber-900">{apl.replikText}</p>
                      </div>
                    )}

                    {apl.duplikText && (
                      <div className="rounded-xl border border-[#E4E2DC] bg-[#F8F7F4] p-3 text-xs space-y-1">
                        <p className="font-semibold text-[#0F5E46]">3. Duplik Warga</p>
                        <p className="whitespace-pre-line text-[#1C2421]">{apl.duplikText}</p>
                      </div>
                    )}

                    {apl.kasasiText && (
                      <div className="rounded-xl border border-[#E4E2DC] bg-[#F8F7F4] p-3 text-xs space-y-1">
                        <p className="font-semibold text-[#B8860B]">4. Memori Kasasi Warga</p>
                        <p className="whitespace-pre-line text-[#1C2421]">{apl.kasasiText}</p>
                      </div>
                    )}
                  </div>

                  {apl.adminVerdictNote && (
                    <p className="text-xs text-[#5B6561]">
                      Putusan / Catatan Hakim ({apl.reviewedBy || 'Admin'}):{' '}
                      <strong className="text-[#1C2421]">{apl.adminVerdictNote}</strong>
                    </p>
                  )}

                  {needsAdminDecision && (
                    <div className="space-y-3 border-t border-[#E4E2DC] pt-3">
                      <textarea
                        rows={2}
                        value={appealDrafts[apl.id] || ''}
                        onChange={(e) =>
                          setAppealDrafts((prev) => ({ ...prev, [apl.id]: e.target.value }))
                        }
                        placeholder={
                          apl.stage === 'pledoi'
                            ? 'Tulis Replik moderator atau catatan putusan hakim...'
                            : 'Tulis alasan putusan hakim (opsional jika kabulkan)...'
                        }
                        className="w-full rounded-xl border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 text-xs focus:border-[#0F5E46] focus:outline-none"
                      />

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleAppealAction(apl.id, 'accept')}
                          className="rounded-lg bg-[#0F5E46] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0B4A37]"
                        >
                          Terima Banding &amp; Pulihkan Akun
                        </button>

                        {apl.stage === 'pledoi' && (
                          <button
                            type="button"
                            onClick={() => handleAppealAction(apl.id, 'replik')}
                            className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-xs font-semibold text-amber-900"
                          >
                            Kirim Replik ke Warga
                          </button>
                        )}

                        {(apl.stage === 'pledoi' || apl.stage === 'duplik') && (
                          <button
                            type="button"
                            onClick={() => handleAppealAction(apl.id, 'reject_to_kasasi')}
                            className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-1.5 text-xs font-semibold text-red-700"
                          >
                            Tolak Tingkat I (Buka Kasasi)
                          </button>
                        )}

                        {apl.stage === 'kasasi' && (
                          <button
                            type="button"
                            onClick={() => handleAppealAction(apl.id, 'final_reject')}
                            className="rounded-lg bg-red-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
                          >
                            Tolak Kasasi (Putusan Inkrah)
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
