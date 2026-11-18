import React, { useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { AI_ASPECT_RATIOS, type AiAspectRatio } from '../shared/types';
import { apiFetch } from '../lib/api';

interface AiImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectImage: (imageDataUrl: string) => void;
  defaultPrompt?: string;
}

export function AiImageModal({
  isOpen,
  onClose,
  onSelectImage,
  defaultPrompt = '',
}: AiImageModalProps) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [aspectRatio, setAspectRatio] = useState<AiAspectRatio>('1:1');
  const [quality, setQuality] = useState<'lite' | 'standard' | 'studio'>('lite');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [modelUsed, setModelUsed] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{
        imageDataUrl: string;
        modelUsed: string;
      }>('/api/ai/generate-image', {
        method: 'POST',
        timeoutMs: 40000,
        body: JSON.stringify({ prompt, aspectRatio, quality }),
      });
      setGeneratedUrl(res.imageDataUrl);
      setModelUsed(res.modelUsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat gambar AI.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Studio Gambar Gemini AI"
    >
      <div className="w-full max-w-xl rounded-2xl border border-[#E4E2DC] bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#E4E2DC] pb-4">
          <div>
            <h3 className="font-display text-lg font-bold text-[#1C2421]">
              Studio Gambar Gemini AI
            </h3>
            <p className="mt-0.5 text-xs text-[#5B6561]">
              Buat ilustrasi postingan atau avatar dengan rasio aspek pilihan Anda.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#5B6561] hover:bg-[#F8F7F4] hover:text-[#1C2421]"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleGenerate} className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[#1C2421]">
              Deskripsi Gambar (Prompt)
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Contoh: Ilustrasi warung kopi modern di alun-alun Ngawi dengan karakter gamer duduk santai saat senja..."
              className="w-full rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 text-sm text-[#1C2421] focus:border-[#0F5E46] focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[#1C2421]">
              Rasio Aspek Gambar
            </label>
            <div className="grid grid-cols-4 gap-2">
              {AI_ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setAspectRatio(ratio)}
                  className={`rounded-lg border px-2.5 py-2 font-mono text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    aspectRatio === ratio
                      ? 'border-[#0F5E46] bg-[#0F5E46] text-white'
                      : 'border-[#E4E2DC] bg-[#F8F7F4] text-[#1C2421] hover:border-[#0F5E46]'
                  }`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[#1C2421]">
              Model Generasi (Butuh Billing Aktif pada API Key)
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setQuality('lite')}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  quality === 'lite'
                    ? 'border-[#0F5E46] bg-[#0F5E46]/10 text-[#0F5E46]'
                    : 'border-[#E4E2DC] text-[#5B6561]'
                }`}
              >
                <span className="block font-semibold">Standar Lite</span>
                <span className="font-mono text-[10px]">gemini-3.1-flash-lite-image</span>
              </button>
              <button
                type="button"
                onClick={() => setQuality('standard')}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  quality === 'standard'
                    ? 'border-[#0F5E46] bg-[#0F5E46]/10 text-[#0F5E46]'
                    : 'border-[#E4E2DC] text-[#5B6561]'
                }`}
              >
                <span className="block font-semibold">Nano Banana 2.1</span>
                <span className="font-mono text-[10px]">gemini-nano-banana-2.1</span>
              </button>
              <button
                type="button"
                onClick={() => setQuality('studio')}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  quality === 'studio'
                    ? 'border-[#0F5E46] bg-[#0F5E46]/10 text-[#0F5E46]'
                    : 'border-[#E4E2DC] text-[#5B6561]'
                }`}
              >
                <span className="block font-semibold">Kualitas Studio</span>
                <span className="font-mono text-[10px]">gemini-3-pro-image</span>
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </div>
          )}

          {generatedUrl && (
            <div className="space-y-2 rounded-xl border border-[#E4E2DC] bg-[#F8F7F4] p-3">
              <img
                src={generatedUrl}
                alt="Hasil gambar Gemini AI"
                referrerPolicy="no-referrer"
                className="max-h-64 w-full rounded-lg object-contain bg-white"
              />
              <div className="flex items-center justify-between gap-2 text-xs text-[#5B6561]">
                <span className="font-mono">
                  {modelUsed} · {aspectRatio}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onSelectImage(generatedUrl);
                    onClose();
                  }}
                  className="rounded-lg bg-[#0F5E46] px-3 py-1.5 font-medium text-white hover:bg-[#0B4A37] whitespace-nowrap shrink-0"
                >
                  Gunakan Gambar Ini
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-[#E4E2DC] pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#E4E2DC] px-4 py-2 text-xs font-medium text-[#5B6561] hover:text-[#1C2421]"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0F5E46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B4A37] disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Membuat Gambar...</span>
                </>
              ) : (
                <>
                  <ImagePlus className="h-3.5 w-3.5" />
                  <span>Buat Gambar AI</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
