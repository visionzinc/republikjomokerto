import React, { useCallback, useEffect, useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Navbar, type AppPage } from './components/Navbar';
import { AppealBanner } from './components/AppealBanner';
import { HomePage } from './pages/home';
import { AuthPage } from './pages/auth';
import { TimelinePage } from './pages/timeline';
import { ChatPage } from './pages/chat';
import { MapPage } from './pages/map';
import { KtpStudioPage } from './pages/ktpStudio';
import { ProfileBioPage } from './pages/profileBio';
import { AdminPage } from './pages/admin';
import { DocsPage } from './pages/docs';

function AppShell() {
  const [activePage, setActivePage] = useState<AppPage>('home');
  const [routeParam, setRouteParam] = useState<string>('');
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  // Sync initial URL query params (?u=username or ?page=timeline)
  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const userBio = params.get('u');
      const page = params.get('page') as AppPage | null;
      if (userBio) {
        setActivePage('bio');
        setRouteParam(userBio);
      } else if (
        page &&
        ['home', 'timeline', 'map', 'chat', 'ktp', 'auth', 'admin', 'docs'].includes(page)
      ) {
        setActivePage(page);
        setRouteParam(params.get('id') || '');
      }
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  // Listen for Google Maps Platform quota exhaustion
  useEffect(() => {
    const onQuota = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  const handleNavigate = useCallback((page: AppPage, param = '') => {
    setActivePage(page);
    setRouteParam(param);
    const url = new URL(window.location.href);
    url.search = '';
    if (page === 'bio' && param) {
      url.searchParams.set('u', param);
    } else if (page !== 'home') {
      url.searchParams.set('page', page);
      if (param) url.searchParams.set('id', param);
    }
    window.history.pushState({}, '', url.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F7F4] text-[#1C2421] dark:bg-[#0E1412] dark:text-[#ECEBE6] transition-colors duration-200">
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      <Navbar activePage={activePage} onNavigate={handleNavigate} />
      <AppealBanner />

      <main className="flex-1">
        {activePage === 'home' && <HomePage onNavigate={handleNavigate} />}
        {activePage === 'auth' && <AuthPage onNavigate={handleNavigate} />}
        {activePage === 'timeline' && <TimelinePage onNavigate={handleNavigate} />}
        {activePage === 'chat' && (
          <ChatPage initialRoomId={routeParam || undefined} onNavigate={handleNavigate} />
        )}
        {activePage === 'map' && <MapPage onNavigate={handleNavigate} />}
        {activePage === 'ktp' && <KtpStudioPage onNavigate={handleNavigate} />}
        {activePage === 'bio' && (
          <ProfileBioPage username={routeParam || 'presiden_jomok'} onNavigate={handleNavigate} />
        )}
        {activePage === 'admin' && <AdminPage />}
        {activePage === 'docs' && <DocsPage />}
      </main>

      <footer className="border-t border-[#E4E2DC] bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 text-xs text-[#5B6561] sm:px-6">
          <p>
            © 2026 Republik Jomokerto · Portal komunitas hiburan &amp; prototipe SaaS / Self-Host.
          </p>
          <div className="flex flex-wrap items-center gap-5">
            <button
              type="button"
              onClick={() => handleNavigate('home')}
              className="hover:text-[#1C2421]"
            >
              Beranda
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('timeline')}
              className="hover:text-[#1C2421]"
            >
              Timeline
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('map')}
              className="hover:text-[#1C2421]"
            >
              Peta Hybrid
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('docs')}
              className="hover:text-[#0F5E46] font-medium"
            >
              Dokumentasi &amp; Vercel Guide
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ThemeProvider>
  );
}
