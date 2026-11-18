import express from 'express';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  DEFAULT_AVATAR_URL,
  type AccountStatus,
  type LocationType,
  type ReportTargetType,
  type SocialLinks,
  type UserRole,
} from '../src/shared/types.ts';
import {
  attachSession,
  COOKIE_NAME,
  hashPassword,
  requireAuth,
  requireRole,
  signSessionToken,
  verifyGoogleCredential,
  verifyPassword,
  type AuthenticatedRequest,
} from './auth.ts';
import {
  addGroupMembers,
  blockUser,
  consumePasswordResetToken,
  createChatMessage,
  createGroupRoom,
  createMapPin,
  createPasswordResetToken,
  createPost,
  createReport,
  createUser,
  createUserAppeal,
  deleteChatMessageById,
  deleteGroupRoom,
  deleteMapPin,
  deletePost,
  exportDatabaseSnapshot,
  getAppealById,
  getChatRoomById,
  getCitizenById,
  getCitizenByUsername,
  getDbDriver,
  getOrCreateDmRoom,
  getReportById,
  getStoredChatMessageById,
  getStoredPostById,
  getStoredUserByGoogle,
  getStoredUserById,
  getStoredUserByLogin,
  isBlockedBetween,
  listAppeals,
  listBlockedUsers,
  listChatMessages,
  listChatRooms,
  listCitizens,
  listMapPins,
  listPosts,
  listReports,
  removeGroupMember,
  setGroupArchived,
  setGroupCoCreator,
  setUserAccountStatus,
  togglePostLike,
  unblockUser,
  updateAppealRecord,
  updateReportStatus,
  updateUserBasic,
  updateUserRole,
  upsertKtpProfile,
  verifyKtpProfile,
} from './db.ts';
import {
  formatGeminiError,
  generateAiImage,
  hasConfiguredGeminiKey,
  runCivicAiChat,
  runMapsGroundingSearch,
  streamCivicAiChat,
  type AiImageQuality,
} from './gemini.ts';

export type ChatEventHook = (roomId: string, payload: Record<string, unknown>) => void;

const DISALLOWED_MEDIA_EXT_RE = /\.(mp4|webm|mov|avi|mkv|mp3|wav|ogg|m4a|flac|pdf|zip|rar|exe|dmg)(\?|$)/i;

function validateImagePayload(
  imageUrl?: string,
  imageMimeType?: string
): { ok: true; url?: string; mime?: string } | { ok: false; error: string } {
  if (!imageUrl || !imageUrl.trim()) {
    return { ok: true };
  }
  const trimmed = imageUrl.trim();
  if (trimmed.startsWith('data:')) {
    const match = /^data:([^;]+);base64,/i.exec(trimmed);
    if (!match) {
      return { ok: false, error: 'Format data gambar tidak valid.' };
    }
    const mime = match[1].toLowerCase();
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(mime as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
      return {
        ok: false,
        error: `Tipe MIME "${mime}" tidak didukung. Timeline hanya menerima gambar (${ALLOWED_IMAGE_MIME_TYPES.join(', ')}).`,
      };
    }
    return { ok: true, url: trimmed, mime };
  }

  if (
    !trimmed.startsWith('https://') &&
    !trimmed.startsWith('http://') &&
    !trimmed.startsWith('/src/assets/')
  ) {
    return { ok: false, error: 'URL gambar harus menggunakan http(s):// atau upload file gambar.' };
  }

  if (DISALLOWED_MEDIA_EXT_RE.test(trimmed)) {
    return {
      ok: false,
      error: 'Timeline hanya mendukung teks dan gambar. Video, audio, dan file multimedia lainnya tidak diperbolehkan.',
    };
  }

  const normalizedMime = imageMimeType?.toLowerCase().trim();
  if (
    normalizedMime &&
    !ALLOWED_IMAGE_MIME_TYPES.includes(normalizedMime as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])
  ) {
    return {
      ok: false,
      error: `Tipe MIME "${normalizedMime}" ditolak. Hanya tipe gambar CDN yang diizinkan.`,
    };
  }

  return { ok: true, url: trimmed, mime: normalizedMime || 'image/jpeg' };
}

function setSessionCookie(req: express.Request, res: express.Response, token: string): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    path: '/',
  });
}

function wrapAsync(
  handler: (req: AuthenticatedRequest, res: express.Response) => Promise<void>
): express.RequestHandler {
  return (req, res, next) => {
    handler(req as AuthenticatedRequest, res).catch(next);
  };
}

const requireNotSuspended: express.RequestHandler = (req, res, next) => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.sessionUser) {
    res.status(401).json({ error: 'Silakan masuk terlebih dahulu.' });
    return;
  }
  getStoredUserById(authReq.sessionUser.userId)
    .then((user) => {
      if (!user) {
        res.status(401).json({ error: 'Sesi warga tidak ditemukan.' });
        return;
      }
      if (user.accountStatus === 'suspended') {
        res.status(403).json({
          error:
            'Akun Anda sedang ditangguhkan (suspended). Ajukan atau pantau Sidang Banding untuk pemulihan akses.',
          accountStatus: 'suspended',
        });
        return;
      }
      next();
    })
    .catch(next);
};

