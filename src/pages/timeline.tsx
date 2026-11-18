import React, { useEffect, useState } from 'react';
import {
  Ban,
  Flag,
  Heart,
  Image as ImageIcon,
  ImagePlus,
  Link2,
  Loader2,
  MapPin,
  Send,
  Trash2,
  Upload,
} from 'lucide-react';
import type { TimelinePost } from '../shared/types';
import { apiFetch, formatDateId, formatTimeId, readImageFileAsDataUrl } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { AiImageModal } from '../components/AiImageModal';
import { ReportModal, type ReportTargetPayload } from '../components/ReportModal';
import type { AppPage } from '../components/Navbar';

interface TimelinePageProps {
  onNavigate: (page: AppPage, param?: string) => void;
}

export function TimelinePage({ onNavigate }: TimelinePageProps) {
  const { citizen } = useAuth();
  const [posts, setPosts] = useState<TimelinePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterQuery, setFilterQuery] = useState('');

  // Composer state
  const [contentText, setContentText] = useState('');
  const [locationTag, setLocationTag] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageMimeType, setImageMimeType] = useState('');
  const [cdnInputMode, setCdnInputMode] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTargetPayload | null>(null);

  async function loadPosts() {
    try {
      const res = await apiFetch<{ posts: TimelinePost[] }>('/api/posts');
      setPosts(res.posts);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPosts();
  }, [citizen?.user.id]);

  useEffect(() => {
    if (citizen?.ktp?.locationName && !locationTag) {
      setLocationTag(citizen.ktp.locationName);
    }
  }, [citizen?.ktp?.locationName]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const { dataUrl, mimeType } = await readImageFileAsDataUrl(file);
      setImageUrl(dataUrl);
      setImageMimeType(mimeType);
      setCdnInputMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File ditolak.');
    }
  }

  async function handlePublish(e: React.FormEvent) {
    e.preventDefault();
    if (!citizen) {
      onNavigate('auth');
      return;
    }
    setPosting(true);
    setError(null);
    try {
      const res = await apiFetch<{ post: TimelinePost }>('/api/posts', {
        method: 'POST',
        body: JSON.stringify({
          contentText,
          imageUrl: imageUrl.trim() || undefined,
          imageMimeType: imageMimeType || undefined,
          locationTag: locationTag.trim() || citizen.ktp?.locationName || 'NGAWI',
        }),
      });
      setPosts((prev) => [res.post, ...prev]);
      setContentText('');
      setImageUrl('');
      setImageMimeType('');
      setCdnInputMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menerbitkan kiriman.');
    } finally {
      setPosting(false);
    }
  }

  async function handleToggleLike(postId: string) {
    if (!citizen) {
      onNavigate('auth');
      return;
    }
    try {
      const res = await apiFetch<{ likesCount: number; liked: boolean }>(
        `/api/posts/${postId}/like`,
        { method: 'POST' }
      );
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, likesCount: res.likesCount, likedByMe: res.liked } : p
        )
      );
    } catch {
      // ignore
    }
  }

  async function handleDelete(postId: string) {
    try {
      await apiFetch(`/api/posts/${postId}`, { method: 'DELETE' });
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus postingan.');
    }
  }

  async function handleBlockAuthor(authorId: string) {
    if (!citizen) {
      onNavigate('auth');
      return;
    }
    setError(null);
    try {
      await apiFetch('/api/blocks', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: authorId }),
      });
      setPosts((prev) => prev.filter((p) => p.authorId !== authorId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memblokir akun.');
    }
  }

  const filteredPosts = posts.filter((p) => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    return (
      p.contentText.toLowerCase().includes(q) ||
      p.authorUsername.toLowerCase().includes(q) ||
      p.locationTag.toLowerCase().includes(q)
    );
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[#1C2421]">
            Timeline Warga Republik
          </h1>
          <p className="mt-1 text-sm text-[#5B6561]">
            Khusus kiriman teks dan gambar (mendukung semua format gambar CDN: JPEG, PNG, WebP, GIF, AVIF, SVG, BMP, TIFF).
          </p>
        </div>

        <input
          type="search"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder="Cari kiriman, @warga, lokasi..."
          className="w-full rounded-lg border border-[#E4E2DC] bg-white px-3.5 py-2 text-xs text-[#1C2421] focus:border-[#0F5E46] focus:outline-none sm:w-64"
        />
      </div>

      {/* Post Composer */}
      {citizen ? (
        <form
          onSubmit={handlePublish}
          className="space-y-4 rounded-2xl border border-[#E4E2DC] bg-white p-5"
        >
          <div className="flex items-start gap-3">
            <img
              src={citizen.user.avatarUrl}
              alt={citizen.user.username}
              referrerPolicy="no-referrer"
              className="h-10 w-10 rounded-full border border-[#E4E2DC] object-cover shrink-0"
            />
            <div className="flex-1 space-y-3">
              <textarea
                rows={3}
                value={contentText}
                onChange={(e) => setContentText(e.target.value)}
                placeholder={`Apa kabar dari ${citizen.ktp?.locationName || 'NGAWI'} hari ini, @${citizen.user.username}?`}
                className="w-full rounded-xl border border-[#E4E2DC] bg-[#F8F7F4] px-3.5 py-2.5 text-sm text-[#1C2421] focus:border-[#0F5E46] focus:outline-none"
                required
              />

              {imageUrl && (
                <div className="relative overflow-hidden rounded-xl border border-[#E4E2DC] bg-[#F8F7F4]">
                  <img
                    src={imageUrl}
                    alt="Pratinjau lampiran"
                    referrerPolicy="no-referrer"
                    className="max-h-72 w-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setImageUrl('');
                      setImageMimeType('');
                    }}
                    className="absolute right-2 top-2 rounded-lg bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-black"
                  >
                    Hapus Gambar
                  </button>
                </div>
              )}

              {cdnInputMode && (
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => {
                      setImageUrl(e.target.value);
                      setImageMimeType('image/webp');
                    }}
                    placeholder="Tempel URL gambar CDN (https://.../foto.webp / .png / .avif)"
                    className="flex-1 rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-1.5 text-xs focus:border-[#0F5E46] focus:outline-none"
                  />
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {error}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E4E2DC] pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-2.5 py-1.5 text-xs font-medium text-[#1C2421] hover:border-[#0F5E46]">
                    <Upload className="h-3.5 w-3.5 text-[#0F5E46]" />
                    <span>Unggah Gambar</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/svg+xml,image/bmp,image/tiff,image/x-icon"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setCdnInputMode((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-2.5 py-1.5 text-xs font-medium text-[#1C2421] hover:border-[#0F5E46]"
                  >
                    <Link2 className="h-3.5 w-3.5 text-[#0F5E46]" />
                    <span>URL CDN</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAiModalOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E2DC] bg-white px-2.5 py-1.5 text-xs font-medium text-[#0F5E46] hover:border-[#0F5E46]"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    <span>Gambar AI</span>
                  </button>

                  <div className="flex items-center gap-1 rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-2.5 py-1">
                    <MapPin className="h-3.5 w-3.5 text-[#5B6561]" />
                    <input
                      type="text"
                      value={locationTag}
                      onChange={(e) => setLocationTag(e.target.value)}
                      placeholder="Lokasi (NGAWI)"
                      className="w-28 bg-transparent text-xs text-[#1C2421] focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={posting || !contentText.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F5E46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B4A37] disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  {posting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  <span>Terbitkan</span>
                </button>
              </div>
            </div>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#E4E2DC] bg-white p-5">
          <p className="text-sm text-[#5B6561]">
            Anda membaca sebagai <strong className="text-[#1C2421]">Public Visitor</strong>. Masuk untuk ikut mengirim postingan bergambar atau memberi suka.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('auth')}
            className="rounded-lg bg-[#0F5E46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B4A37] whitespace-nowrap"
          >
            Masuk / Daftar
          </button>
        </div>
      )}

      {/* Feed List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl border border-[#E4E2DC] bg-white" />
          ))}
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="rounded-2xl border border-[#E4E2DC] bg-white p-10 text-center">
          <ImageIcon className="mx-auto h-8 w-8 text-[#5B6561]" />
          <p className="mt-2 text-sm font-medium text-[#1C2421]">
            Belum ada kiriman yang cocok.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPosts.map((post) => {
            const canDelete =
              citizen &&
              (citizen.user.id === post.authorId ||
                citizen.user.role === 'admin' ||
                citizen.user.role === 'superadmin');

            return (
              <article
                key={post.id}
                className="rounded-2xl border border-[#E4E2DC] bg-white p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onNavigate('bio', post.authorUsername)}
                    className="flex items-center gap-3 text-left group"
                  >
                    <img
                      src={post.authorAvatar}
                      alt={post.authorUsername}
                      referrerPolicy="no-referrer"
                      className="h-10 w-10 rounded-full border border-[#E4E2DC] object-cover"
                    />
                    <div>
                      <p className="text-sm font-semibold text-[#1C2421] group-hover:text-[#0F5E46]">
                        @{post.authorUsername}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#5B6561]">
                        <span className="font-mono">{post.authorRole}</span>
                        <span aria-hidden="true">·</span>
                        <span>{post.locationTag}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          {formatDateId(post.createdAt)} {formatTimeId(post.createdAt)}
                        </span>
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-1">
                    {citizen && citizen.user.id !== post.authorId && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setReportTarget({
                              targetType: 'post',
                              targetId: post.id,
                              targetLabel: `Kiriman @${post.authorUsername}`,
                              snippet: post.contentText,
                            })
                          }
                          className="rounded-lg p-1.5 text-[#5B6561] hover:bg-red-50 hover:text-red-700"
                          title="Laporkan postingan"
                        >
                          <Flag className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBlockAuthor(post.authorId)}
                          className="rounded-lg p-1.5 text-[#5B6561] hover:bg-red-50 hover:text-red-700"
                          title={`Blokir @${post.authorUsername}`}
                        >
                          <Ban className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(post.id)}
                        className="rounded-lg p-1.5 text-[#5B6561] hover:bg-red-50 hover:text-red-700"
                        title="Hapus kiriman"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <p className="whitespace-pre-line text-sm leading-relaxed text-[#1C2421]">
                  {post.contentText}
                </p>

                {post.imageUrl && (
                  <div className="overflow-hidden rounded-xl border border-[#E4E2DC] bg-[#F8F7F4]">
                    <img
                      src={post.imageUrl}
                      alt={`Kiriman oleh ${post.authorUsername}`}
                      referrerPolicy="no-referrer"
                      className="max-h-[460px] w-full object-contain"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-[#E4E2DC] pt-2.5 text-xs text-[#5B6561]">
                  <button
                    type="button"
                    onClick={() => handleToggleLike(post.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition-colors ${
                      post.likedByMe
                        ? 'bg-[#0F5E46]/10 text-[#0F5E46]'
                        : 'hover:bg-[#F8F7F4] text-[#5B6561]'
                    }`}
                  >
                    <Heart className={`h-3.5 w-3.5 ${post.likedByMe ? 'fill-[#0F5E46]' : ''}`} />
                    <span className="tabular-nums">{post.likesCount} Suka</span>
                  </button>
                  {post.imageMimeType && (
                    <span className="font-mono text-[11px]">{post.imageMimeType}</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <AiImageModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onSelectImage={(url) => {
          setImageUrl(url);
          setImageMimeType('image/png');
          setCdnInputMode(false);
        }}
      />

      <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
    </div>
  );
}
