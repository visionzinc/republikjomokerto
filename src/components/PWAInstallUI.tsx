import React, { useState } from 'react';
import { Download, MoreVertical, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'navbar' | 'menu';
}

export function PWAInstallButton({ variant = 'navbar' }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  async function handleClick() {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) return;
      return;
    }
    setShowGuide(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          variant === 'menu'
            ? 'inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#0F5E46] bg-[#0F5E46]/10 px-3 py-2 text-xs font-semibold text-[#0F5E46] hover:bg-[#0F5E46]/15 transition-colors'
            : 'inline-flex items-center gap-1.5 rounded-lg border border-[#0F5E46]/40 bg-[#0F5E46]/10 px-2.5 py-1.5 text-xs font-semibold text-[#0F5E46] hover:bg-[#0F5E46] hover:text-white transition-colors whitespace-nowrap shrink-0'
        }
        title={
          isInstallable
            ? 'Instal Republik Jomokerto sebagai Aplikasi'
            : 'Cara Instal Aplikasi di HP / Desktop'
        }
      >
        <Download className="h-3.5 w-3.5 shrink-0" />
        <span>{variant === 'menu' ? 'Instal Aplikasi (PWA)' : 'Instal App'}</span>
      </button>

      {showGuide && (
        <PWAInstallGuideModal
          isIOS={isIOS}
          isAndroid={isAndroid}
          onClose={() => setShowGuide(false)}
        />
      )}
    </>
  );
}

export function PWAMobileBanner() {
  const { isInstallable, isInstalled, isIOS, isAndroid, bannerDismissed, dismissBanner, install } =
    usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled || bannerDismissed) {
    return null;
  }

  async function handleInstallAction() {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuide(true);
  }

  return (
    <>
      <div className="fixed inset-x-3 bottom-3 z-40 md:hidden">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#E4E2DC] bg-white p-3.5 shadow-xl">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/pwa-192x192.png"
              alt="Ikon Republik Jomokerto"
              className="h-10 w-10 rounded-xl border border-[#E4E2DC] shrink-0"
            />
            <div className="min-w-0">
              <p className="truncate font-display text-xs font-bold text-[#1C2421]">
                Pasang Aplikasi Jomokerto
              </p>
              <p className="truncate text-[11px] text-[#5B6561]">
                {isInstallable
                  ? 'Akses cepat layar beranda tanpa bilah browser.'
                  : isIOS
                    ? 'Panduan instalasi cepat untuk Safari iPhone/iPad.'
                    : 'Buka sebagai aplikasi Android (PWA) dari Chrome.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleInstallAction}
              className="inline-flex items-center gap-1 rounded-lg bg-[#0F5E46] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0B4A37]"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{isInstallable ? 'Instal' : 'Panduan'}</span>
            </button>
            <button
              type="button"
              onClick={dismissBanner}
              className="rounded-lg p-1.5 text-[#5B6561] hover:bg-[#F8F7F4]"
              aria-label="Tutup banner instalasi"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {showGuide && (
        <PWAInstallGuideModal
          isIOS={isIOS}
          isAndroid={isAndroid}
          onClose={() => setShowGuide(false)}
        />
      )}
    </>
  );
}

function PWAInstallGuideModal({
  isIOS,
  isAndroid,
  onClose,
}: {
  isIOS: boolean;
  isAndroid: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-[#E4E2DC] bg-white p-5 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-3 border-b border-[#E4E2DC] pb-3">
          <div className="flex items-center gap-2.5">
            <Smartphone className="h-5 w-5 text-[#0F5E46]" />
            <div>
              <h2 className="font-display text-base font-bold text-[#1C2421]">
                Instal Aplikasi Republik Jomokerto
              </h2>
              <p className="text-xs text-[#5B6561]">
                Simpan ke layar beranda untuk pengalaman aplikasi penuh.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[#5B6561] hover:bg-[#F8F7F4]"
            aria-label="Tutup panduan instalasi"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs text-[#1C2421]">
          {(!isIOS || isAndroid) && (
            <div className="rounded-xl border border-[#E4E2DC] bg-[#F8F7F4] p-3.5 space-y-2">
              <p className="font-semibold text-[#0F5E46]">
                Android (Google Chrome / Microsoft Edge)
              </p>
              <ol className="list-decimal pl-4 space-y-1.5 text-[#5B6561]">
                <li>
                  Ketuk ikon menu tiga titik{' '}
                  <MoreVertical className="inline h-3.5 w-3.5 text-[#1C2421]" /> di pojok kanan atas
                  Chrome.
                </li>
                <li>
                  Pilih <strong className="text-[#1C2421]">Instal aplikasi</strong> atau{' '}
                  <strong className="text-[#1C2421]">Tambahkan ke layar beranda</strong>.
                </li>
                <li>
                  Konfirmasi dengan mengetuk <strong className="text-[#1C2421]">Instal</strong>.
                </li>
              </ol>
            </div>
          )}

          {isIOS && (
            <div className="rounded-xl border border-[#E4E2DC] bg-[#F8F7F4] p-3.5 space-y-2">
              <p className="font-semibold text-[#0F5E46]">iPhone / iPad (Safari)</p>
              <ol className="list-decimal pl-4 space-y-1.5 text-[#5B6561]">
                <li>
                  Ketuk tombol <strong className="text-[#1C2421]">Share</strong>{' '}
                  <Share className="inline h-3.5 w-3.5 text-[#1C2421]" /> di bilah bawah Safari.
                </li>
                <li>
                  Gulir ke bawah lalu pilih{' '}
                  <strong className="text-[#1C2421]">Add to Home Screen</strong> (Tambahkan ke
                  Layar Utama).
                </li>
                <li>
                  Ketuk <strong className="text-[#1C2421]">Add</strong> di pojok kanan atas.
                </li>
              </ol>
            </div>
          )}

          {!isIOS && !isAndroid && (
            <div className="rounded-xl border border-[#E4E2DC] bg-[#F8F7F4] p-3.5 space-y-1.5 text-[#5B6561]">
              <p className="font-semibold text-[#0F5E46]">Browser Desktop (Chrome / Edge)</p>
              <p>
                Klik ikon instalasi (monitor dengan panah bawah) di sisi kanan bilah alamat URL,
                atau buka menu titik tiga browser →{' '}
                <strong className="text-[#1C2421]">Save and share → Install Republik Jomokerto</strong>.
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg bg-[#0F5E46] py-2 text-xs font-semibold text-white hover:bg-[#0B4A37]"
        >
          Mengerti
        </button>
      </div>
    </div>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900 shadow-lg"
    >
      <span className="h-2 w-2 rounded-full bg-amber-600 animate-pulse" />
      <WifiOff className="h-3.5 w-3.5" />
      <span>Mode Offline — Memakai cache aset lokal</span>
    </div>
  );
}
