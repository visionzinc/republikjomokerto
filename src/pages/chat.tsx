import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Ban,
  Bot,
  Crown,
  Flag,
  Hash,
  Loader2,
  LogOut,
  MessageSquarePlus,
  Plus,
  Send,
  Shield,
  ShieldBan,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { BlockedUserEntry, ChatMessage, ChatRoom, CitizenRecord } from '../shared/types';
import { apiFetch, formatTimeId, getStoredToken, streamAiChat } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { AppPage } from '../components/Navbar';
import { ReportModal, type ReportTargetPayload } from '../components/ReportModal';

interface ChatPageProps {
  initialRoomId?: string;
  onNavigate: (page: AppPage, param?: string) => void;
}

interface AiChatBubble {
  id: string;
  role: 'user' | 'model';
  text: string;
}

export function ChatPage({ initialRoomId, onNavigate }: ChatPageProps) {
  const { citizen } = useAuth();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [citizens, setCitizens] = useState<CitizenRecord[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserEntry[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string>(initialRoomId || 'room-alun-alun');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeUsers, setActiveUsers] = useState<string[]>([]);
  const [wsConnected, setWsConnected] = useState(false);

  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDmPicker, setShowDmPicker] = useState(false);

  // Create Group Modal State
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newGroupRealm, setNewGroupRealm] = useState('Grup Warga');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Manage Group Modal State
  const [showManageGroup, setShowManageGroup] = useState(false);
  const [addPeopleSelection, setAddPeopleSelection] = useState<string[]>([]);
  const [addPeopleSearch, setAddPeopleSearch] = useState('');
  const [groupActionBusy, setGroupActionBusy] = useState(false);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false);

  // Block & Report State
  const [showBlocksModal, setShowBlocksModal] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTargetPayload | null>(null);

  // Gemini AI Chat State
  const [aiHistory, setAiHistory] = useState<AiChatBubble[]>([
    {
      id: 'ai-welcome',
      role: 'model',
      text: 'Salam Penjomok! Saya Bupati AI Republik Jomokerto (bertenaga Gemini API). Tanyakan apa saja soal motto KTP, ide postingan, atau info warga Ngawi hingga Sumeru.',
    },
  ]);
  const [aiLoading, setAiLoading] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialRoomId) setActiveRoomId(initialRoomId);
  }, [initialRoomId]);

  const loadSidebarData = useCallback(async () => {
    try {
      const [rRes, cRes] = await Promise.all([
        apiFetch<{ rooms: ChatRoom[] }>('/api/chat/rooms'),
        apiFetch<{ citizens: CitizenRecord[] }>('/api/citizens'),
      ]);
      setRooms(rRes.rooms);
      setCitizens(cRes.citizens);
      if (citizen) {
        const bRes = await apiFetch<{ blocks: BlockedUserEntry[] }>('/api/blocks');
        setBlockedUsers(bRes.blocks);
      } else {
        setBlockedUsers([]);
      }
    } catch {
      // ignore
    }
  }, [citizen]);

  useEffect(() => {
    loadSidebarData();
  }, [loadSidebarData]);

  // Load room messages & maintain WebSocket + Vercel polling fallback
  useEffect(() => {
    if (activeRoomId === 'ai-bupati') return;
    let active = true;

    async function fetchMessages() {
      try {
        const res = await apiFetch<{ messages: ChatMessage[] }>(
          `/api/chat/rooms/${encodeURIComponent(activeRoomId)}/messages`
        );
        if (active) setMessages(res.messages);
      } catch {
        // ignore
      }
    }
    fetchMessages();

    let ws: WebSocket | null = null;
    try {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = getStoredToken() || '';
      ws = new WebSocket(
        `${proto}//${window.location.host}/ws?roomId=${encodeURIComponent(activeRoomId)}&token=${encodeURIComponent(token)}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        if (active) setWsConnected(true);
      };
      ws.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data) as {
            type: string;
            roomId?: string;
            message?: ChatMessage;
            messageId?: string;
            activeUsers?: string[];
          };
          if (payload.type === 'message:new' && payload.roomId === activeRoomId && payload.message) {
            setMessages((prev) =>
              prev.some((m) => m.id === payload.message!.id) ? prev : [...prev, payload.message!]
            );
          } else if (
            payload.type === 'message:deleted' &&
            payload.roomId === activeRoomId &&
            payload.messageId
          ) {
            setMessages((prev) => prev.filter((m) => m.id !== payload.messageId));
          } else if (payload.type === 'presence:update' && payload.roomId === activeRoomId) {
            setActiveUsers(payload.activeUsers || []);
          }
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        if (active) setWsConnected(false);
      };
      ws.onerror = () => {
        if (active) setWsConnected(false);
      };
    } catch {
      setWsConnected(false);
    }

    const pollInterval = window.setInterval(fetchMessages, 4500);

    return () => {
      active = false;
      window.clearInterval(pollInterval);
      ws?.close();
      wsRef.current = null;
    };
  }, [activeRoomId, citizen?.user.id]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, aiHistory]);

  const citizenById = useMemo(() => {
    const map: Record<string, CitizenRecord> = {};
    for (const c of citizens) map[c.user.id] = c;
    return map;
  }, [citizens]);

  const blockedIdSet = useMemo(
    () => new Set(blockedUsers.map((b) => b.blockedUserId)),
    [blockedUsers]
  );

  const activeRoom = rooms.find((r) => r.id === activeRoomId);
  const channelRooms = rooms.filter((r) => r.type === 'channel');
  const groupRooms = rooms.filter((r) => r.type === 'group');
  const dmRooms = rooms.filter((r) => r.type === 'dm');

  const canCreateGroup =
    Boolean(citizen) &&
    citizen?.user.role !== 'guest' &&
    citizen?.user.accountStatus !== 'suspended';

  const isGroupCreator = Boolean(
    activeRoom?.type === 'group' && citizen && activeRoom.creatorId === citizen.user.id
  );
  const isGroupCoCreator = Boolean(
    activeRoom?.type === 'group' &&
      citizen &&
      activeRoom.coCreatorIds?.includes(citizen.user.id)
  );
  const isPlatformMod = Boolean(
    citizen && (citizen.user.role === 'admin' || citizen.user.role === 'superadmin')
  );
  const canManageMembers = Boolean(isGroupCreator || isGroupCoCreator || isPlatformMod);
  const canArchiveOrDeleteGroup = Boolean(isGroupCreator || isPlatformMod);

  const dmOtherUserId =
    activeRoom?.type === 'dm' && citizen
      ? activeRoom.participants?.find((id) => id !== citizen.user.id)
      : undefined;
  const dmOtherCitizen = dmOtherUserId ? citizenById[dmOtherUserId] : undefined;

  async function handleSendRoomMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!inputText.trim()) return;
    setError(null);

    if (activeRoomId === 'ai-bupati') {
      const userPrompt = inputText.trim();
      setInputText('');
      const userBubble: AiChatBubble = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: userPrompt,
      };
      const streamBubbleId = `m-${Date.now() + 1}`;
      const historyPayload = aiHistory
        .filter((b) => b.id !== 'ai-welcome' && b.text.trim().length > 0)
        .slice(-10)
        .map((b) => ({ role: b.role, text: b.text }));

      setAiHistory((prev) => [
        ...prev,
        userBubble,
        { id: streamBubbleId, role: 'model', text: '' },
      ]);
      setAiLoading(true);
      let receivedAnyChunk = false;
      try {
        await streamAiChat(
          {
            history: historyPayload,
            message: userPrompt,
          },
          (chunkText) => {
            receivedAnyChunk = true;
            setAiHistory((prev) =>
              prev.map((item) =>
                item.id === streamBubbleId ? { ...item, text: item.text + chunkText } : item
              )
            );
          },
          28000
        );
        if (!receivedAnyChunk) {
          setAiHistory((prev) => prev.filter((item) => item.id !== streamBubbleId));
          setError('Bupati AI tidak mengembalikan teks. Silakan coba kirim ulang.');
        }
      } catch (err) {
        if (!receivedAnyChunk) {
          setAiHistory((prev) => prev.filter((item) => item.id !== streamBubbleId));
        }
        setError(err instanceof Error ? err.message : 'Gagal menghubungi Bupati AI.');
      } finally {
        setAiLoading(false);
      }
      return;
    }

    if (!citizen) {
      onNavigate('auth');
      return;
    }

    const text = inputText.trim();
    setInputText('');
    setSending(true);
    try {
      const res = await apiFetch<{ message: ChatMessage }>(
        `/api/chat/rooms/${encodeURIComponent(activeRoomId)}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ messageText: text }),
        }
      );
      setMessages((prev) =>
        prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim pesan.');
    } finally {
      setSending(false);
    }
  }

  async function handleOpenDm(targetUserId: string) {
    if (!citizen) {
      onNavigate('auth');
      return;
    }
    setError(null);
    try {
      const res = await apiFetch<{ room: ChatRoom }>('/api/chat/dm', {
        method: 'POST',
        body: JSON.stringify({ targetUserId }),
      });
      setRooms((prev) => (prev.some((r) => r.id === res.room.id) ? prev : [...prev, res.room]));
      setActiveRoomId(res.room.id);
      setShowDmPicker(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuka DM.');
    }
  }

  function handleOpenCreateGroupClick() {
    if (!citizen) {
      onNavigate('auth');
      return;
    }
    if (citizen.user.role === 'guest') {
      setError(
        'Hanya warga ber-KTP (Member) dan Admin yang dapat membuat grup. Cetak KTP di KTP Studio terlebih dahulu.'
      );
      return;
    }
    if (citizen.user.accountStatus === 'suspended') {
      setError('Akun Anda sedang ditangguhkan dan tidak dapat membuat grup baru.');
      return;
    }
    setError(null);
    setShowCreateGroup(true);
  }

  async function handleCreateGroupSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreatingGroup(true);
    setError(null);
    try {
      const res = await apiFetch<{ room: ChatRoom }>('/api/chat/groups', {
        method: 'POST',
        body: JSON.stringify({
          name: newGroupName,
          description: newGroupDesc,
          realmTag: newGroupRealm,
          memberIds: selectedMemberIds,
        }),
      });
      setRooms((prev) => [...prev, res.room]);
      setActiveRoomId(res.room.id);
      setNewGroupName('');
      setNewGroupDesc('');
      setSelectedMemberIds([]);
      setShowCreateGroup(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat grup.');
    } finally {
      setCreatingGroup(false);
    }
  }

  function syncRoomState(updated: ChatRoom) {
    setRooms((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  async function handleAddPeopleToGroup() {
    if (!activeRoom || addPeopleSelection.length === 0) return;
    setGroupActionBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ room: ChatRoom }>(
        `/api/chat/groups/${activeRoom.id}/members`,
        {
          method: 'POST',
          body: JSON.stringify({ userIds: addPeopleSelection }),
        }
      );
      syncRoomState(res.room);
      setAddPeopleSelection([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menambahkan anggota.');
    } finally {
      setGroupActionBusy(false);
    }
  }

  async function handleRemoveOrLeaveMember(targetUserId: string) {
    if (!activeRoom) return;
    setGroupActionBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ room: ChatRoom }>(
        `/api/chat/groups/${activeRoom.id}/members/${targetUserId}`,
        { method: 'DELETE' }
      );
      if (targetUserId === citizen?.user.id) {
        setRooms((prev) => prev.filter((r) => r.id !== activeRoom.id));
        setShowManageGroup(false);
        setActiveRoomId('room-alun-alun');
      } else {
        syncRoomState(res.room);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memproses anggota grup.');
    } finally {
      setGroupActionBusy(false);
    }
  }

  async function handleToggleCoCreator(targetUserId: string, makeCoCreator: boolean) {
    if (!activeRoom) return;
    setGroupActionBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ room: ChatRoom }>(
        `/api/chat/groups/${activeRoom.id}/co-creators`,
        {
          method: 'PATCH',
          body: JSON.stringify({ userId: targetUserId, isCoCreator: makeCoCreator }),
        }
      );
      syncRoomState(res.room);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui Co-Creator.');
    } finally {
      setGroupActionBusy(false);
    }
  }

  async function handleToggleArchiveGroup(archived: boolean) {
    if (!activeRoom) return;
    setGroupActionBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ room: ChatRoom }>(
        `/api/chat/groups/${activeRoom.id}/archive`,
        {
          method: 'PATCH',
          body: JSON.stringify({ archived }),
        }
      );
      syncRoomState(res.room);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui status arsip grup.');
    } finally {
      setGroupActionBusy(false);
    }
  }

  async function handleDeleteGroup() {
    if (!activeRoom) return;
    setGroupActionBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/chat/groups/${activeRoom.id}`, { method: 'DELETE' });
      setRooms((prev) => prev.filter((r) => r.id !== activeRoom.id));
      setConfirmDeleteGroup(false);
      setShowManageGroup(false);
      setActiveRoomId('room-alun-alun');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus grup.');
    } finally {
      setGroupActionBusy(false);
    }
  }

  async function handleDeleteMessage(messageId: string) {
    setError(null);
    try {
      await apiFetch(`/api/chat/messages/${messageId}`, { method: 'DELETE' });
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus pesan.');
    }
  }

  async function handleBlockUser(targetUserId: string) {
    if (!citizen) {
      onNavigate('auth');
      return;
    }
    setError(null);
    try {
      await apiFetch('/api/blocks', {
        method: 'POST',
        body: JSON.stringify({ targetUserId }),
      });
      await loadSidebarData();
      setMessages((prev) => prev.filter((m) => m.senderId !== targetUserId));
      if (activeRoom?.type === 'dm' && activeRoom.participants?.includes(targetUserId)) {
        setActiveRoomId('room-alun-alun');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memblokir pengguna.');
    }
  }

  async function handleUnblockUser(targetUserId: string) {
    setError(null);
    try {
      await apiFetch(`/api/blocks/${targetUserId}`, { method: 'DELETE' });
      await loadSidebarData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuka blokir.');
    }
  }

  const eligibleCreateInvitees = citizens.filter((c) => {
    if (c.user.id === citizen?.user.id) return false;
    if (!memberSearch.trim()) return true;
    return c.user.username.toLowerCase().includes(memberSearch.trim().toLowerCase());
  });

  const eligibleAddPeople = citizens.filter((c) => {
    if (activeRoom?.participants?.includes(c.user.id)) return false;
    if (!addPeopleSearch.trim()) return true;
    return c.user.username.toLowerCase().includes(addPeopleSearch.trim().toLowerCase());
  });

  const isReadOnlyArchived = Boolean(activeRoom?.type === 'group' && activeRoom.isArchived);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="grid h-[calc(100vh-140px)] min-h-[560px] grid-cols-1 overflow-hidden rounded-2xl border border-[#E4E2DC] bg-white lg:grid-cols-12">
        {/* Left Sidebar: AI, Channels, Groups & DMs */}
        <aside className="flex flex-col border-b border-[#E4E2DC] bg-[#F8F7F4] lg:col-span-4 lg:border-b-0 lg:border-r overflow-hidden">
          <div className="flex items-start justify-between gap-2 border-b border-[#E4E2DC] p-4">
            <div>
              <h1 className="font-display text-lg font-bold text-[#1C2421]">
                Balai Obrolan Warga
              </h1>
              <p className="mt-0.5 text-xs text-[#5B6561]">
                Kanal publik, grup komunitas, DM &amp; Bupati AI.
              </p>
            </div>
            {citizen && (
              <button
                type="button"
                onClick={() => setShowBlocksModal(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-[#E4E2DC] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#5B6561] hover:border-[#0F5E46] hover:text-[#1C2421]"
                title="Kelola Daftar Blokir"
              >
                <ShieldBan className="h-3.5 w-3.5" />
                <span>Blokir ({blockedUsers.length})</span>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-5">
            {/* AI Assistant Channel */}
            <div>
              <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-[#5B6561]">
                Asisten AI (Gemini API)
              </p>
              <button
                type="button"
                onClick={() => setActiveRoomId('ai-bupati')}
                className={`mt-1.5 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                  activeRoomId === 'ai-bupati'
                    ? 'bg-[#0F5E46] text-white'
                    : 'bg-white border border-[#E4E2DC] text-[#1C2421] hover:border-[#0F5E46]'
                }`}
              >
                <Bot className="h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate">Bupati AI Jomokerto</p>
                  <p
                    className={`truncate font-mono text-[10px] ${
                      activeRoomId === 'ai-bupati' ? 'text-emerald-100' : 'text-[#5B6561]'
                    }`}
                  >
                    gemini-4-hydrogen · SSE Cepat
                  </p>
                </div>
              </button>
            </div>

            {/* Public Channels */}
            <div>
              <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-[#5B6561]">
                Kanal Publik
              </p>
              <div className="mt-1.5 space-y-1">
                {channelRooms.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => setActiveRoomId(room.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                      activeRoomId === room.id
                        ? 'bg-[#0F5E46]/10 text-[#0F5E46] font-semibold'
                        : 'text-[#1C2421] hover:bg-white'
                    }`}
                  >
                    <Hash className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{room.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Group Chats */}
            <div>
              <div className="flex items-center justify-between px-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6561]">
                  Grup Komunitas
                </p>
                <button
                  type="button"
                  onClick={handleOpenCreateGroupClick}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-[#0F5E46] hover:bg-white"
                  title={
                    canCreateGroup
                      ? 'Buat Grup Baru'
                      : 'Hanya Member ber-KTP & Admin yang bisa buat grup'
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Buat</span>
                </button>
              </div>

              <div className="mt-1.5 space-y-1">
                {groupRooms.length === 0 ? (
                  <p className="px-3 py-1.5 text-[11px] text-[#5B6561]">
                    {citizen
                      ? 'Belum ada grup obrolan. Member ber-KTP & Admin bisa membuat grup.'
                      : 'Masuk untuk melihat & bergabung ke grup obrolan.'}
                  </p>
                ) : (
                  groupRooms.map((room) => (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => setActiveRoomId(room.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                        activeRoomId === room.id
                          ? 'bg-[#0F5E46]/10 text-[#0F5E46] font-semibold'
                          : 'text-[#1C2421] hover:bg-white'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {room.isArchived ? (
                          <Archive className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                        ) : (
                          <Users className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="truncate">{room.name}</span>
                      </span>
                      <span className="font-mono text-[10px] text-[#5B6561] shrink-0">
                        {room.participants?.length || 0}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Direct Messages */}
            <div>
              <div className="flex items-center justify-between px-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6561]">
                  Pesan Langsung (DM)
                </p>
                <button
                  type="button"
                  onClick={() => setShowDmPicker((v) => !v)}
                  className="rounded p-1 text-[#0F5E46] hover:bg-white"
                  title="Mulai DM baru"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                </button>
              </div>

              {showDmPicker && (
                <div className="mt-2 rounded-xl border border-[#E4E2DC] bg-white p-2 space-y-1 max-h-48 overflow-y-auto">
                  <p className="px-2 text-[11px] text-[#5B6561]">Pilih warga untuk DM:</p>
                  {citizens
                    .filter(
                      (c) => c.user.id !== citizen?.user.id && !blockedIdSet.has(c.user.id)
                    )
                    .map((c) => (
                      <button
                        key={c.user.id}
                        type="button"
                        onClick={() => handleOpenDm(c.user.id)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-[#F8F7F4]"
                      >
                        <img
                          src={c.user.avatarUrl}
                          alt={c.user.username}
                          referrerPolicy="no-referrer"
                          className="h-5 w-5 rounded-full object-cover"
                        />
                        <span className="truncate">@{c.user.username}</span>
                      </button>
                    ))}
                </div>
              )}

              <div className="mt-1.5 space-y-1">
                {dmRooms.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => setActiveRoomId(room.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                      activeRoomId === room.id
                        ? 'bg-[#0F5E46]/10 text-[#0F5E46] font-semibold'
                        : 'text-[#1C2421] hover:bg-white'
                    }`}
                  >
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{room.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Chat Stream Panel */}
        <section className="flex flex-col lg:col-span-8 min-h-0">
          {/* Room Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E2DC] px-5 py-3.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate font-display text-base font-bold text-[#1C2421]">
                  {activeRoomId === 'ai-bupati'
                    ? 'Bupati AI Republik Jomokerto'
                    : activeRoom?.name || 'Ruang Obrolan'}
                </h2>
                {isReadOnlyArchived && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                    <Archive className="h-3 w-3" />
                    Arsip Read-Only
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-[#5B6561]">
                {activeRoomId === 'ai-bupati'
                  ? 'Didukung server-side @google/genai (gemini-4-hydrogen) — membutuhkan GEMINI_API_KEY di server.'
                  : activeRoom?.description}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {activeRoom?.type === 'group' && (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDeleteGroup(false);
                    setShowManageGroup(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-1.5 text-xs font-semibold text-[#1C2421] hover:border-[#0F5E46]"
                >
                  <UserPlus className="h-3.5 w-3.5 text-[#0F5E46]" />
                  <span>Anggota ({activeRoom.participants?.length || 0})</span>
                </button>
              )}

              {activeRoom?.type === 'dm' && dmOtherUserId && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setReportTarget({
                        targetType: 'user',
                        targetId: dmOtherUserId,
                        targetLabel: `@${dmOtherCitizen?.user.username || 'warga'}`,
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-[#E4E2DC] px-2.5 py-1.5 text-[11px] font-medium text-[#5B6561] hover:border-red-300 hover:text-red-700"
                    title="Laporkan warga ini"
                  >
                    <Flag className="h-3.5 w-3.5" />
                    <span>Laporkan</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBlockUser(dmOtherUserId)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-100"
                    title="Blokir warga ini"
                  >
                    <Ban className="h-3.5 w-3.5" />
                    <span>Blokir</span>
                  </button>
                </div>
              )}

              {activeRoomId !== 'ai-bupati' && (
                <div className="text-right font-mono text-[11px] text-[#5B6561]">
                  <span>{wsConnected ? 'Live WS' : 'HTTP Sync'}</span>
                  {activeUsers.length > 0 && (
                    <span className="block">{activeUsers.length} aktif</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {isReadOnlyArchived && (
            <div className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-900 flex items-center gap-2">
              <Archive className="h-4 w-4 shrink-0" />
              <span>
                Grup ini telah dibekukan/diarsipkan oleh Creator (seperti arsip repositori). Seluruh pesan lama tetap dapat dibaca, tetapi tidak dapat mengirim pesan baru atau mengubah anggota.
              </span>
            </div>
          )}

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#F8F7F4]/40">
            {activeRoomId === 'ai-bupati' ? (
              <>
                {aiHistory.map((item) => (
                  <div
                    key={item.id}
                    className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
                        item.role === 'user'
                          ? 'bg-[#0F5E46] text-white'
                          : 'border border-[#E4E2DC] bg-white text-[#1C2421]'
                      }`}
                    >
                      {item.text || (
                        <span className="inline-flex items-center gap-2 text-xs text-[#5B6561]">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0F5E46]" />
                          <span>Bupati AI sedang menyusun jawaban...</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </>
            ) : messages.length === 0 ? (
              <div className="py-16 text-center text-xs text-[#5B6561]">
                Belum ada pesan di ruang ini. Mulai percakapan pertama!
              </div>
            ) : (
              messages.map((msg) => {
                const isMine = citizen?.user.id === msg.senderId;
                const canDeleteMsg =
                  Boolean(citizen) &&
                  (isMine || isPlatformMod || isGroupCreator || isGroupCoCreator);
                return (
                  <div
                    key={msg.id}
                    className={`group flex items-start gap-3 ${isMine ? 'flex-row-reverse text-right' : ''}`}
                  >
                    <img
                      src={msg.senderAvatar}
                      alt={msg.senderUsername}
                      referrerPolicy="no-referrer"
                      className="h-8 w-8 rounded-full border border-[#E4E2DC] object-cover shrink-0"
                    />
                    <div className={`max-w-[78%] space-y-1 ${isMine ? 'items-end' : ''}`}>
                      <div
                        className={`flex flex-wrap items-center gap-2 text-[11px] text-[#5B6561] ${
                          isMine ? 'justify-end' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onNavigate('bio', msg.senderUsername)}
                          className="font-semibold text-[#1C2421] hover:text-[#0F5E46]"
                        >
                          @{msg.senderUsername}
                        </button>
                        <span>{msg.senderRole}</span>
                        <span className="tabular-nums">{formatTimeId(msg.createdAt)}</span>

                        {citizen && !isMine && (
                          <span className="inline-flex items-center gap-1 opacity-70 group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() =>
                                setReportTarget({
                                  targetType: 'message',
                                  targetId: msg.id,
                                  targetLabel: `Pesan @${msg.senderUsername}`,
                                  snippet: msg.messageText,
                                })
                              }
                              className="rounded p-0.5 text-[#5B6561] hover:text-red-700"
                              title="Laporkan pesan ini"
                            >
                              <Flag className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBlockUser(msg.senderId)}
                              className="rounded p-0.5 text-[#5B6561] hover:text-red-700"
                              title={`Blokir @${msg.senderUsername}`}
                            >
                              <Ban className="h-3 w-3" />
                            </button>
                          </span>
                        )}

                        {canDeleteMsg && (
                          <button
                            type="button"
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="rounded p-0.5 text-[#5B6561] opacity-70 hover:text-red-700 group-hover:opacity-100"
                            title="Hapus pesan"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <div
                        className={`inline-block rounded-2xl px-3.5 py-2 text-sm text-left ${
                          isMine
                            ? 'bg-[#0F5E46] text-white'
                            : 'border border-[#E4E2DC] bg-white text-[#1C2421]'
                        }`}
                      >
                        {msg.messageText}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={scrollEndRef} />
          </div>

          {error && (
            <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800 flex items-center justify-between gap-2">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} className="text-[11px] underline">
                Tutup
              </button>
            </div>
          )}

          {/* Composer */}
          <form
            onSubmit={handleSendRoomMessage}
            className="flex items-center gap-2 border-t border-[#E4E2DC] bg-white p-3.5"
          >
            <input
              type="text"
              value={inputText}
              disabled={isReadOnlyArchived}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                isReadOnlyArchived
                  ? 'Grup diarsipkan (read-only) — pengiriman pesan dinonaktifkan.'
                  : activeRoomId === 'ai-bupati'
                    ? 'Tanya Bupati AI (contoh: buatkan motto KTP bertema Ngawi & Genshin)...'
                    : citizen
                      ? `Kirim pesan ke ${activeRoom?.name || 'ruang ini'}...`
                      : 'Masuk untuk mengirim pesan di ruang warga...'
              }
              className="flex-1 rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3.5 py-2 text-sm focus:border-[#0F5E46] focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isReadOnlyArchived || sending || aiLoading || !inputText.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F5E46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B4A37] disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Kirim</span>
            </button>
          </form>
        </section>
      </div>

      {/* Modal: Create Group + Insert People */}
      {showCreateGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
          <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#E4E2DC] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#E4E2DC] px-5 py-4">
              <div>
                <h2 className="font-display text-lg font-bold text-[#1C2421]">
                  Buat Grup Obrolan Baru
                </h2>
                <p className="text-xs text-[#5B6561]">
                  Anda otomatis menjadi Creator permanen (tidak dapat dipindah). Co-Creator dapat diangkat setelah grup dibuat.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateGroup(false)}
                className="rounded-lg p-1 text-[#5B6561] hover:bg-[#F8F7F4]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateGroupSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#1C2421] mb-1">
                  Nama Grup *
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Contoh: Regu Mabar Ngawi Selatan"
                  className="w-full rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 text-sm focus:border-[#0F5E46] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-[#1C2421] mb-1">
                    Topik / Wilayah
                  </label>
                  <input
                    type="text"
                    value={newGroupRealm}
                    onChange={(e) => setNewGroupRealm(e.target.value)}
                    placeholder="Grup Warga / Sumeru / Ngawi"
                    className="w-full rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 text-xs focus:border-[#0F5E46] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1C2421] mb-1">
                    Deskripsi Singkat
                  </label>
                  <input
                    type="text"
                    value={newGroupDesc}
                    onChange={(e) => setNewGroupDesc(e.target.value)}
                    placeholder="Koordinasi warga & diskusi..."
                    className="w-full rounded-lg border border-[#E4E2DC] bg-[#F8F7F4] px-3 py-2 text-xs focus:border-[#0F5E46] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-[#1C2421]">
                    Insert People (Undang Warga: {selectedMemberIds.length} dipilih)
                  </label>
                  <input
                    type="search"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Cari @username..."
                    className="w-40 rounded-md border border-[#E4E2DC] bg-[#F8F7F4] px-2.5 py-1 text-xs focus:border-[#0F5E46] focus:outline-none"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-xl border border-[#E4E2DC] bg-[#F8F7F4] p-2 space-y-1">
                  {eligibleCreateInvitees.map((c) => {
                    const checked = selectedMemberIds.includes(c.user.id);
                    return (
                      <label
                        key={c.user.id}
                        className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs hover:bg-white"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setSelectedMemberIds((prev) =>
                                checked
                                  ? prev.filter((id) => id !== c.user.id)
                                  : [...prev, c.user.id]
                              )
                            }
                            className="accent-[#0F5E46]"
                          />
                          <img
                            src={c.user.avatarUrl}
                            alt={c.user.username}
                            referrerPolicy="no-referrer"
                            className="h-5 w-5 rounded-full object-cover"
                          />
                          <span className="truncate font-medium text-[#1C2421]">
                            @{c.user.username}
                          </span>
                        </span>
                        <span className="font-mono text-[10px] text-[#5B6561]">{c.user.role}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E4E2DC]">
                <button
                  type="button"
                  onClick={() => setShowCreateGroup(false)}
                  className="rounded-lg border border-[#E4E2DC] px-4 py-2 text-xs font-medium text-[#5B6561]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={creatingGroup || newGroupName.trim().length < 2}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F5E46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B4A37] disabled:opacity-50"
                >
                  {creatingGroup && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Buat Grup &amp; Masukkan Anggota</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Manage Group (Members, Co-Creator, Archive/Freeze, Delete) */}
      {showManageGroup && activeRoom?.type === 'group' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
          <div className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[#E4E2DC] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#E4E2DC] px-5 py-4">
              <div>
                <h2 className="font-display text-lg font-bold text-[#1C2421]">
                  Kelola Grup: {activeRoom.name}
                </h2>
                <p className="text-xs text-[#5B6561]">
                  Creator grup bersifat permanen. Co-Creator dapat tambah/keluarkan anggota, namun tidak dapat mengarsipkan atau menghapus grup.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowManageGroup(false)}
                className="rounded-lg p-1 text-[#5B6561] hover:bg-[#F8F7F4]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Insert People Section */}
              {canManageMembers && !activeRoom.isArchived && (
                <div className="rounded-xl border border-[#E4E2DC] bg-[#F8F7F4] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-[#1C2421]">
                      Insert People (Tambah Anggota Baru)
                    </p>
                    <input
                      type="search"
                      value={addPeopleSearch}
                      onChange={(e) => setAddPeopleSearch(e.target.value)}
                      placeholder="Cari @username..."
                      className="w-36 rounded-md border border-[#E4E2DC] bg-white px-2.5 py-1 text-xs focus:border-[#0F5E46] focus:outline-none"
                    />
                  </div>
                  {eligibleAddPeople.length === 0 ? (
                    <p className="text-[11px] text-[#5B6561]">
                      Semua warga yang tersedia sudah bergabung ke grup ini.
                    </p>
                  ) : (
                    <>
                      <div className="max-h-36 overflow-y-auto space-y-1">
                        {eligibleAddPeople.map((c) => {
                          const checked = addPeopleSelection.includes(c.user.id);
                          return (
                            <label
                              key={c.user.id}
                              className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1 text-xs hover:bg-white"
                            >
                              <span className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setAddPeopleSelection((prev) =>
                                      checked
                                        ? prev.filter((id) => id !== c.user.id)
                                        : [...prev, c.user.id]
                                    )
                                  }
                                  className="accent-[#0F5E46]"
                                />
                                <img
                                  src={c.user.avatarUrl}
                                  alt={c.user.username}
                                  referrerPolicy="no-referrer"
                                  className="h-5 w-5 rounded-full object-cover"
                                />
                                <span className="font-medium text-[#1C2421]">
                                  @{c.user.username}
                                </span>
                              </span>
                              <span className="font-mono text-[10px] text-[#5B6561]">
                                {c.user.role}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        disabled={groupActionBusy || addPeopleSelection.length === 0}
                        onClick={handleAddPeopleToGroup}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F5E46] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0B4A37] disabled:opacity-50"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        <span>Masukkan {addPeopleSelection.length} Warga</span>
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Current Members */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5B6561] mb-2">
                  Daftar Anggota ({activeRoom.participants?.length || 0})
                </h3>
                <div className="divide-y divide-[#E4E2DC] rounded-xl border border-[#E4E2DC] bg-white">
                  {(activeRoom.participants || []).map((memberId) => {
                    const memberCitizen = citizenById[memberId];
                    const isMemberCreator = memberId === activeRoom.creatorId;
                    const isMemberCoCreator = Boolean(
                      activeRoom.coCreatorIds?.includes(memberId)
                    );
                    const canPromoteCoCreator =
                      canArchiveOrDeleteGroup && !isMemberCreator && !activeRoom.isArchived;
                    const canKickThisMember =
                      canManageMembers &&
                      !activeRoom.isArchived &&
                      !isMemberCreator &&
                      memberId !== citizen?.user.id &&
                      (!isMemberCoCreator || isGroupCreator || isPlatformMod);

                    return (
                      <div
                        key={memberId}
                        className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={memberCitizen?.user.avatarUrl || ''}
                            alt={memberCitizen?.user.username || memberId}
                            referrerPolicy="no-referrer"
                            className="h-7 w-7 rounded-full border border-[#E4E2DC] object-cover"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-[#1C2421]">
                              @{memberCitizen?.user.username || memberId}
                              {memberId === citizen?.user.id && (
                                <span className="ml-1 text-[10px] text-[#5B6561]">(Anda)</span>
                              )}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {isMemberCreator ? (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                                  <Crown className="h-2.5 w-2.5" />
                                  Creator (Permanen)
                                </span>
                              ) : isMemberCoCreator ? (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-900">
                                  <Shield className="h-2.5 w-2.5" />
                                  Co-Creator
                                </span>
                              ) : (
                                <span className="font-mono text-[10px] text-[#5B6561]">Anggota</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {canPromoteCoCreator && (
                            <button
                              type="button"
                              disabled={groupActionBusy}
                              onClick={() =>
                                handleToggleCoCreator(memberId, !isMemberCoCreator)
                              }
                              className="rounded-md border border-[#E4E2DC] px-2.5 py-1 text-[11px] font-medium text-[#1C2421] hover:border-[#0F5E46]"
                            >
                              {isMemberCoCreator ? 'Cabut Co-Creator' : 'Angkat Co-Creator'}
                            </button>
                          )}
                          {canKickThisMember && (
                            <button
                              type="button"
                              disabled={groupActionBusy}
                              onClick={() => handleRemoveOrLeaveMember(memberId)}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
                              title="Keluarkan dari grup"
                            >
                              <UserMinus className="h-3 w-3" />
                              <span>Keluarkan</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Creator-only Governance & Leave Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E4E2DC] pt-4">
                {canArchiveOrDeleteGroup ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={groupActionBusy}
                      onClick={() => handleToggleArchiveGroup(!activeRoom.isArchived)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:opacity-90"
                    >
                      {activeRoom.isArchived ? (
                        <>
                          <ArchiveRestore className="h-3.5 w-3.5" />
                          <span>Buka Arsip Grup</span>
                        </>
                      ) : (
                        <>
                          <Archive className="h-3.5 w-3.5" />
                          <span>Bekukan / Arsipkan (Read-Only)</span>
                        </>
                      )}
                    </button>

                    {!confirmDeleteGroup ? (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteGroup(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Hapus Grup</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={groupActionBusy}
                        onClick={handleDeleteGroup}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
                      >
                        <span>Konfirmasi Hapus Permanen</span>
                      </button>
                    )}
                  </div>
                ) : (
                  citizen &&
                  !isGroupCreator && (
                    <button
                      type="button"
                      disabled={groupActionBusy}
                      onClick={() => handleRemoveOrLeaveMember(citizen.user.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Keluar dari Grup</span>
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Blocked Users Manager */}
      {showBlocksModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-[#E4E2DC] bg-white p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E4E2DC] pb-3">
              <div>
                <h2 className="font-display text-base font-bold text-[#1C2421]">
                  Daftar Warga Diblokir
                </h2>
                <p className="text-xs text-[#5B6561]">
                  DM, pesan grup, dan postingan timeline dari akun diblokir disembunyikan otomatis.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBlocksModal(false)}
                className="rounded-lg p-1 text-[#5B6561] hover:bg-[#F8F7F4]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {blockedUsers.length === 0 ? (
              <p className="py-6 text-center text-xs text-[#5B6561]">
                Belum ada akun warga yang Anda blokir.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto divide-y divide-[#E4E2DC] rounded-xl border border-[#E4E2DC]">
                {blockedUsers.map((entry) => (
                  <div
                    key={entry.blockedUserId}
                    className="flex items-center justify-between gap-2 px-3 py-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <img
                        src={entry.avatarUrl}
                        alt={entry.username}
                        referrerPolicy="no-referrer"
                        className="h-7 w-7 rounded-full object-cover"
                      />
                      <span className="font-semibold text-[#1C2421]">@{entry.username}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUnblockUser(entry.blockedUserId)}
                      className="rounded-lg border border-[#E4E2DC] px-2.5 py-1 text-[11px] font-semibold text-[#0F5E46] hover:border-[#0F5E46]"
                    >
                      Buka Blokir
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
    </div>
  );
}
