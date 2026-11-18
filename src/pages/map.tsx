import React, { useEffect, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
} from '@vis.gl/react-google-maps';
import { Compass, ExternalLink, Loader2, MapPin, Plus, Search, Trash2 } from 'lucide-react';
import {
  FICTIONAL_REALMS,
  REALM_ATLAS_URL,
  type MapPinItem,
} from '../shared/types';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { AppPage } from '../components/Navbar';

interface MapPageProps {
  onNavigate: (page: AppPage) => void;
}

interface GroundedPlaceLink {
  title: string;
  uri: string;
  reviewSnippets?: string[];
}

function RealWorldMarkerItem({
  pin,
  canDelete,
  onDelete,
}: {
  pin: MapPinItem;
  canDelete: boolean;
  onDelete: (id: string) => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(false);

  if (typeof pin.lat !== 'number' || typeof pin.lng !== 'number') return null;

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: pin.lat, lng: pin.lng }}
        onClick={() => setOpen(true)}
        title={pin.title}
      >
        <Pin background="#0F5E46" borderColor="#B8860B" glyphColor="#FFFFFF" />
      </AdvancedMarker>

      {open && marker && (
        <InfoWindow anchor={marker} maxWidth={260} onCloseClick={() => setOpen(false)}>
          <div className="space-y-1.5 text-xs text-[#1C2421]">
            <p className="font-bold text-sm">{pin.title}</p>
            <p className="font-mono text-[11px] text-[#0F5E46]">
              {pin.gameTag} · @{pin.authorUsername}
            </p>
            <p className="text-[#5B6561]">{pin.description}</p>
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(pin.id)}
                className="inline-flex items-center gap-1 pt-1 text-[11px] font-semibold text-red-700 hover:underline"
              >
                <Trash2 className="h-3 w-3" />
                <span>Hapus Pin</span>
              </button>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
}

