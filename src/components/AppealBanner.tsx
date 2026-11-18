import React, { useCallback, useEffect, useState } from 'react';
import { Gavel, Loader2, Scale, ShieldAlert, X } from 'lucide-react';
import type { AppealStage, ModerationAppeal } from '../shared/types';
import { apiFetch, formatDateId, formatTimeId } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const STAGE_LABEL: Record<AppealStage, string> = {
  pledoi: 'Menunggu Replik Moderator',
  replik: 'Giliran Warga: Kirim Duplik',
  duplik: 'Duplik Terkirim · Menunggu Putusan',
  rejected_for_kasasi: 'Ditolak Tingkat I · Bisa Kasasi',
  kasasi: 'Memori Kasasi Diajukan',
  accepted: 'Banding Dikabulkan · Akun Pulih',
  final_rejected: 'Putusan Inkrah (Kasasi Ditolak)',
};

export function AppealBanner() {
  const { citizen, refreshMe } = useAuth();
  const [open, setOpen] = useState(false);
  const [appeals, setAppeals] = useState<ModerationAppeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [pledoiText, setPledoiText] = useState('');
  const [responseText, setResponseText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSuspended = citizen?.user.accountStatus === 'suspended';

  const loadMyAppeals = useCallback(async () => {
    if (!citizen) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ appeals: ModerationAppeal[] }>('/api/appeals/me');
      setAppeals(res.appeals);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [citizen]);

  useEffect(() => {
    if (isSuspended) {
      loadMyAppeals();
    }
  }, [isSuspended, loadMyAppeals]);

  if (!isSuspended || !citizen) return null;

  const latestAppeal = appeals[0];
  const hasOpenAppeal =
    latestAppeal &&
    latestAppeal.stage !== 'accepted' &&
    latestAppeal.stage !== 'final_rejected';

  async function handleSubmitPledoi(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/api/appeals', {
        method: 'POST',
        body: JSON.stringify({ pledoiText }),
      });
      setPledoiText('');
      await loadMyAppeals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengajukan banding.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRespond(appealId: string, e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/appeals/${appealId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ responseText }),
      });
      setResponseText('');
      await loadMyAppeals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim tanggapan sidang.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="border-b border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 sm:px-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>
              <strong>Akun Ditangguhkan (Suspended):</strong>{' '}
              {citizen.user.suspendedReason || 'Hak posting, chat, dan buat grup dibekukan sementara.'}
              {latestAppeal && (
                <span className="ml-2 font-mono text-[11px] underline">
                  Status Sidang: {STAGE_LABEL[latestAppeal.stage]}
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                loadMyAppeals();
                refreshMe();
              }}
              className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[11px] font-medium text-red-800 hover:bg-red-50"
            >
              Cek Status
            </button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1 text-[11px] font-semibold text-white hover:bg-red-800"
            >
              <Scale className="h-3.5 w-3.5" />
              <span>Buka Sidang Banding</span>
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#E4E2DC] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#E4E2DC] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <Gavel className="h-5 w-5 text-[#B8860B]" />
                <div>
                  <h2 className="font-display text-lg font-bold text-[#1C2421]">
                    Mahkamah Banding Republik Jomokerto
                  </h2>
                  <p className="text-xs text-[#5B6561]">
                    Alur Sidang Resmi: Pledoi Warga → Replik Moderator → Duplik Warga → Kasasi
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-[#5B6561] hover:bg-[#F8F7F4]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
                <p className="font-semibold">Alasan Penangguhan Akun @{citizen.user.username}:</p>
                <p className="mt-1">
                  {citizen.user.suspendedReason || 'Pelanggaran tata tertib warga.'}
                </p>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8 text-xs text-[#5B6561]">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Memuat berkas perkara...
                </div>
              ) : (
                <>
                  {latestAppeal && (
                    <div className="space-y-3 rounded-2xl border border-[#E4E2DC] bg-[#F8F7F4] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E2DC] pb-2.5">
                        <span className="font-mono text-xs font-semibold text-[#0F5E46]">
                          Perkara #{latestAppeal.id}
                        </span>
                        <span className="rounded-md border border-[#E4E2DC] bg-white px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#1C2421]">
                          {STAGE_LABEL[latestAppeal.stage]}
                        </span>
                      </div>

                      {/* 1. Pledoi */}
                      <div className="rounded-xl border border-[#E4E2DC] bg-white p-3 text-xs space-y-1">
                        <p className="font-semibold text-[#0F5E46]">1. Pledoi / Banding Awal Warga</p>
                        <p className="whitespace-pre-line text-[#1C2421]">{latestAppeal.pledoiText}</p>
                      </div>

                      {/* 2. Replik */}
                      {latestAppeal.replikText && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs space-y-1">
                          <p className="font-semibold text-amber-950">
                            2. Replik Dewan Moderator ({latestAppeal.reviewedBy || 'Admin'})
                          </p>
                          <p className="whitespace-pre-line text-amber-900">
                            {latestAppeal.replikText}
                          </p>
                        </div>
                      )}

                      {/* 3. Duplik */}
                      {latestAppeal.duplikText && (
                        <div className="rounded-xl border border-[#E4E2DC] bg-white p-3 text-xs space-y-1">
                          <p className="font-semibold text-[#0F5E46]">3. Duplik Balasan Warga</p>
                          <p className="whitespace-pre-line text-[#1C2421]">
                            {latestAppeal.duplikText}
                          </p>
                        </div>
                      )}

                      {/* Verdict / Note before or after Kasasi */}
                      {latestAppeal.adminVerdictNote && (
                        <div className="rounded-xl border border-[#E4E2DC] bg-white p-3 text-xs space-y-1">
                          <p className="font-semibold text-[#1C2421]">
                            Catatan Putusan Hakim ({latestAppeal.reviewedBy || 'Admin'})
                          </p>
                          <p className="whitespace-pre-line text-[#5B6561]">
                            {latestAppeal.adminVerdictNote}
                          </p>
                        </div>
                      )}

                      {/* 4. Kasasi */}
                      {latestAppeal.kasasiText && (
                        <div className="rounded-xl border border-[#E4E2DC] bg-white p-3 text-xs space-y-1">
                          <p className="font-semibold text-[#B8860B]">
                            4. Memori Kasasi Tingkat Akhir
                          </p>
                          <p className="whitespace-pre-line text-[#1C2421]">
                            {latestAppeal.kasasiText}
                          </p>
                        </div>
                      )}

                      <p className="text-[11px] text-[#5B6561] tabular-nums">
                        Diperbarui {formatDateId(latestAppeal.updatedAt)}{' '}
                        {formatTimeId(latestAppeal.updatedAt)}
                      </p>

                      {/* Reply form for Replik (submit Duplik) or Rejected-for-Kasasi (submit Kasasi) */}
                      {(latestAppeal.stage === 'replik' ||
                        latestAppeal.stage === 'rejected_for_kasasi') && (
                        <form
                          onSubmit={(e) => handleRespond(latestAppeal.id, e)}
                          className="mt-3 space-y-2 border-t border-[#E4E2DC] pt-3"
                        >
                          <label className="block text-xs font-semibold text-[#1C2421]">
                            {latestAppeal.stage === 'replik'
                              ? 'Ajukan Duplik Anda untuk Menjawab Replik Moderator:'
                              : 'Ajukan Memori Kasasi (Upaya Hukum Terakhir):'}
                          </label>
                          <textarea
                            rows={3}
                            value={responseText}
                            onChange={(e) => setResponseText(e.target.value)}
                            placeholder={
                              latestAppeal.stage === 'replik'
                                ? 'Tulis argumen Duplik pembelaan Anda...'
                                : 'Tulis Memori Kasasi ke Mahkamah Agung Jomokerto...'
                            }
                            className="w-full rounded-xl border border-[#E4E2DC] bg-white px-3 py-2 text-xs focus:border-[#0F5E46] focus:outline-none"
                            required
                            minLength={5}
                          />
                          <button
                            type="submit"
                            disabled={submitting || responseText.trim().length < 5}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F5E46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B4A37] disabled:opacity-50"
                          >
                            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            <span>
                              {latestAppeal.stage === 'replik' ? 'Kirim Duplik' : 'Ajukan Kasasi'}
                            </span>
                          </button>
                        </form>
                      )}
                    </div>
                  )}

                  {!hasOpenAppeal && (
                    <form
                      onSubmit={handleSubmitPledoi}
                      className="space-y-3 rounded-2xl border border-[#E4E2DC] bg-white p-4"
                    >
                      <h3 className="font-display text-sm font-bold text-[#1C2421]">
                        {latestAppeal?.stage === 'final_rejected'
                          ? 'Ajukan Peninjauan Kembali (PK / Pledoi Baru)'
                          : 'Ajukan Banding Pertama (Pledoi Warga)'}
                      </h3>
                      <p className="text-xs text-[#5B6561]">
                        Jelaskan klarifikasi atau komitmen perbaikan agar Admin/Superadmin meninjau pemulihan akun Anda.
                      </p>
                      <textarea
                        rows={4}
                        value={pledoiText}
                        onChange={(e) => setPledoiText(e.target.value)}
                        placeholder="Yang Mulia Hakim Moderator Republik Jomokerto, dengan ini saya mengajukan Pledoi..."
                        className="w-full rounded-xl border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2.5 text-xs focus:border-[#0F5E46] focus:outline-none"
                        required
                        minLength={10}
                      />
                      <button
                        type="submit"
                        disabled={submitting || pledoiText.trim().length < 10}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F5E46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B4A37] disabled:opacity-50"
                      >
                        {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        <span>Kirim Pledoi Banding</span>
                      </button>
                    </form>
                  )}
                </>
              )}

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
