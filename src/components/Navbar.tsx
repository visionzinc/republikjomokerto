import React, { useState } from 'react';
import { LogOut, Menu, Shield, User, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ThemeSwitcher } from './ThemeSwitcher';

export type AppPage =
  | 'home'
  | 'timeline'
  | 'map'
  | 'chat'
  | 'ktp'
  | 'auth'
  | 'bio'
  | 'admin'
  | 'docs';

interface NavbarProps {
  activePage: AppPage;
  onNavigate: (page: AppPage, param?: string) => void;
}

const NAV_LINKS: Array<{ id: AppPage; label: string }> = [
  { id: 'home', label: 'Beranda' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'map', label: 'Peta' },
  { id: 'chat', label: 'Chat' },
  { id: 'ktp', label: 'KTP Studio' },
];

export function Navbar({ activePage, onNavigate }: NavbarProps) {
  const { citizen, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const isAdmin =
    citizen?.user.role === 'admin' || citizen?.user.role === 'superadmin';

  return (
    <header className="sticky top-0 z-40 border-b border-[#E4E2DC] bg-[#F8F7F4]/95 backdrop-blur-sm">
      {/* Strict 3-Zone Top Bar Contract separated by gap-8 */}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
        {/* Zone 1: Single-line brand wordmark */}
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="font-display text-lg font-bold tracking-tight text-[#1C2421] hover:text-[#0F5E46] transition-colors whitespace-nowrap shrink-0"
        >
          Republik Jomokerto
        </button>

        {/* Zone 2: 5 concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {NAV_LINKS.map((link) => {
            const isActive = activePage === link.id;
            return (
              <button
                key={link.id}
                type="button"
                onClick={() => onNavigate(link.id)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'text-[#0F5E46] font-semibold underline decoration-2 underline-offset-8'
                    : 'text-[#5B6561] hover:text-[#1C2421]'
                }`}
              >
                {link.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Theme Switcher + Primary Action */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="hidden sm:flex">
            <ThemeSwitcher />
          </div>
          {!citizen ? (
            <button
              type="button"
              onClick={() => onNavigate('auth')}
              className="rounded-lg bg-[#0F5E46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B4A37] transition-colors whitespace-nowrap shrink-0"
            >
              Masuk / Daftar
            </button>
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountMenuOpen((o) => !o)}
                className="inline-flex items-center gap-2 rounded-lg border border-[#E4E2DC] bg-white px-3 py-1.5 text-xs font-semibold text-[#1C2421] hover:border-[#0F5E46] transition-colors whitespace-nowrap shrink-0"
              >
                <img
                  src={citizen.user.avatarUrl}
                  alt={citizen.user.username}
                  referrerPolicy="no-referrer"
                  className="h-5 w-5 rounded-full object-cover"
                />
                <span className="max-w-[110px] truncate">@{citizen.user.username}</span>
              </button>

              {accountMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-[#E4E2DC] bg-white p-1.5 shadow-lg">
                  <div className="border-b border-[#E4E2DC] px-3 py-2 text-xs">
                    <p className="font-semibold text-[#1C2421]">@{citizen.user.username}</p>
                    <p className="font-mono text-[11px] text-[#5B6561]">
                      Peran: {citizen.user.role}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      onNavigate('bio', citizen.user.username);
                    }}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[#1C2421] hover:bg-[#F8F7F4]"
                  >
                    <User className="h-3.5 w-3.5 text-[#0F5E46]" />
                    <span>Profil &amp; Link-in-Bio</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      onNavigate('ktp');
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[#1C2421] hover:bg-[#F8F7F4]"
                  >
                    <User className="h-3.5 w-3.5 text-[#B8860B]" />
                    <span>KTP Studio</span>
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        onNavigate('admin');
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[#1C2421] hover:bg-[#F8F7F4]"
                    >
                      <Shield className="h-3.5 w-3.5 text-[#0F5E46]" />
                      <span>Konsol Admin</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      setAccountMenuOpen(false);
                      await logout();
                      onNavigate('home');
                    }}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-[#E4E2DC] px-3 py-2 text-left text-xs text-red-700 hover:bg-red-50"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Keluar</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-lg border border-[#E4E2DC] bg-white p-2 text-[#1C2421] md:hidden"
            aria-label="Menu navigasi"
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {menuOpen && (
        <div className="border-t border-[#E4E2DC] bg-white px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onNavigate(link.id);
                }}
                className={`rounded-lg px-3 py-2 text-left text-sm font-medium ${
                  activePage === link.id
                    ? 'bg-[#0F5E46]/10 text-[#0F5E46]'
                    : 'text-[#5B6561]'
                }`}
              >
                {link.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onNavigate('docs');
              }}
              className="rounded-lg px-3 py-2 text-left text-sm font-medium text-[#5B6561]"
            >
              Dokumentasi &amp; Self-Host
            </button>
            <div className="mt-2 flex items-center justify-between border-t border-[#E4E2DC] px-3 pt-3">
              <span className="text-xs font-medium text-[#5B6561]">Tema Tampilan</span>
              <ThemeSwitcher showLabels />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