export function MapPage({ onNavigate }: MapPageProps) {
  const { citizen, publicConfig } = useAuth();
  const [layer, setLayer] = useState<'real' | 'fictional'>('real');
  const [pins, setPins] = useState<MapPinItem[]>([]);
  const [selectedPin, setSelectedPin] = useState<MapPinItem | null>(null);

  // Maps Grounding Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchingMaps, setSearchingMaps] = useState(false);
  const [groundingAnswer, setGroundingAnswer] = useState<string | null>(null);
  const [groundedPlaces, setGroundedPlaces] = useState<GroundedPlaceLink[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // New Pin Composer
  const [pinTitle, setPinTitle] = useState('');
  const [pinDesc, setPinDesc] = useState('');
  const [pinGameTag, setPinGameTag] = useState('Kopdar Ngawi');
  const [draftLat, setDraftLat] = useState(-7.4038);
  const [draftLng, setDraftLng] = useState(111.4461);
  const [draftRealmId, setDraftRealmId] = useState('sumeru');
  const [draftRealmX, setDraftRealmX] = useState(52);
  const [draftRealmY, setDraftRealmY] = useState(28);
  const [savingPin, setSavingPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ pins: MapPinItem[] }>('/api/map/pins')
      .then((res) => setPins(res.pins))
      .catch(() => {});
  }, []);

  async function handleMapsGroundingSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchingMaps(true);
    setSearchError(null);

    let coords: { lat: number; lng: number } | undefined;
    if (navigator.geolocation) {
      coords = await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve(undefined),
          { timeout: 2500 }
        );
      });
    }

    try {
      const res = await apiFetch<{ answer: string; places: GroundedPlaceLink[] }>(
        '/api/ai/maps-search',
        {
          method: 'POST',
          timeoutMs: 22000,
          body: JSON.stringify({
            query: searchQuery.trim(),
            lat: coords?.lat ?? -7.4038,
            lng: coords?.lng ?? 111.4461,
          }),
        }
      );
      setGroundingAnswer(res.answer);
      setGroundedPlaces(res.places);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Gagal mencari di Google Maps.');
    } finally {
      setSearchingMaps(false);
    }
  }

  async function handleCreatePin(e: React.FormEvent) {
    e.preventDefault();
    if (!citizen) {
      onNavigate('auth');
      return;
    }
    setSavingPin(true);
    setPinError(null);
    try {
      const res = await apiFetch<{ pin: MapPinItem }>('/api/map/pins', {
        method: 'POST',
        body: JSON.stringify({
          title: pinTitle,
          description: pinDesc || 'Titik komunitas Republik Jomokerto.',
          gameTag: pinGameTag,
          mode: layer,
          lat: layer === 'real' ? draftLat : undefined,
          lng: layer === 'real' ? draftLng : undefined,
          realmId: layer === 'fictional' ? draftRealmId : undefined,
          realmX: layer === 'fictional' ? draftRealmX : undefined,
          realmY: layer === 'fictional' ? draftRealmY : undefined,
        }),
      });
      setPins((prev) => [res.pin, ...prev]);
      setPinTitle('');
      setPinDesc('');
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Gagal menyimpan pin lokasi.');
    } finally {
      setSavingPin(false);
    }
  }

  async function handleDeletePin(pinId: string) {
    try {
      await apiFetch(`/api/map/pins/${pinId}`, { method: 'DELETE' });
      setPins((prev) => prev.filter((p) => p.id !== pinId));
      if (selectedPin?.id === pinId) setSelectedPin(null);
    } catch {
      // ignore
    }
  }

  function handleAtlasClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    setDraftRealmX(Math.max(4, Math.min(96, x)));
    setDraftRealmY(Math.max(4, Math.min(96, y)));
  }

  const realPins = pins.filter((p) => p.mode === 'real');
  const fictionalPins = pins.filter((p) => p.mode === 'fictional');
  const mapsApiKey = publicConfig.googleMapsApiKey;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-6">
      {/* Header + Layer Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[#1C2421]">
            Peta Komunitas Hybrid
          </h1>
          <p className="mt-1 text-sm text-[#5B6561]">
            Jelajahi titik kumpul dunia nyata sekitar Ngawi maupun markas komunitas di dunia game fiktif seperti Sumeru.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-[#E4E2DC] bg-white p-1">
          <button
            type="button"
            onClick={() => {
              setLayer('real');
              setSelectedPin(null);
            }}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              layer === 'real' ? 'bg-[#0F5E46] text-white' : 'text-[#5B6561] hover:text-[#1C2421]'
            }`}
          >
            Peta Dunia Nyata (Google Maps)
          </button>
          <button
            type="button"
            onClick={() => {
              setLayer('fictional');
              setSelectedPin(null);
            }}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              layer === 'fictional'
                ? 'bg-[#0F5E46] text-white'
                : 'text-[#5B6561] hover:text-[#1C2421]'
            }`}
          >
            Atlas Dunia Game (Fiktif)
          </button>
        </div>
      </div>

      {/* Main Map + Control Sidebar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Map Canvas Column */}
        <div className="space-y-4 lg:col-span-8">
          {layer === 'real' ? (
            <div className="overflow-hidden rounded-2xl border border-[#E4E2DC] bg-white">
              {mapsApiKey ? (
                <div className="h-[460px] w-full">
                  <APIProvider apiKey={mapsApiKey} libraries={['marker', 'places']} language="id" region="ID">
                    <GoogleMap
                      mapId="DEMO_MAP_ID"
                      defaultCenter={{ lat: -7.4038, lng: 111.4461 }}
                      defaultZoom={12}
                      gestureHandling="greedy"
                      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                      onClick={(ev) => {
                        if (ev.detail.latLng) {
                          setDraftLat(Number(ev.detail.latLng.lat.toFixed(5)));
                          setDraftLng(Number(ev.detail.latLng.lng.toFixed(5)));
                        }
                      }}
                      style={{ width: '100%', height: '100%' }}
                    >
                      {realPins.map((pin) => {
                        const canDelete = Boolean(
                          citizen &&
                            (citizen.user.id === pin.authorId ||
                              citizen.user.role === 'admin' ||
                              citizen.user.role === 'superadmin')
                        );
                        return (
                          <RealWorldMarkerItem
                            key={pin.id}
                            pin={pin}
                            canDelete={canDelete}
                            onDelete={handleDeletePin}
                          />
                        );
                      })}
                    </GoogleMap>
                  </APIProvider>
                </div>
              ) : (
                <div className="flex h-[460px] flex-col items-center justify-center p-6 text-center bg-[#F8F7F4]">
                  <Compass className="h-8 w-8 text-[#0F5E46]" />
                  <p className="mt-2 text-sm font-semibold text-[#1C2421]">
                    Kunci Google Maps belum aktif di environment ini
                  </p>
                  <p className="mt-1 max-w-md text-xs text-[#5B6561]">
                    Anda tetap dapat menggunakan pencarian lokasi Maps Grounding di bawah, menambah pin koordinat Ngawi, atau beralih ke Atlas Dunia Game.
                  </p>
                </div>
              )}

              {/* Maps Grounding Search Bar */}
              <div className="border-t border-[#E4E2DC] p-4 space-y-3 bg-white">
                <form onSubmit={handleMapsGroundingSearch} className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari tempat nyata dengan Google Maps Grounding (contoh: warung kopi hits di Ngawi)..."
                    className="flex-1 rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3.5 py-2 text-xs focus:border-[#0F5E46] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={searchingMaps || !searchQuery.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F5E46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B4A37] disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    {searchingMaps ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Search className="h-3.5 w-3.5" />
                    )}
                    <span>Cari Maps AI</span>
                  </button>
                </form>

                {searchError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 space-y-1.5">
                    <p>{searchError}</p>
                    {searchQuery.trim() && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          searchQuery.trim()
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-[#0F5E46] hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>Buka &ldquo;{searchQuery.trim()}&rdquo; langsung di Google Maps</span>
                      </a>
                    )}
                  </div>
                )}

                {groundingAnswer && (
                  <div className="rounded-xl border border-[#E4E2DC] bg-[#F8F7F4] p-3.5 space-y-2.5 text-xs">
                    <p className="whitespace-pre-line text-[#1C2421] leading-relaxed">
                      {groundingAnswer}
                    </p>
                    {groundedPlaces.length > 0 && (
                      <div className="space-y-1.5 border-t border-[#E4E2DC] pt-2">
                        <p className="font-mono text-[11px] font-semibold text-[#5B6561]">
                          Sumber Lokasi Google Maps:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {groundedPlaces.map((pl, idx) => (
                            <a
                              key={`${pl.uri}-${idx}`}
                              href={pl.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border border-[#E4E2DC] bg-white px-2.5 py-1 font-medium text-[#0F5E46] hover:border-[#0F5E46]"
                            >
                              <MapPin className="h-3 w-3" />
                              <span>{pl.title}</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Fictional Game Realm Atlas */
            <div className="overflow-hidden rounded-2xl border border-[#E4E2DC] bg-white">
              <div
                onClick={handleAtlasClick}
                className="relative h-[460px] w-full cursor-crosshair overflow-hidden bg-[#F4F1EA]"
              >
                <img
                  src={REALM_ATLAS_URL}
                  alt="Atlas Dunia Fiktif Republik Jomokerto"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />

                {/* Predefined Realm Landmarks */}
                {FICTIONAL_REALMS.map((realm) => (
                  <button
                    key={realm.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDraftRealmId(realm.id);
                      setDraftRealmX(realm.anchorX);
                      setDraftRealmY(realm.anchorY);
                    }}
                    style={{ left: `${realm.anchorX}%`, top: `${realm.anchorY}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[#B8860B] bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-[#1C2421] shadow-sm hover:border-[#0F5E46]"
                  >
                    {realm.name}
                  </button>
                ))}

                {/* Community Fictional Pins */}
                {fictionalPins.map((pin) => (
                  <button
                    key={pin.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPin(pin);
                    }}
                    style={{
                      left: `${pin.realmX ?? 50}%`,
                      top: `${pin.realmY ?? 50}%`,
                    }}
                    className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center group"
                    title={pin.title}
                  >
                    <span className="rounded-md bg-[#0F5E46] px-2 py-0.5 text-[10px] font-semibold text-white shadow">
                      {pin.title}
                    </span>
                    <MapPin className="h-5 w-5 fill-[#B8860B] text-[#1C2421]" />
                  </button>
                ))}

                {/* Draft placement preview */}
                <div
                  style={{ left: `${draftRealmX}%`, top: `${draftRealmY}%` }}
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-white bg-red-600 shadow"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E4E2DC] px-4 py-2.5 text-xs text-[#5B6561]">
                <span>
                  Klik di mana saja pada peta atlas untuk menentukan koordinat pin fiktif ({draftRealmX}%, {draftRealmY}%).
                </span>
                {selectedPin && (
                  <span className="font-semibold text-[#0F5E46]">
                    Terpilih: {selectedPin.title} ({selectedPin.gameTag})
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar: Add Pin + Active Pin Directory */}
        <div className="space-y-5 lg:col-span-4">
          <form
            onSubmit={handleCreatePin}
            className="space-y-3.5 rounded-2xl border border-[#E4E2DC] bg-white p-5"
          >
            <h2 className="font-display text-base font-bold text-[#1C2421]">
              Pasang Pin Komunitas ({layer === 'real' ? 'Dunia Nyata' : 'Dunia Game'})
            </h2>
            <p className="text-xs text-[#5B6561]">
              {layer === 'real'
                ? 'Klik titik di Google Maps untuk mengisi koordinat otomatis.'
                : 'Klik titik di Atlas Dunia Game untuk memilih posisi realm.'}
            </p>

            <input
              type="text"
              value={pinTitle}
              onChange={(e) => setPinTitle(e.target.value)}
              placeholder={
                layer === 'real'
                  ? 'Nama tempat (contoh: Angkringan Ngawi)'
                  : 'Nama markas (contoh: Kedai Kopi Sumeru)'
              }
              className="w-full rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 text-xs focus:border-[#0F5E46] focus:outline-none"
              required
            />

            <input
              type="text"
              value={pinGameTag}
              onChange={(e) => setPinGameTag(e.target.value)}
              placeholder="Kategori / Game (contoh: Genshin Impact, Kopdar)"
              className="w-full rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 text-xs focus:border-[#0F5E46] focus:outline-none"
            />

            <textarea
              rows={2}
              value={pinDesc}
              onChange={(e) => setPinDesc(e.target.value)}
              placeholder="Catatan singkat aktivitas komunitas di sini..."
              className="w-full rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 text-xs focus:border-[#0F5E46] focus:outline-none"
            />

            {layer === 'real' ? (
              <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                <input
                  type="number"
                  step="any"
                  value={draftLat}
                  onChange={(e) => setDraftLat(Number(e.target.value))}
                  className="rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-2.5 py-1.5"
                />
                <input
                  type="number"
                  step="any"
                  value={draftLng}
                  onChange={(e) => setDraftLng(Number(e.target.value))}
                  className="rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-2.5 py-1.5"
                />
              </div>
            ) : (
              <select
                value={draftRealmId}
                onChange={(e) => setDraftRealmId(e.target.value)}
                className="w-full rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 text-xs focus:border-[#0F5E46] focus:outline-none"
              >
                {FICTIONAL_REALMS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.originGame})
                  </option>
                ))}
              </select>
            )}

            {pinError && <p className="text-xs text-red-700">{pinError}</p>}

            <button
              type="submit"
              disabled={savingPin}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0F5E46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B4A37] disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{citizen ? 'Simpan Pin ke Peta' : 'Masuk untuk Pasang Pin'}</span>
            </button>
          </form>

          {/* List of Pins in Current Mode */}
          <div className="rounded-2xl border border-[#E4E2DC] bg-white p-5">
            <h3 className="font-display text-sm font-bold text-[#1C2421]">
              Daftar Pin ({layer === 'real' ? realPins.length : fictionalPins.length})
            </h3>
            <div className="mt-3 max-h-64 divide-y divide-[#E4E2DC] overflow-y-auto">
              {(layer === 'real' ? realPins : fictionalPins).map((pin) => {
                const canDelete = Boolean(
                  citizen &&
                    (citizen.user.id === pin.authorId ||
                      citizen.user.role === 'admin' ||
                      citizen.user.role === 'superadmin')
                );
                return (
                  <div key={pin.id} className="py-2.5 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[#1C2421]">{pin.title}</p>
                        <p className="font-mono text-[11px] text-[#0F5E46]">
                          {pin.gameTag} · @{pin.authorUsername}
                        </p>
                      </div>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDeletePin(pin.id)}
                          className="text-[#5B6561] hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-[#5B6561]">{pin.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
