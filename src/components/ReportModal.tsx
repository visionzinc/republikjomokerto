import React, { useState } from 'react';
import { Flag, Loader2, X } from 'lucide-react';
import type { ReportTargetType } from '../shared/types';
import { apiFetch } from '../lib/api';

export interface ReportTargetPayload {
  targetType: ReportTargetType;
  targetId: string;
  targetLabel: string;
  snippet?: string;
}

interface ReportModalProps {
  target: ReportTargetPayload | null;
  onClose: () => void;
  onSuccess?: () => void;
}

const REPORT_CATEGORIES = [
  'Spam / Promosi Liar',
  'Ujaran Kebencian / Toxic',
  'Pelecehan / Ancaman',
  'Penipuan / Phishing',
  'Konten Tidak Pantas',
  'Pelanggaran Tata Tertib Warga',
];

export function ReportModal({ target, onClose, onSuccess }: ReportModalProps) {
  const [category, setCategory] = useState(REPORT_CATEGORIES[0]);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!target) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          targetType: target.targetType,
          targetId: target.targetId,
          category,
          reason,
        }),
      });
      setSubmitted(true);
      onSuccess?.();
      window.setTimeout(() => {
        setSubmitted(false);
        setReason('');
        onClose();
      }, 1100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim laporan.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-[#E4E2DC] bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#E4E2DC] pb-3">
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-red-700" />
            <div>
              <h2 className="font-display text-base font-bold text-[#1C2421]">
                Laporkan ke Dewan Moderator
              </h2>
              <p className="text-xs text-[#5B6561]">
                Target: <span className="font-medium text-[#1C2421]">{target.targetLabel}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[#5B6561] hover:bg-[#F8F7F4]"
            aria-label="Tutup modal laporan"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {submitted ? (
          <div className="py-8 text-center space-y-2">
            <p className="text-sm font-semibold text-[#0F5E46]">
              Laporan berhasil dikirim ke Admin &amp; Superadmin!
            </p>
            <p className="text-xs text-[#5B6561]">
              Dewan moderator Republik Jomokerto akan segera meninjau berkas laporan ini.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {target.snippet && (
              <div className="rounded-xl border border-[#E4E2DC] bg-[#F8F7F4] p-3 text-xs text-[#5B6561]">
                <p className="font-mono text-[10px] uppercase tracking-wider mb-1">
                  Cuplikan Terlapor ({target.targetType})
                </p>
                <p className="line-clamp-3 text-[#1C2421] italic">“{target.snippet}”</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#1C2421] mb-1.5">
                Kategori Pelanggaran
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 text-xs text-[#1C2421] focus:border-[#0F5E46] focus:outline-none"
              >
                {REPORT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1C2421] mb-1.5">
                Kronologi &amp; Alasan Laporan
              </label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Jelaskan pelanggaran yang terjadi agar moderator dapat menindak..."
                className="w-full rounded-xl border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 text-xs text-[#1C2421] focus:border-[#0F5E46] focus:outline-none"
                required
                minLength={5}
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[#E4E2DC] px-4 py-2 text-xs font-medium text-[#5B6561] hover:text-[#1C2421]"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting || reason.trim().length < 5}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Kirim Laporan</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