export function createApp(onChatEvent?: ChatEventHook): express.Express {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(attachSession);

  // Health & Config
  app.get(
    '/api/health',
    wrapAsync(async (_req, res) => {
      res.json({
        ok: true,
        republic: 'Republik Jomokerto',
        dbDriver: await getDbDriver(),
        timestamp: new Date().toISOString(),
      });
    })
  );

  app.get(
    '/api/config/public',
    wrapAsync(async (_req, res) => {
      res.json({
        googleMapsApiKey:
          process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '',
        googleClientId: process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '',
        dbDriver: await getDbDriver(),
        hasGeminiKey: hasConfiguredGeminiKey(),
      });
    })
  );

  // Auth Routes
  app.post(
    '/api/auth/register',
    wrapAsync(async (req, res) => {
      const { username, email, password, avatarUrl } = req.body as {
        username?: string;
        email?: string;
        password?: string;
        avatarUrl?: string;
      };

      if (!username || username.trim().length < 3) {
        res.status(400).json({ error: 'Username minimal 3 karakter.' });
        return;
      }
      if (!/^[a-zA-Z0-9_.-]+$/.test(username.trim())) {
        res.status(400).json({
          error: 'Username hanya boleh berisi huruf, angka, titik, strip, atau underscore.',
        });
        return;
      }
      if (!password || password.length < 6) {
        res.status(400).json({ error: 'Password minimal 6 karakter.' });
        return;
      }

      const existing = await getStoredUserByLogin(username);
      if (existing) {
        res.status(409).json({ error: 'Username sudah terdaftar. Silakan pilih nama lain.' });
        return;
      }

      if (email && email.trim()) {
        const emailTaken = await getStoredUserByLogin(email.trim());
        if (emailTaken) {
          res.status(409).json({ error: 'Email sudah terhubung dengan akun lain.' });
          return;
        }
      }

      const avatarCheck = validateImagePayload(avatarUrl);
      if (!avatarCheck.ok) {
        res.status(400).json({ error: avatarCheck.error });
        return;
      }

      const user = await createUser({
        username: username.trim(),
        email: email?.trim() || undefined,
        passwordHash: hashPassword(password),
        avatarUrl: avatarCheck.url || DEFAULT_AVATAR_URL,
        role: 'guest',
      });

      const token = signSessionToken(user);
      setSessionCookie(req, res, token);
      res.status(201).json({
        token,
        citizen: { user, ktp: null },
      });
    })
  );

  app.post(
    '/api/auth/login',
    wrapAsync(async (req, res) => {
      const { identifier, password } = req.body as { identifier?: string; password?: string };
      if (!identifier || !password) {
        res.status(400).json({ error: 'Masukkan username/email dan password.' });
        return;
      }
      const stored = await getStoredUserByLogin(identifier);
      if (!stored || !verifyPassword(password, stored.passwordHash)) {
        res.status(401).json({ error: 'Username/email atau password tidak cocok.' });
        return;
      }

      const citizen = await getCitizenById(stored.id);
      if (!citizen) {
        res.status(404).json({ error: 'Data warga tidak ditemukan.' });
        return;
      }
      const token = signSessionToken(citizen.user);
      setSessionCookie(req, res, token);
      res.json({ token, citizen });
    })
  );

  app.post(
    '/api/auth/google',
    wrapAsync(async (req, res) => {
      const { credential, demoGoogleEmail, demoGoogleName } = req.body as {
        credential?: string;
        demoGoogleEmail?: string;
        demoGoogleName?: string;
      };

      let googleSub = '';
      let email = '';
      let displayName = '';
      let picture: string | undefined;

      if (credential) {
        const verified = await verifyGoogleCredential(credential);
        if (!verified) {
          res.status(401).json({ error: 'Token Google SSO tidak valid atau kedaluwarsa.' });
          return;
        }
        googleSub = verified.sub;
        email = verified.email;
        displayName = verified.name;
        picture = verified.picture;
      } else if (demoGoogleEmail && demoGoogleEmail.includes('@')) {
        if (process.env.GOOGLE_CLIENT_ID) {
          res.status(400).json({ error: 'Gunakan tombol Google Sign-In resmi.' });
          return;
        }
        googleSub = `proto-google-${demoGoogleEmail.toLowerCase()}`;
        email = demoGoogleEmail.trim().toLowerCase();
        displayName = demoGoogleName?.trim() || email.split('@')[0];
      } else {
        res.status(400).json({ error: 'Kredensial Google SSO atau email Google diperlukan.' });
        return;
      }

      const existing = await getStoredUserByGoogle(googleSub, email);
      if (!existing) {
        const baseSlug =
          displayName
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .replace(/_+/g, '_')
            .slice(0, 16) || 'warga_google';
        let candidate = baseSlug;
        let suffix = 1;
        while (await getStoredUserByLogin(candidate)) {
          candidate = `${baseSlug}_${suffix++}`;
        }
        const created = await createUser({
          username: candidate,
          email,
          passwordHash: hashPassword(`google-sso-${googleSub}-${Date.now()}`),
          avatarUrl: picture || DEFAULT_AVATAR_URL,
          googleId: googleSub,
          googleLinked: true,
          role: 'guest',
        });
        const token = signSessionToken(created);
        setSessionCookie(req, res, token);
        res.status(201).json({ token, citizen: { user: created, ktp: null } });
        return;
      }

      if (!existing.googleLinked) {
        await updateUserBasic(existing.id, { googleId: googleSub, googleLinked: true });
      }
      const citizen = (await getCitizenById(existing.id))!;
      const token = signSessionToken(citizen.user);
      setSessionCookie(req, res, token);
      res.json({ token, citizen });
    })
  );

  app.post(
    '/api/auth/request-reset',
    wrapAsync(async (req, res) => {
      const { email } = req.body as { email?: string };
      if (!email || !email.trim()) {
        res.status(400).json({ error: 'Masukkan email yang terhubung ke akun Anda.' });
        return;
      }
      const result = await createPasswordResetToken(email.trim());
      if (!result) {
        res.status(404).json({
          error: 'Email tidak ditemukan atau akun tidak mendaftarkan email pemulihan.',
        });
        return;
      }
      res.json({
        message: `Kode reset password untuk @${result.username} telah dibuat.`,
        previewResetToken: result.token,
      });
    })
  );

  app.post(
    '/api/auth/reset-password',
    wrapAsync(async (req, res) => {
      const { token, newPassword } = req.body as { token?: string; newPassword?: string };
      if (!token || !newPassword || newPassword.length < 6) {
        res.status(400).json({
          error: 'Token reset dan password baru (min. 6 karakter) wajib diisi.',
        });
        return;
      }
      const ok = await consumePasswordResetToken(token, hashPassword(newPassword));
      if (!ok) {
        res.status(400).json({ error: 'Token reset tidak valid atau sudah kedaluwarsa.' });
        return;
      }
      res.json({ message: 'Password berhasil diperbarui. Silakan masuk dengan password baru.' });
    })
  );

  app.get(
    '/api/auth/me',
    wrapAsync(async (req, res) => {
      if (!req.sessionUser) {
        res.json({ citizen: null });
        return;
      }
      const citizen = await getCitizenById(req.sessionUser.userId);
      res.json({ citizen });
    })
  );

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  });

  // Citizens & KTP Studio
  app.get(
    '/api/citizens',
    wrapAsync(async (_req, res) => {
      const citizens = (await listCitizens()).map((c) => ({
        user: {
          ...c.user,
          email: undefined,
        },
        ktp: c.ktp,
      }));
      res.json({ citizens });
    })
  );

  app.get(
    '/api/citizens/:username',
    wrapAsync(async (req, res) => {
      const citizen = await getCitizenByUsername(req.params.username);
      if (!citizen) {
        res.status(404).json({ error: 'Warga tidak ditemukan di arsip Republik Jomokerto.' });
        return;
      }
      res.json({
        citizen: {
          user: { ...citizen.user, email: undefined },
          ktp: citizen.ktp,
        },
      });
    })
  );

  app.put(
    '/api/profile/basic',
    requireAuth,
    requireNotSuspended,
    wrapAsync(async (req, res) => {
      const { email, avatarUrl } = req.body as { email?: string; avatarUrl?: string };
      const avatarCheck = validateImagePayload(avatarUrl);
      if (!avatarCheck.ok) {
        res.status(400).json({ error: avatarCheck.error });
        return;
      }
      const updated = await updateUserBasic(req.sessionUser!.userId, {
        email: email !== undefined ? email.trim() : undefined,
        avatarUrl: avatarUrl !== undefined ? avatarCheck.url || DEFAULT_AVATAR_URL : undefined,
      });
      if (!updated) {
        res.status(404).json({ error: 'Akun tidak ditemukan.' });
        return;
      }
      const citizen = await getCitizenById(updated.id);
      res.json({ citizen });
    })
  );

  app.put(
    '/api/profile/ktp',
    requireAuth,
    requireNotSuspended,
    wrapAsync(async (req, res) => {
      const {
        fullName,
        title,
        locationType,
        locationName,
        faction,
        motto,
        bloodGroup,
        socialLinks,
        avatarUrl,
      } = req.body as {
        fullName?: string;
        title?: string;
        locationType?: LocationType;
        locationName?: string;
        faction?: string;
        motto?: string;
        bloodGroup?: string;
        socialLinks?: SocialLinks;
        avatarUrl?: string;
      };

      if (!fullName || fullName.trim().length < 2) {
        res.status(400).json({ error: 'Nama lengkap di KTP wajib diisi (minimal 2 karakter).' });
        return;
      }
      if (!motto || motto.trim().length < 3) {
        res.status(400).json({ error: 'Motto warga wajib diisi untuk mencetak KTP.' });
        return;
      }

      if (avatarUrl !== undefined) {
        const avatarCheck = validateImagePayload(avatarUrl);
        if (!avatarCheck.ok) {
          res.status(400).json({ error: avatarCheck.error });
          return;
        }
        await updateUserBasic(req.sessionUser!.userId, {
          avatarUrl: avatarCheck.url || DEFAULT_AVATAR_URL,
        });
      }

      const updated = await upsertKtpProfile(req.sessionUser!.userId, {
        fullName,
        title: title || 'Warga Penjomok Aktif',
        locationType: locationType === 'fictional' ? 'fictional' : 'real',
        locationName: locationName?.trim() || 'NGAWI',
        faction: faction || 'Serikat Warga Ngawi',
        motto,
        bloodGroup: bloodGroup || 'O+',
        socialLinks: socialLinks || {},
      });

      if (!updated) {
        res.status(404).json({ error: 'Akun tidak ditemukan.' });
        return;
      }

      const token = signSessionToken(updated.user);
      setSessionCookie(req, res, token);
      res.json({ token, citizen: updated });
    })
  );

  // Timeline Posts (Text + Image Only)
  app.get(
    '/api/posts',
    wrapAsync(async (req, res) => {
      const posts = await listPosts(req.sessionUser?.userId);
      res.json({ posts });
    })
  );

  app.post(
    '/api/posts',
    requireAuth,
    requireNotSuspended,
    wrapAsync(async (req, res) => {
      const { contentText, imageUrl, imageMimeType, locationTag } = req.body as {
        contentText?: string;
        imageUrl?: string;
        imageMimeType?: string;
        locationTag?: string;
      };

      if (!contentText || contentText.trim().length === 0) {
        res.status(400).json({ error: 'Isi teks postingan tidak boleh kosong.' });
        return;
      }
      const imgCheck = validateImagePayload(imageUrl, imageMimeType);
      if (!imgCheck.ok) {
        res.status(400).json({ error: imgCheck.error });
        return;
      }

      const post = await createPost({
        authorId: req.sessionUser!.userId,
        contentText,
        imageUrl: imgCheck.url,
        imageMimeType: imgCheck.mime,
        locationTag,
      });
      res.status(201).json({ post });
    })
  );

  app.post(
    '/api/posts/:id/like',
    requireAuth,
    requireNotSuspended,
    wrapAsync(async (req, res) => {
      const result = await togglePostLike(req.params.id, req.sessionUser!.userId);
      if (!result) {
        res.status(404).json({ error: 'Postingan tidak ditemukan.' });
        return;
      }
      res.json(result);
    })
  );

  app.delete(
    '/api/posts/:id',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ok = await deletePost(
        req.params.id,
        req.sessionUser!.userId,
        req.sessionUser!.role
      );
      if (!ok) {
        res.status(403).json({ error: 'Tidak dapat menghapus postingan ini.' });
        return;
      }
      res.json({ ok: true });
    })
  );

  // Citizen Chat Rooms, Group Chat & Messages
  app.get(
    '/api/chat/rooms',
    wrapAsync(async (req, res) => {
      const rooms = await listChatRooms(req.sessionUser?.userId);
      res.json({ rooms });
    })
  );

  app.post(
    '/api/chat/dm',
    requireAuth,
    requireNotSuspended,
    wrapAsync(async (req, res) => {
      const { targetUserId } = req.body as { targetUserId?: string };
      if (!targetUserId || targetUserId === req.sessionUser!.userId) {
        res.status(400).json({ error: 'Pilih warga lain untuk memulai DM.' });
        return;
      }
      if (await isBlockedBetween(req.sessionUser!.userId, targetUserId)) {
        res.status(403).json({
          error: 'DM tidak dapat dibuat karena salah satu pihak memblokir akun.',
        });
        return;
      }
      const room = await getOrCreateDmRoom(req.sessionUser!.userId, targetUserId);
      if (!room) {
        res.status(404).json({ error: 'Warga tujuan tidak ditemukan.' });
        return;
      }
      res.json({ room });
    })
  );

  app.post(
    '/api/chat/groups',
    requireAuth,
    requireNotSuspended,
    wrapAsync(async (req, res) => {
      const liveUser = await getStoredUserById(req.sessionUser!.userId);
      if (!liveUser) {
        res.status(401).json({ error: 'Akun tidak ditemukan.' });
        return;
      }
      if (liveUser.role === 'guest') {
        res.status(403).json({
          error:
            'Hanya warga ber-KTP (Member), Admin, atau Superadmin yang dapat membuat grup obrolan.',
        });
        return;
      }
      const { name, description, realmTag, memberIds } = req.body as {
        name?: string;
        description?: string;
        realmTag?: string;
        memberIds?: string[];
      };
      if (!name || name.trim().length < 2) {
        res.status(400).json({ error: 'Nama grup minimal 2 karakter.' });
        return;
      }
      const room = await createGroupRoom({
        creatorId: liveUser.id,
        name,
        description,
        realmTag,
        memberIds: Array.isArray(memberIds) ? memberIds : [],
      });
      res.status(201).json({ room });
    })
  );

  app.post(
    '/api/chat/groups/:roomId/members',
    requireAuth,
    requireNotSuspended,
    wrapAsync(async (req, res) => {
      const room = await getChatRoomById(req.params.roomId);
      if (!room || room.type !== 'group') {
        res.status(404).json({ error: 'Grup obrolan tidak ditemukan.' });
        return;
      }
      const liveUser = await getStoredUserById(req.sessionUser!.userId);
      if (!liveUser) {
        res.status(401).json({ error: 'Akun tidak ditemukan.' });
        return;
      }
      const isCreator = room.creatorId === liveUser.id;
      const isCoCreator = Boolean(room.coCreatorIds?.includes(liveUser.id));
      const isPlatformMod = liveUser.role === 'admin' || liveUser.role === 'superadmin';
      if (!isCreator && !isCoCreator && !isPlatformMod) {
        res.status(403).json({
          error: 'Hanya Creator atau Co-Creator grup yang dapat menambahkan anggota.',
        });
        return;
      }
      if (room.isArchived) {
        res.status(403).json({
          error: 'Grup sedang diarsipkan (read-only). Buka arsip terlebih dahulu untuk menambah anggota.',
        });
        return;
      }
      const { userIds } = req.body as { userIds?: string[] };
      if (!Array.isArray(userIds) || userIds.length === 0) {
        res.status(400).json({ error: 'Pilih minimal satu warga untuk dimasukkan ke grup.' });
        return;
      }
      const updated = await addGroupMembers(room.id, userIds);
      res.json({ room: updated });
    })
  );

  app.delete(
    '/api/chat/groups/:roomId/members/:targetUserId',
    requireAuth,
    requireNotSuspended,
    wrapAsync(async (req, res) => {
      const room = await getChatRoomById(req.params.roomId);
      if (!room || room.type !== 'group') {
        res.status(404).json({ error: 'Grup obrolan tidak ditemukan.' });
        return;
      }
      const liveUser = await getStoredUserById(req.sessionUser!.userId);
      if (!liveUser) {
        res.status(401).json({ error: 'Akun tidak ditemukan.' });
        return;
      }
      const targetUserId = req.params.targetUserId;
      if (targetUserId === room.creatorId) {
        res.status(403).json({
          error: 'Creator grup bersifat permanen dan tidak dapat dikeluarkan dari grup.',
        });
        return;
      }

      const isSelfLeave = targetUserId === liveUser.id;
      const isCreator = room.creatorId === liveUser.id;
      const isCoCreator = Boolean(room.coCreatorIds?.includes(liveUser.id));
      const isPlatformMod = liveUser.role === 'admin' || liveUser.role === 'superadmin';
      const targetIsCoCreator = Boolean(room.coCreatorIds?.includes(targetUserId));

      if (!isSelfLeave) {
        if (!isCreator && !isCoCreator && !isPlatformMod) {
          res.status(403).json({
            error: 'Hanya Creator atau Co-Creator grup yang dapat mengeluarkan anggota.',
          });
          return;
        }
        if (room.isArchived) {
          res.status(403).json({
            error: 'Grup sedang diarsipkan (read-only). Daftar anggota terkunci.',
          });
          return;
        }
        if (targetIsCoCreator && !isCreator && !isPlatformMod) {
          res.status(403).json({
            error: 'Hanya Creator grup atau Admin yang dapat mengeluarkan Co-Creator lain.',
          });
          return;
        }
      }

      const updated = await removeGroupMember(room.id, targetUserId);
      res.json({ room: updated });
    })
  );

  app.patch(
    '/api/chat/groups/:roomId/co-creators',
    requireAuth,
    requireNotSuspended,
    wrapAsync(async (req, res) => {
      const room = await getChatRoomById(req.params.roomId);
      if (!room || room.type !== 'group') {
        res.status(404).json({ error: 'Grup obrolan tidak ditemukan.' });
        return;
      }
      const liveUser = await getStoredUserById(req.sessionUser!.userId);
      if (!liveUser) {
        res.status(401).json({ error: 'Akun tidak ditemukan.' });
        return;
      }
      const isCreator = room.creatorId === liveUser.id;
      const isPlatformMod = liveUser.role === 'admin' || liveUser.role === 'superadmin';
      if (!isCreator && !isPlatformMod) {
        res.status(403).json({
          error: 'Hanya Creator grup yang dapat mengangkat atau mencabut Co-Creator.',
        });
        return;
      }
      if (room.isArchived) {
        res.status(403).json({
          error: 'Grup sedang diarsipkan (read-only). Peran Co-Creator tidak dapat diubah.',
        });
        return;
      }
      const { userId, isCoCreator } = req.body as { userId?: string; isCoCreator?: boolean };
      if (!userId) {
        res.status(400).json({ error: 'ID warga wajib disertakan.' });
        return;
      }
      if (userId === room.creatorId) {
        res.status(400).json({
          error: 'Creator grup bersifat permanen (hardcoded) dan tidak bisa dipindahkan.',
        });
        return;
      }
      const updated = await setGroupCoCreator(room.id, userId, Boolean(isCoCreator));
      if (!updated) {
        res.status(404).json({ error: 'Warga tidak ditemukan.' });
        return;
      }
      res.json({ room: updated });
    })
  );

  app.patch(
    '/api/chat/groups/:roomId/archive',
    requireAuth,
    requireNotSuspended,
    wrapAsync(async (req, res) => {
      const room = await getChatRoomById(req.params.roomId);
      if (!room || room.type !== 'group') {
        res.status(404).json({ error: 'Grup obrolan tidak ditemukan.' });
        return;
      }
      const liveUser = await getStoredUserById(req.sessionUser!.userId);
      if (!liveUser) {
        res.status(401).json({ error: 'Akun tidak ditemukan.' });
        return;
      }
      const isCreator = room.creatorId === liveUser.id;
      const isPlatformMod = liveUser.role === 'admin' || liveUser.role === 'superadmin';
      if (!isCreator && !isPlatformMod) {
        res.status(403).json({
          error: 'Hanya Creator grup atau Admin yang dapat membekukan/mengarsipkan grup (Co-Creator tidak diizinkan).',
        });
        return;
      }
      const { archived } = req.body as { archived?: boolean };
      const updated = await setGroupArchived(room.id, Boolean(archived));
      res.json({ room: updated });
    })
  );

  app.delete(
    '/api/chat/groups/:roomId',
    requireAuth,
    requireNotSuspended,
    wrapAsync(async (req, res) => {
      const room = await getChatRoomById(req.params.roomId);
      if (!room || room.type !== 'group') {
        res.status(404).json({ error: 'Grup obrolan tidak ditemukan.' });
        return;
      }
      const liveUser = await getStoredUserById(req.sessionUser!.userId);
      if (!liveUser) {
        res.status(401).json({ error: 'Akun tidak ditemukan.' });
        return;
      }
      const isCreator = room.creatorId === liveUser.id;
      const isPlatformMod = liveUser.role === 'admin' || liveUser.role === 'superadmin';
      if (!isCreator && !isPlatformMod) {
        res.status(403).json({
          error: 'Hanya Creator grup atau Admin yang dapat menghapus grup (Co-Creator tidak diizinkan).',
        });
        return;
      }
      await deleteGroupRoom(room.id);
      res.json({ ok: true });
    })
  );

  app.get(
    '/api/chat/rooms/:roomId/messages',
    wrapAsync(async (req, res) => {
      const after = typeof req.query.after === 'string' ? req.query.after : undefined;
      const rooms = await listChatRooms(req.sessionUser?.userId);
      const room = rooms.find((r) => r.id === req.params.roomId);
      if (!room) {
        res.status(404).json({ error: 'Ruang obrolan tidak ditemukan atau bersifat privat.' });
        return;
      }
      const messages = await listChatMessages(
        req.params.roomId,
        after,
        req.sessionUser?.userId
      );
      res.json({ messages });
    })
  );

  app.post(
    '/api/chat/rooms/:roomId/messages',
    requireAuth,
    requireNotSuspended,
    wrapAsync(async (req, res) => {
      const { messageText } = req.body as { messageText?: string };
      if (!messageText || !messageText.trim()) {
        res.status(400).json({ error: 'Pesan tidak boleh kosong.' });
        return;
      }
      const rooms = await listChatRooms(req.sessionUser!.userId);
      const room = rooms.find((r) => r.id === req.params.roomId);
      if (!room) {
        res.status(404).json({
          error: 'Ruang obrolan tidak ditemukan atau Anda tidak memiliki akses.',
        });
        return;
      }
      if (room.isArchived) {
        res.status(403).json({
          error: 'Grup ini sedang dibekukan/diarsipkan (read-only). Tidak dapat mengirim pesan baru.',
        });
        return;
      }
      if (room.type === 'dm') {
        const otherId = room.participants?.find((id) => id !== req.sessionUser!.userId);
        if (otherId && (await isBlockedBetween(req.sessionUser!.userId, otherId))) {
          res.status(403).json({
            error: 'Tidak dapat mengirim DM karena salah satu pihak telah memblokir akun.',
          });
          return;
        }
      }
      const message = await createChatMessage(
        req.params.roomId,
        req.sessionUser!.userId,
        messageText
      );
      onChatEvent?.(req.params.roomId, { type: 'message:new', roomId: req.params.roomId, message });
      res.status(201).json({ message });
    })
  );

  app.delete(
    '/api/chat/messages/:messageId',
    requireAuth,
    wrapAsync(async (req, res) => {
      const msg = await getStoredChatMessageById(req.params.messageId);
      if (!msg) {
        res.status(404).json({ error: 'Pesan tidak ditemukan.' });
        return;
      }
      const liveUser = await getStoredUserById(req.sessionUser!.userId);
      if (!liveUser) {
        res.status(401).json({ error: 'Akun tidak ditemukan.' });
        return;
      }
      const room = await getChatRoomById(msg.roomId);
      const isAuthor = msg.senderId === liveUser.id;
      const isPlatformMod = liveUser.role === 'admin' || liveUser.role === 'superadmin';
      const isGroupMod =
        room?.type === 'group' &&
        (room.creatorId === liveUser.id || Boolean(room.coCreatorIds?.includes(liveUser.id)));

      if (!isAuthor && !isPlatformMod && !isGroupMod) {
        res.status(403).json({ error: 'Anda tidak memiliki izin untuk menghapus pesan ini.' });
        return;
      }

      const deletedRoomId = await deleteChatMessageById(msg.id);
      if (deletedRoomId) {
        onChatEvent?.(deletedRoomId, {
          type: 'message:deleted',
          roomId: deletedRoomId,
          messageId: msg.id,
        });
      }
      res.json({ ok: true });
    })
  );

  // Block / Unblock Citizens
  app.get(
    '/api/blocks',
    requireAuth,
    wrapAsync(async (req, res) => {
      const blocks = await listBlockedUsers(req.sessionUser!.userId);
      res.json({ blocks });
    })
  );

  app.post(
    '/api/blocks',
    requireAuth,
    wrapAsync(async (req, res) => {
      const { targetUserId } = req.body as { targetUserId?: string };
      if (!targetUserId || targetUserId === req.sessionUser!.userId) {
        res.status(400).json({ error: 'Pilih akun warga lain untuk diblokir.' });
        return;
      }
      const ok = await blockUser(req.sessionUser!.userId, targetUserId);
      if (!ok) {
        res.status(404).json({ error: 'Akun warga yang akan diblokir tidak ditemukan.' });
        return;
      }
      res.status(201).json({ ok: true });
    })
  );

  app.delete(
    '/api/blocks/:targetUserId',
    requireAuth,
    wrapAsync(async (req, res) => {
      await unblockUser(req.sessionUser!.userId, req.params.targetUserId);
      res.json({ ok: true });
    })
  );

  // Citizen Reports & Appeals
  app.post(
    '/api/reports',
    requireAuth,
    requireNotSuspended,
    wrapAsync(async (req, res) => {
      const { targetType, targetId, category, reason } = req.body as {
        targetType?: ReportTargetType;
        targetId?: string;
        category?: string;
        reason?: string;
      };
      if (!targetType || !['user', 'post', 'message'].includes(targetType) || !targetId) {
        res.status(400).json({ error: 'Tipe dan ID target laporan tidak valid.' });
        return;
      }
      if (!reason || reason.trim().length < 5) {
        res.status(400).json({ error: 'Alasan laporan minimal 5 karakter.' });
        return;
      }

      let targetUserId = '';
      let targetSnippet = '';

      if (targetType === 'user') {
        const targetUser = await getStoredUserById(targetId);
        if (!targetUser) {
          res.status(404).json({ error: 'Akun yang dilaporkan tidak ditemukan.' });
          return;
        }
        targetUserId = targetUser.id;
        targetSnippet = `Profil warga @${targetUser.username} (Role: ${targetUser.role})`;
      } else if (targetType === 'post') {
        const post = await getStoredPostById(targetId);
        if (!post) {
          res.status(404).json({ error: 'Postingan timeline tidak ditemukan.' });
          return;
        }
        targetUserId = post.authorId;
        targetSnippet = post.contentText || '[Postingan bergambar]';
      } else {
        const msg = await getStoredChatMessageById(targetId);
        if (!msg) {
          res.status(404).json({ error: 'Pesan obrolan tidak ditemukan.' });
          return;
        }
        targetUserId = msg.senderId;
        targetSnippet = msg.messageText;
      }

      if (targetUserId === req.sessionUser!.userId) {
        res.status(400).json({ error: 'Anda tidak dapat melaporkan akun atau konten Anda sendiri.' });
        return;
      }

      const report = await createReport({
        reporterId: req.sessionUser!.userId,
        targetType,
        targetId,
        targetUserId,
        targetSnippet,
        category: category || 'Pelanggaran Tata Tertib',
        reason,
      });
      res.status(201).json({ report });
    })
  );

  app.get(
    '/api/appeals/me',
    requireAuth,
    wrapAsync(async (req, res) => {
      const appeals = await listAppeals(req.sessionUser!.userId);
      res.json({ appeals });
    })
  );

  app.post(
    '/api/appeals',
    requireAuth,
    wrapAsync(async (req, res) => {
      const liveUser = await getStoredUserById(req.sessionUser!.userId);
      if (!liveUser) {
        res.status(401).json({ error: 'Akun tidak ditemukan.' });
        return;
      }
      if (liveUser.accountStatus !== 'suspended') {
        res.status(400).json({ error: 'Akun Anda aktif dan tidak sedang ditangguhkan.' });
        return;
      }
      const existing = await listAppeals(liveUser.id);
      const hasOpen = existing.some(
        (a) => a.stage !== 'accepted' && a.stage !== 'final_rejected'
      );
      if (hasOpen) {
        res.status(409).json({
          error: 'Anda sudah memiliki berkas banding yang sedang berjalan di Sidang Banding.',
        });
        return;
      }
      const { pledoiText } = req.body as { pledoiText?: string };
      if (!pledoiText || pledoiText.trim().length < 10) {
        res.status(400).json({ error: 'Isi Pledoi / pembelaan minimal 10 karakter.' });
        return;
      }
      const appeal = await createUserAppeal(liveUser.id, pledoiText);
      res.status(201).json({ appeal });
    })
  );

  app.post(
    '/api/appeals/:id/respond',
    requireAuth,
    wrapAsync(async (req, res) => {
      const appeal = await getAppealById(req.params.id);
      if (!appeal || appeal.userId !== req.sessionUser!.userId) {
        res.status(404).json({ error: 'Berkas banding tidak ditemukan.' });
        return;
      }
      const { responseText } = req.body as { responseText?: string };
      if (!responseText || responseText.trim().length < 5) {
        res.status(400).json({ error: 'Tanggapan banding minimal 5 karakter.' });
        return;
      }

      if (appeal.stage === 'replik') {
        const updated = await updateAppealRecord(appeal.id, {
          stage: 'duplik',
          duplikText: responseText.trim(),
        });
        res.json({ appeal: updated });
        return;
      }

      if (appeal.stage === 'rejected_for_kasasi') {
        const updated = await updateAppealRecord(appeal.id, {
          stage: 'kasasi',
          kasasiText: responseText.trim(),
        });
        res.json({ appeal: updated });
        return;
      }

      res.status(400).json({
        error: `Tahap sidang saat ini (${appeal.stage}) belum menunggu tanggapan dari warga.`,
      });
    })
  );

  // Hybrid Map Pins
  app.get(
    '/api/map/pins',
    wrapAsync(async (req, res) => {
      const mode =
        req.query.mode === 'real' || req.query.mode === 'fictional' ? req.query.mode : undefined;
      const pins = await listMapPins(mode);
      res.json({ pins });
    })
  );

  app.post(
    '/api/map/pins',
    requireAuth,
    requireNotSuspended,
    wrapAsync(async (req, res) => {
      const { title, description, gameTag, mode, lat, lng, realmId, realmX, realmY, placeUri } =
        req.body as {
          title?: string;
          description?: string;
          gameTag?: string;
          mode?: LocationType;
          lat?: number;
          lng?: number;
          realmId?: string;
          realmX?: number;
          realmY?: number;
          placeUri?: string;
        };

      if (!title || title.trim().length < 2) {
        res.status(400).json({ error: 'Nama lokasi pin wajib diisi.' });
        return;
      }
      const pinMode: LocationType = mode === 'fictional' ? 'fictional' : 'real';
      if (pinMode === 'real' && (typeof lat !== 'number' || typeof lng !== 'number')) {
        res.status(400).json({ error: 'Koordinat lat dan lng diperlukan untuk pin Peta Dunia Nyata.' });
        return;
      }

      const pin = await createMapPin({
        authorId: req.sessionUser!.userId,
        title,
        description: description || 'Titik komunitas Republik Jomokerto.',
        gameTag: gameTag || 'Komunitas',
        mode: pinMode,
        lat: pinMode === 'real' ? lat : undefined,
        lng: pinMode === 'real' ? lng : undefined,
        realmId: pinMode === 'fictional' ? realmId || 'ngawi-prime' : undefined,
        realmX: pinMode === 'fictional' ? realmX ?? 50 : undefined,
        realmY: pinMode === 'fictional' ? realmY ?? 50 : undefined,
        placeUri,
      });
      res.status(201).json({ pin });
    })
  );

  app.delete(
    '/api/map/pins/:id',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ok = await deleteMapPin(
        req.params.id,
        req.sessionUser!.userId,
        req.sessionUser!.role
      );
      if (!ok) {
        res.status(403).json({ error: 'Tidak dapat menghapus pin ini.' });
        return;
      }
      res.json({ ok: true });
    })
  );

  // Server-Side Gemini AI Routes
  app.post(
    '/api/ai/chat/stream',
    wrapAsync(async (req, res) => {
      const { history, message } = req.body as {
        history?: Array<{ role: 'user' | 'model'; text: string }>;
        message?: string;
      };
      if (!message || !message.trim()) {
        res.status(400).json({ error: 'Pertanyaan untuk Bupati AI tidak boleh kosong.' });
        return;
      }

      const citizen = req.sessionUser ? await getCitizenById(req.sessionUser.userId) : null;

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      let closed = false;
      res.on('close', () => {
        if (!res.writableEnded) {
          closed = true;
        }
      });

      const sendEvent = (payload: Record<string, unknown>) => {
        if (!closed && !res.writableEnded) {
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
        }
      };

      if (!closed && !res.writableEnded) {
        res.write(': connected\n\n');
      }
      const heartbeat = setInterval(() => {
        if (!closed && !res.writableEnded) {
          res.write(': ping\n\n');
        }
      }, 5000);

      try {
        let hasText = false;
        for await (const chunk of streamCivicAiChat(history || [], message.trim(), {
          username: citizen?.user.username,
          locationName: citizen?.ktp?.locationName,
          role: citizen?.user.role,
        })) {
          if (closed) break;
          hasText = true;
          sendEvent({ type: 'chunk', text: chunk });
        }
        if (!hasText && !closed) {
          sendEvent({
            type: 'chunk',
            text: 'Maaf warga, mikrofon balai desa sedang berdesis. Coba tanya lagi.',
          });
        }
        sendEvent({ type: 'done' });
      } catch (err) {
        const formatted = formatGeminiError(err);
        sendEvent({ type: 'error', status: formatted.status, error: formatted.message });
      } finally {
        clearInterval(heartbeat);
        if (!res.writableEnded) {
          res.end();
        }
      }
    })
  );

  app.post(
    '/api/ai/chat',
    wrapAsync(async (req, res) => {
      const { history, message } = req.body as {
        history?: Array<{ role: 'user' | 'model'; text: string }>;
        message?: string;
      };
      if (!message || !message.trim()) {
        res.status(400).json({ error: 'Pertanyaan untuk Bupati AI tidak boleh kosong.' });
        return;
      }
      const citizen = req.sessionUser ? await getCitizenById(req.sessionUser.userId) : null;
      try {
        const data = await runCivicAiChat(history || [], message.trim(), {
          username: citizen?.user.username,
          locationName: citizen?.ktp?.locationName,
          role: citizen?.user.role,
        });
        res.json(data);
      } catch (err) {
        const formatted = formatGeminiError(err);
        res.status(formatted.status).json({ error: formatted.message });
      }
    })
  );

  app.post(
    '/api/ai/maps-search',
    wrapAsync(async (req, res) => {
      const { query, lat, lng } = req.body as { query?: string; lat?: number; lng?: number };
      if (!query || !query.trim()) {
        res.status(400).json({ error: 'Masukkan nama tempat atau pertanyaan lokasi.' });
        return;
      }
      try {
        const coords =
          typeof lat === 'number' && typeof lng === 'number'
            ? { latitude: lat, longitude: lng }
            : { latitude: -7.4038, longitude: 111.4461 };
        const data = await runMapsGroundingSearch(query.trim(), coords);
        res.json(data);
      } catch (err) {
        const formatted = formatGeminiError(err);
        res.status(formatted.status).json({ error: formatted.message });
      }
    })
  );

  app.post(
    '/api/ai/generate-image',
    requireAuth,
    requireNotSuspended,
    wrapAsync(async (req, res) => {
      const { prompt, aspectRatio, quality } = req.body as {
        prompt?: string;
        aspectRatio?: string;
        quality?: AiImageQuality;
      };
      if (!prompt || prompt.trim().length < 3) {
        res.status(400).json({ error: 'Prompt gambar minimal 3 karakter.' });
        return;
      }
      const normalizedQuality: AiImageQuality =
        quality === 'studio' ? 'studio' : quality === 'standard' ? 'standard' : 'lite';
      try {
        const result = await generateAiImage({
          prompt: prompt.trim(),
          aspectRatio: aspectRatio || '1:1',
          quality: normalizedQuality,
        });
        res.json(result);
      } catch (err) {
        const formatted = formatGeminiError(err);
        res.status(formatted.status).json({ error: formatted.message });
      }
    })
  );

  // Admin & Superadmin RBAC & Moderation Routes
  app.get(
    '/api/admin/overview',
    requireRole('admin', 'superadmin'),
    wrapAsync(async (_req, res) => {
      const [dbDriver, citizens, posts, pins, reports, appeals] = await Promise.all([
        getDbDriver(),
        listCitizens(),
        listPosts(),
        listMapPins(),
        listReports(),
        listAppeals(),
      ]);
      res.json({
        dbDriver,
        citizens,
        postsCount: posts.length,
        pinsCount: pins.length,
        pendingReportsCount: reports.filter((r) => r.status === 'pending').length,
        openAppealsCount: appeals.filter(
          (a) => a.stage !== 'accepted' && a.stage !== 'final_rejected'
        ).length,
      });
    })
  );

  app.patch(
    '/api/admin/users/:userId/role',
    requireRole('superadmin'),
    wrapAsync(async (req, res) => {
      const { role } = req.body as { role?: UserRole };
      if (!role || !['superadmin', 'admin', 'member', 'guest'].includes(role)) {
        res.status(400).json({ error: 'Role tidak valid.' });
        return;
      }
      const target = await getStoredUserById(req.params.userId);
      if (!target) {
        res.status(404).json({ error: 'Warga tidak ditemukan.' });
        return;
      }
      const updated = await updateUserRole(req.params.userId, role);
      res.json({ user: updated });
    })
  );

  app.patch(
    '/api/admin/users/:userId/status',
    requireRole('admin', 'superadmin'),
    wrapAsync(async (req, res) => {
      const { accountStatus, reason } = req.body as {
        accountStatus?: AccountStatus;
        reason?: string;
      };
      if (!accountStatus || !['active', 'suspended'].includes(accountStatus)) {
        res.status(400).json({ error: 'Status akun harus active atau suspended.' });
        return;
      }
      const target = await getStoredUserById(req.params.userId);
      if (!target) {
        res.status(404).json({ error: 'Warga tidak ditemukan.' });
        return;
      }
      if (target.id === req.sessionUser!.userId) {
        res.status(400).json({ error: 'Anda tidak dapat menangguhkan akun Anda sendiri.' });
        return;
      }
      if (target.role === 'superadmin' && req.sessionUser!.role !== 'superadmin') {
        res.status(403).json({ error: 'Admin tidak berwenang menangguhkan akun Superadmin.' });
        return;
      }
      const updated = await setUserAccountStatus(target.id, accountStatus, reason);
      res.json({ user: updated });
    })
  );

  app.patch(
    '/api/admin/ktp/:userId/verify',
    requireRole('admin', 'superadmin'),
    wrapAsync(async (req, res) => {
      const { verified } = req.body as { verified?: boolean };
      const ktp = await verifyKtpProfile(req.params.userId, Boolean(verified));
      if (!ktp) {
        res.status(404).json({ error: 'KTP warga belum dicetak.' });
        return;
      }
      res.json({ ktp });
    })
  );

  app.get(
    '/api/admin/reports',
    requireRole('admin', 'superadmin'),
    wrapAsync(async (_req, res) => {
      const reports = await listReports();
      res.json({ reports });
    })
  );

  app.patch(
    '/api/admin/reports/:id',
    requireRole('admin', 'superadmin'),
    wrapAsync(async (req, res) => {
      const report = await getReportById(req.params.id);
      if (!report) {
        res.status(404).json({ error: 'Laporan tidak ditemukan.' });
        return;
      }

      const { action, resolutionNote, suspendReason } = req.body as {
        action?: 'resolve' | 'dismiss' | 'delete_content' | 'suspend_user' | 'delete_and_suspend';
        resolutionNote?: string;
        suspendReason?: string;
      };

      const act = action || 'resolve';
      const reviewer = `@${req.sessionUser!.username}`;

      if (act === 'delete_content' || act === 'delete_and_suspend') {
        if (report.targetType === 'post') {
          await deletePost(report.targetId, req.sessionUser!.userId, req.sessionUser!.role);
        } else if (report.targetType === 'message') {
          const roomId = await deleteChatMessageById(report.targetId);
          if (roomId) {
            onChatEvent?.(roomId, {
              type: 'message:deleted',
              roomId,
              messageId: report.targetId,
            });
          }
        }
      }

      if (act === 'suspend_user' || act === 'delete_and_suspend') {
        const target = await getStoredUserById(report.targetUserId);
        if (target && target.id !== req.sessionUser!.userId) {
          if (target.role !== 'superadmin' || req.sessionUser!.role === 'superadmin') {
            await setUserAccountStatus(
              target.id,
              'suspended',
              suspendReason?.trim() || `Ditindak berdasarkan laporan: ${report.category}`
            );
          }
        }
      }

      const status = act === 'dismiss' ? 'dismissed' : 'resolved';
      const defaultNote =
        act === 'dismiss'
          ? 'Laporan ditinjau dan dinyatakan aman.'
          : act === 'delete_content'
            ? 'Konten terlapor telah dihapus oleh moderator.'
            : act === 'suspend_user'
              ? 'Akun terlapor ditangguhkan oleh moderator.'
              : act === 'delete_and_suspend'
                ? 'Konten dihapus & akun terlapor ditangguhkan.'
                : 'Laporan ditandai selesai.';

      const updated = await updateReportStatus(
        report.id,
        status,
        reviewer,
        resolutionNote?.trim() || defaultNote
      );
      res.json({ report: updated });
    })
  );

  app.get(
    '/api/admin/appeals',
    requireRole('admin', 'superadmin'),
    wrapAsync(async (_req, res) => {
      const appeals = await listAppeals();
      res.json({ appeals });
    })
  );

  app.patch(
    '/api/admin/appeals/:id',
    requireRole('admin', 'superadmin'),
    wrapAsync(async (req, res) => {
      const appeal = await getAppealById(req.params.id);
      if (!appeal) {
        res.status(404).json({ error: 'Berkas banding tidak ditemukan.' });
        return;
      }

      const { action, text } = req.body as {
        action?: 'accept' | 'replik' | 'reject_to_kasasi' | 'final_reject';
        text?: string;
      };
      const reviewer = `@${req.sessionUser!.username}`;

      if (action === 'accept') {
        await setUserAccountStatus(appeal.userId, 'active');
        const updated = await updateAppealRecord(appeal.id, {
          stage: 'accepted',
          adminVerdictNote:
            text?.trim() || 'Banding dikabulkan. Hak akses warga Republik Jomokerto dipulihkan.',
          reviewedBy: reviewer,
        });
        res.json({ appeal: updated });
        return;
      }

      if (action === 'replik') {
        if (appeal.stage !== 'pledoi') {
          res.status(400).json({
            error: 'Replik hanya dapat diajukan sebagai jawaban atas Pledoi warga.',
          });
          return;
        }
        if (!text || text.trim().length < 5) {
          res.status(400).json({ error: 'Isi Replik moderator minimal 5 karakter.' });
          return;
        }
        const updated = await updateAppealRecord(appeal.id, {
          stage: 'replik',
          replikText: text.trim(),
          reviewedBy: reviewer,
        });
        res.json({ appeal: updated });
        return;
      }

      if (action === 'reject_to_kasasi') {
        if (appeal.stage !== 'pledoi' && appeal.stage !== 'duplik') {
          res.status(400).json({
            error: 'Putusan tingkat pertama (buka Kasasi) hanya dari tahap Pledoi atau Duplik.',
          });
          return;
        }
        const updated = await updateAppealRecord(appeal.id, {
          stage: 'rejected_for_kasasi',
          adminVerdictNote:
            text?.trim() ||
            'Banding Tingkat Pertama ditolak. Warga dipersilakan mengajukan Memori Kasasi.',
          reviewedBy: reviewer,
        });
        res.json({ appeal: updated });
        return;
      }

      if (action === 'final_reject') {
        if (appeal.stage !== 'kasasi') {
          res.status(400).json({
            error: 'Putusan akhir (inkrah) hanya dapat dijatuhkan setelah warga mengajukan Kasasi.',
          });
          return;
        }
        const updated = await updateAppealRecord(appeal.id, {
          stage: 'final_rejected',
          adminVerdictNote:
            text?.trim() || 'Kasasi ditolak (Putusan Inkrah). Penangguhan akun tetap berlaku.',
          reviewedBy: reviewer,
        });
        res.json({ appeal: updated });
        return;
      }

      res.status(400).json({ error: 'Aksi putusan banding tidak valid.' });
    })
  );

  app.get(
    '/api/admin/export-db',
    requireRole('admin', 'superadmin'),
    wrapAsync(async (_req, res) => {
      const snapshot = await exportDatabaseSnapshot();
      res.setHeader('Content-Disposition', 'attachment; filename="jomokerto-export.db.json"');
      res.json(snapshot);
    })
  );

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error('Server error:', err);
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan pada server.';
      res.status(500).json({ error: message });
    }
  );

  return app;
}
