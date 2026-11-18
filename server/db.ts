import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import {
  DEFAULT_AVATAR_URL,
  type AccountStatus,
  type AppealStage,
  type BlockedUserEntry,
  type ChatMessage,
  type ChatRoom,
  type CitizenRecord,
  type ContentReport,
  type KtpProfile,
  type LocationType,
  type MapPinItem,
  type ModerationAppeal,
  type PublicUser,
  type ReportStatus,
  type ReportTargetType,
  type SocialLinks,
  type TimelinePost,
  type UserRole,
} from '../src/shared/types.ts';
import { hashPassword } from './auth.ts';

export type DbDriverType = 'postgres' | 'sqlite' | 'vercel-json';

export interface StoredUser extends PublicUser {
  passwordHash: string;
  googleId?: string | null;
}

interface StoredPost {
  id: string;
  authorId: string;
  contentText: string;
  imageUrl: string | null;
  imageMimeType: string | null;
  locationTag: string;
  likesCount: number;
  createdAt: string;
}

interface StoredMessage {
  id: string;
  roomId: string;
  senderId: string;
  messageText: string;
  createdAt: string;
}

interface StoredReset {
  token: string;
  userId: string;
  expiresAt: string;
}

interface StoredBlock {
  blockerId: string;
  blockedId: string;
  createdAt: string;
}

interface StoredReport {
  id: string;
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  targetUserId: string;
  targetSnippet: string;
  category: string;
  reason: string;
  status: ReportStatus;
  resolutionNote?: string | null;
  reviewedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StoredAppeal {
  id: string;
  userId: string;
  stage: AppealStage;
  pledoiText: string;
  replikText?: string | null;
  duplikText?: string | null;
  kasasiText?: string | null;
  adminVerdictNote?: string | null;
  reviewedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface JsonDbSnapshot {
  meta: {
    version: string;
    republic: string;
    defaultLocation: string;
  };
  users: StoredUser[];
  profiles_ktp: KtpProfile[];
  posts: StoredPost[];
  post_likes: Array<{ postId: string; userId: string }>;
  chat_rooms: ChatRoom[];
  chat_messages: StoredMessage[];
  map_pins: MapPinItem[];
  password_resets: StoredReset[];
  user_blocks?: StoredBlock[];
  reports?: StoredReport[];
  moderation_appeals?: StoredAppeal[];
}

type SqliteDatabase = import('better-sqlite3').Database;

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(process.cwd(), 'data');
const SQLITE_PATH = path.join(DATA_DIR, 'jomokerto.db');
const VERCEL_TMP_JSON_PATH = path.join('/tmp', 'jomokerto.db.json');

let pgPool: Pool | null = null;
let sqliteDb: SqliteDatabase | null = null;
let jsonStore: JsonDbSnapshot | null = null;
let activeDriver: DbDriverType = 'sqlite';
let initPromise: Promise<void> | null = null;

function resolveSeedPath(): string {
  const candidates = [
    path.join(DATA_DIR, 'jomokerto-seed.db.json'),
    path.resolve(CURRENT_DIR, '../data/jomokerto-seed.db.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function getPostgresConnectionString(): string | null {
  if (process.env.DB_DRIVER === 'sqlite' || process.env.DB_DRIVER === 'json') {
    return null;
  }
  const candidates = [
    process.env.DATABASE_URL_POOLED,
    process.env.POSTGRES_URL,
    process.env.DATABASE_URL,
    process.env.PRISMA_DATABASE_URL,
  ];
  for (const val of candidates) {
    if (val && (val.startsWith('postgres://') || val.startsWith('postgresql://'))) {
      return val;
    }
  }
  return null;
}

function normalizeJsonStore(snapshot: JsonDbSnapshot): JsonDbSnapshot {
  return {
    ...snapshot,
    users: (snapshot.users || []).map((u) => ({
      ...u,
      accountStatus: u.accountStatus || 'active',
    })),
    chat_rooms: (snapshot.chat_rooms || []).map((r) => ({
      ...r,
      coCreatorIds: r.coCreatorIds || [],
      isArchived: Boolean(r.isArchived),
    })),
    user_blocks: snapshot.user_blocks || [],
    reports: snapshot.reports || [],
    moderation_appeals: snapshot.moderation_appeals || [],
  };
}

function loadSeedData(): JsonDbSnapshot {
  const seedPath = resolveSeedPath();
  const raw = fs.readFileSync(seedPath, 'utf8');
  const parsed = JSON.parse(raw) as JsonDbSnapshot;
  const demoHash = hashPassword('password123');
  parsed.users = parsed.users.map((u) => ({
    ...u,
    accountStatus: u.accountStatus || 'active',
    passwordHash: u.passwordHash.startsWith('4e1d0b22a1b4f512:') ? demoHash : u.passwordHash,
  }));
  return normalizeJsonStore(parsed);
}

function saveJsonStore(): void {
  if (!jsonStore) return;
  try {
    const targetPath =
      process.env.VERCEL === '1' || process.env.VERCEL_ENV
        ? VERCEL_TMP_JSON_PATH
        : path.join(DATA_DIR, 'jomokerto.db.json');
    fs.writeFileSync(targetPath, JSON.stringify(jsonStore, null, 2), 'utf8');
  } catch {
    // Keep in-memory state if disk is strictly read-only
  }
}

function parseJsonStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function initPostgres(connectionString: string): Promise<void> {
  const isLocalPg =
    connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

  const pool = new Pool({
    connectionString,
    max: 5,
    ssl: isLocalPg ? false : { rejectUnauthorized: false },
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT,
      password_hash TEXT NOT NULL,
      google_id TEXT,
      role TEXT NOT NULL,
      avatar_url TEXT NOT NULL,
      google_linked BOOLEAN NOT NULL DEFAULT FALSE,
      account_status TEXT NOT NULL DEFAULT 'active',
      suspended_reason TEXT,
      created_at TEXT NOT NULL
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

    CREATE TABLE IF NOT EXISTS profiles_ktp (
      user_id TEXT PRIMARY KEY,
      ktp_serial TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      title TEXT NOT NULL,
      location_type TEXT NOT NULL,
      location_name TEXT NOT NULL,
      faction TEXT NOT NULL,
      motto TEXT NOT NULL,
      blood_group TEXT NOT NULL,
      social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
      verified_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
      issued_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL,
      content_text TEXT NOT NULL,
      image_url TEXT,
      image_mime_type TEXT,
      location_tag TEXT NOT NULL,
      likes_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS post_likes (
      post_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (post_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS chat_rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      type TEXT NOT NULL,
      realm_tag TEXT NOT NULL,
      participants JSONB NOT NULL DEFAULT '[]'::jsonb,
      creator_id TEXT,
      co_creator_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_archived BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TEXT NOT NULL
    );

    ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS creator_id TEXT;
    ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS co_creator_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      message_text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS map_pins (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      game_tag TEXT NOT NULL,
      mode TEXT NOT NULL,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      realm_id TEXT,
      realm_x DOUBLE PRECISION,
      realm_y DOUBLE PRECISION,
      place_uri TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_blocks (
      blocker_id TEXT NOT NULL,
      blocked_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (blocker_id, blocked_id)
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      target_user_id TEXT NOT NULL,
      target_snippet TEXT NOT NULL,
      category TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      resolution_note TEXT,
      reviewed_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS moderation_appeals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      pledoi_text TEXT NOT NULL,
      replik_text TEXT,
      duplik_text TEXT,
      kasasi_text TEXT,
      admin_verdict_note TEXT,
      reviewed_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const countRes = await pool.query<{ c: string }>('SELECT COUNT(*)::text AS c FROM users');
  if (Number(countRes.rows[0]?.c || 0) === 0) {
    const seed = loadSeedData();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const u of seed.users) {
        await client.query(
          `INSERT INTO users (id, username, email, password_hash, google_id, role, avatar_url, google_linked, account_status, suspended_reason, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO NOTHING`,
          [
            u.id,
            u.username,
            u.email ?? null,
            u.passwordHash,
            u.googleId ?? null,
            u.role,
            u.avatarUrl || DEFAULT_AVATAR_URL,
            Boolean(u.googleLinked),
            u.accountStatus || 'active',
            u.suspendedReason ?? null,
            u.createdAt,
          ]
        );
      }
      for (const k of seed.profiles_ktp) {
        await client.query(
          `INSERT INTO profiles_ktp (user_id, ktp_serial, full_name, title, location_type, location_name, faction, motto, blood_group, social_links, verified_by_admin, issued_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
           ON CONFLICT (user_id) DO NOTHING`,
          [
            k.userId,
            k.ktpSerial,
            k.fullName,
            k.title,
            k.locationType,
            k.locationName,
            k.faction,
            k.motto,
            k.bloodGroup,
            JSON.stringify(k.socialLinks || {}),
            Boolean(k.verifiedByAdmin),
            k.issuedAt,
          ]
        );
      }
      for (const p of seed.posts) {
        await client.query(
          `INSERT INTO posts (id, author_id, content_text, image_url, image_mime_type, location_tag, likes_count, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO NOTHING`,
          [
            p.id,
            p.authorId,
            p.contentText,
            p.imageUrl ?? null,
            p.imageMimeType ?? null,
            p.locationTag,
            p.likesCount,
            p.createdAt,
          ]
        );
      }
      for (const r of seed.chat_rooms) {
        await client.query(
          `INSERT INTO chat_rooms (id, name, description, type, realm_tag, participants, creator_id, co_creator_ids, is_archived, created_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9, $10)
           ON CONFLICT (id) DO NOTHING`,
          [
            r.id,
            r.name,
            r.description,
            r.type,
            r.realmTag,
            JSON.stringify(r.participants || []),
            r.creatorId ?? null,
            JSON.stringify(r.coCreatorIds || []),
            Boolean(r.isArchived),
            r.createdAt,
          ]
        );
      }
      for (const m of seed.chat_messages) {
        await client.query(
          `INSERT INTO chat_messages (id, room_id, sender_id, message_text, created_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO NOTHING`,
          [m.id, m.roomId, m.senderId, m.messageText, m.createdAt]
        );
      }
      for (const pin of seed.map_pins) {
        await client.query(
          `INSERT INTO map_pins (id, author_id, title, description, game_tag, mode, lat, lng, realm_id, realm_x, realm_y, place_uri, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (id) DO NOTHING`,
          [
            pin.id,
            pin.authorId,
            pin.title,
            pin.description,
            pin.gameTag,
            pin.mode,
            pin.lat ?? null,
            pin.lng ?? null,
            pin.realmId ?? null,
            pin.realmX ?? null,
            pin.realmY ?? null,
            pin.placeUri ?? null,
            pin.createdAt,
          ]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  pgPool = pool;
  activeDriver = 'postgres';
}

function ensureSqliteColumn(
  db: SqliteDatabase,
  table: string,
  columnName: string,
  columnDefinition: string
): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === columnName)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnName} ${columnDefinition}`);
  }
}

async function initSqlite(): Promise<boolean> {
  try {
    const { default: Database } = await import('better-sqlite3');
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const db = new Database(SQLITE_PATH);
    db.pragma('journal_mode = DELETE');
    db.pragma('synchronous = FULL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        passwordHash TEXT NOT NULL,
        googleId TEXT,
        role TEXT NOT NULL,
        avatarUrl TEXT NOT NULL,
        googleLinked INTEGER NOT NULL DEFAULT 0,
        accountStatus TEXT NOT NULL DEFAULT 'active',
        suspendedReason TEXT,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS profiles_ktp (
        userId TEXT PRIMARY KEY,
        ktpSerial TEXT UNIQUE NOT NULL,
        fullName TEXT NOT NULL,
        title TEXT NOT NULL,
        locationType TEXT NOT NULL,
        locationName TEXT NOT NULL,
        faction TEXT NOT NULL,
        motto TEXT NOT NULL,
        bloodGroup TEXT NOT NULL,
        socialLinks TEXT NOT NULL,
        verifiedByAdmin INTEGER NOT NULL DEFAULT 0,
        issuedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        authorId TEXT NOT NULL,
        contentText TEXT NOT NULL,
        imageUrl TEXT,
        imageMimeType TEXT,
        locationTag TEXT NOT NULL,
        likesCount INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS post_likes (
        postId TEXT NOT NULL,
        userId TEXT NOT NULL,
        PRIMARY KEY (postId, userId)
      );

      CREATE TABLE IF NOT EXISTS chat_rooms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        type TEXT NOT NULL,
        realmTag TEXT NOT NULL,
        participants TEXT NOT NULL,
        creatorId TEXT,
        coCreatorIds TEXT NOT NULL DEFAULT '[]',
        isArchived INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        roomId TEXT NOT NULL,
        senderId TEXT NOT NULL,
        messageText TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS map_pins (
        id TEXT PRIMARY KEY,
        authorId TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        gameTag TEXT NOT NULL,
        mode TEXT NOT NULL,
        lat REAL,
        lng REAL,
        realmId TEXT,
        realmX REAL,
        realmY REAL,
        placeUri TEXT,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS password_resets (
        token TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        expiresAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_blocks (
        blockerId TEXT NOT NULL,
        blockedId TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        PRIMARY KEY (blockerId, blockedId)
      );

      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        reporterId TEXT NOT NULL,
        targetType TEXT NOT NULL,
        targetId TEXT NOT NULL,
        targetUserId TEXT NOT NULL,
        targetSnippet TEXT NOT NULL,
        category TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        resolutionNote TEXT,
        reviewedBy TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS moderation_appeals (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        stage TEXT NOT NULL,
        pledoiText TEXT NOT NULL,
        replikText TEXT,
        duplikText TEXT,
        kasasiText TEXT,
        adminVerdictNote TEXT,
        reviewedBy TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);

    ensureSqliteColumn(db, 'users', 'accountStatus', "TEXT NOT NULL DEFAULT 'active'");
    ensureSqliteColumn(db, 'users', 'suspendedReason', 'TEXT');
    ensureSqliteColumn(db, 'chat_rooms', 'creatorId', 'TEXT');
    ensureSqliteColumn(db, 'chat_rooms', 'coCreatorIds', "TEXT NOT NULL DEFAULT '[]'");
    ensureSqliteColumn(db, 'chat_rooms', 'isArchived', 'INTEGER NOT NULL DEFAULT 0');

    const countRow = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
    if (countRow.c === 0) {
      const seed = loadSeedData();
      const insertUser = db.prepare(`
        INSERT OR IGNORE INTO users (id, username, email, passwordHash, googleId, role, avatarUrl, googleLinked, accountStatus, suspendedReason, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertKtp = db.prepare(`
        INSERT OR IGNORE INTO profiles_ktp (userId, ktpSerial, fullName, title, locationType, locationName, faction, motto, bloodGroup, socialLinks, verifiedByAdmin, issuedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertPost = db.prepare(`
        INSERT OR IGNORE INTO posts (id, authorId, contentText, imageUrl, imageMimeType, locationTag, likesCount, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertRoom = db.prepare(`
        INSERT OR IGNORE INTO chat_rooms (id, name, description, type, realmTag, participants, creatorId, coCreatorIds, isArchived, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertMsg = db.prepare(`
        INSERT OR IGNORE INTO chat_messages (id, roomId, senderId, messageText, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `);
      const insertPin = db.prepare(`
        INSERT OR IGNORE INTO map_pins (id, authorId, title, description, gameTag, mode, lat, lng, realmId, realmX, realmY, placeUri, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const tx = db.transaction(() => {
        for (const u of seed.users) {
          insertUser.run(
            u.id,
            u.username,
            u.email ?? null,
            u.passwordHash,
            u.googleId ?? null,
            u.role,
            u.avatarUrl || DEFAULT_AVATAR_URL,
            u.googleLinked ? 1 : 0,
            u.accountStatus || 'active',
            u.suspendedReason ?? null,
            u.createdAt
          );
        }
        for (const k of seed.profiles_ktp) {
          insertKtp.run(
            k.userId,
            k.ktpSerial,
            k.fullName,
            k.title,
            k.locationType,
            k.locationName,
            k.faction,
            k.motto,
            k.bloodGroup,
            JSON.stringify(k.socialLinks || {}),
            k.verifiedByAdmin ? 1 : 0,
            k.issuedAt
          );
        }
        for (const p of seed.posts) {
          insertPost.run(
            p.id,
            p.authorId,
            p.contentText,
            p.imageUrl ?? null,
            p.imageMimeType ?? null,
            p.locationTag,
            p.likesCount,
            p.createdAt
          );
        }
        for (const r of seed.chat_rooms) {
          insertRoom.run(
            r.id,
            r.name,
            r.description,
            r.type,
            r.realmTag,
            JSON.stringify(r.participants || []),
            r.creatorId ?? null,
            JSON.stringify(r.coCreatorIds || []),
            r.isArchived ? 1 : 0,
            r.createdAt
          );
        }
        for (const m of seed.chat_messages) {
          insertMsg.run(m.id, m.roomId, m.senderId, m.messageText, m.createdAt);
        }
        for (const pin of seed.map_pins) {
          insertPin.run(
            pin.id,
            pin.authorId,
            pin.title,
            pin.description,
            pin.gameTag,
            pin.mode,
            pin.lat ?? null,
            pin.lng ?? null,
            pin.realmId ?? null,
            pin.realmX ?? null,
            pin.realmY ?? null,
            pin.placeUri ?? null,
            pin.createdAt
          );
        }
      });
      tx();
    }

    sqliteDb = db;
    activeDriver = 'sqlite';
    return true;
  } catch {
    return false;
  }
}

async function initDatabase(): Promise<void> {
  if (pgPool || sqliteDb || jsonStore) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const pgUrl = getPostgresConnectionString();
    if (pgUrl) {
      await initPostgres(pgUrl);
      return;
    }

    const isVercel = Boolean(process.env.VERCEL === '1' || process.env.VERCEL_ENV);
    const forceJson = process.env.DB_DRIVER === 'json' || isVercel;

    if (!forceJson) {
      const sqliteReady = await initSqlite();
      if (sqliteReady) return;
    }

    activeDriver = 'vercel-json';
    const existingJsonPath = isVercel
      ? VERCEL_TMP_JSON_PATH
      : path.join(DATA_DIR, 'jomokerto.db.json');
    if (fs.existsSync(existingJsonPath)) {
      try {
        jsonStore = normalizeJsonStore(
          JSON.parse(fs.readFileSync(existingJsonPath, 'utf8')) as JsonDbSnapshot
        );
        return;
      } catch {
        // Re-seed below if unreadable
      }
    }
    jsonStore = loadSeedData();
    saveJsonStore();
  })();

  try {
    await initPromise;
  } catch (err) {
    initPromise = null;
    throw err;
  }
}

export async function getDbDriver(): Promise<DbDriverType> {
  await initDatabase();
  return activeDriver;
}

function toPublicUser(u: StoredUser): PublicUser {
  return {
    id: u.id,
    username: u.username,
    email: u.email ?? undefined,
    role: u.role,
    avatarUrl: u.avatarUrl || DEFAULT_AVATAR_URL,
    googleLinked: Boolean(u.googleLinked),
    accountStatus: u.accountStatus || 'active',
    suspendedReason: u.suspendedReason || undefined,
    createdAt: u.createdAt,
  };
}

function mapPgUser(row: Record<string, unknown>): StoredUser {
  return {
    id: String(row.id),
    username: String(row.username),
    email: row.email ? String(row.email) : undefined,
    passwordHash: String(row.password_hash),
    googleId: row.google_id ? String(row.google_id) : null,
    role: String(row.role) as UserRole,
    avatarUrl: String(row.avatar_url || DEFAULT_AVATAR_URL),
    googleLinked: Boolean(row.google_linked),
    accountStatus: (row.account_status ? String(row.account_status) : 'active') as AccountStatus,
    suspendedReason: row.suspended_reason ? String(row.suspended_reason) : undefined,
    createdAt: String(row.created_at),
  };
}

function mapPgKtp(row: Record<string, unknown>): KtpProfile {
  let socialLinks: SocialLinks = {};
  if (typeof row.social_links === 'string') {
    try {
      socialLinks = JSON.parse(row.social_links) as SocialLinks;
    } catch {
      socialLinks = {};
    }
  } else if (row.social_links && typeof row.social_links === 'object') {
    socialLinks = row.social_links as SocialLinks;
  }
  return {
    userId: String(row.user_id),
    ktpSerial: String(row.ktp_serial),
    fullName: String(row.full_name),
    title: String(row.title),
    locationType: String(row.location_type) as LocationType,
    locationName: String(row.location_name),
    faction: String(row.faction),
    motto: String(row.motto),
    bloodGroup: String(row.blood_group),
    socialLinks,
    verifiedByAdmin: Boolean(row.verified_by_admin),
    issuedAt: String(row.issued_at),
  };
}

function mapSqliteUser(row: Record<string, unknown>): StoredUser {
  return {
    id: String(row.id),
    username: String(row.username),
    email: row.email ? String(row.email) : undefined,
    passwordHash: String(row.passwordHash),
    googleId: row.googleId ? String(row.googleId) : null,
    role: String(row.role) as UserRole,
    avatarUrl: String(row.avatarUrl || DEFAULT_AVATAR_URL),
    googleLinked: Boolean(row.googleLinked),
    accountStatus: (row.accountStatus ? String(row.accountStatus) : 'active') as AccountStatus,
    suspendedReason: row.suspendedReason ? String(row.suspendedReason) : undefined,
    createdAt: String(row.createdAt),
  };
}

function mapSqliteKtp(row: Record<string, unknown>): KtpProfile {
  let socialLinks: SocialLinks = {};
  try {
    socialLinks = JSON.parse(String(row.socialLinks || '{}')) as SocialLinks;
  } catch {
    socialLinks = {};
  }
  return {
    userId: String(row.userId),
    ktpSerial: String(row.ktpSerial),
    fullName: String(row.fullName),
    title: String(row.title),
    locationType: String(row.locationType) as LocationType,
    locationName: String(row.locationName),
    faction: String(row.faction),
    motto: String(row.motto),
    bloodGroup: String(row.bloodGroup),
    socialLinks,
    verifiedByAdmin: Boolean(row.verifiedByAdmin),
    issuedAt: String(row.issuedAt),
  };
}

function mapPgRoom(r: Record<string, unknown>): ChatRoom {
  return {
    id: String(r.id),
    name: String(r.name),
    description: String(r.description),
    type: String(r.type) as ChatRoom['type'],
    realmTag: String(r.realm_tag),
    participants: parseJsonStringArray(r.participants),
    creatorId: r.creator_id ? String(r.creator_id) : undefined,
    coCreatorIds: parseJsonStringArray(r.co_creator_ids),
    isArchived: Boolean(r.is_archived),
    createdAt: String(r.created_at),
  };
}

function mapSqliteRoom(r: Record<string, unknown>): ChatRoom {
  return {
    id: String(r.id),
    name: String(r.name),
    description: String(r.description),
    type: String(r.type) as ChatRoom['type'],
    realmTag: String(r.realmTag),
    participants: parseJsonStringArray(r.participants),
    creatorId: r.creatorId ? String(r.creatorId) : undefined,
    coCreatorIds: parseJsonStringArray(r.coCreatorIds),
    isArchived: Boolean(r.isArchived),
    createdAt: String(r.createdAt),
  };
}

export async function getStoredUserById(id: string): Promise<StoredUser | null> {
  await initDatabase();
  if (pgPool) {
    const res = await pgPool.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0] ? mapPgUser(res.rows[0]) : null;
  }
  if (sqliteDb) {
    const row = sqliteDb.prepare('SELECT * FROM users WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? mapSqliteUser(row) : null;
  }
  return jsonStore!.users.find((u) => u.id === id) ?? null;
}

export async function getStoredUserByLogin(identifier: string): Promise<StoredUser | null> {
  await initDatabase();
  const norm = identifier.trim().toLowerCase();
  if (pgPool) {
    const res = await pgPool.query(
      'SELECT * FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $1',
      [norm]
    );
    return res.rows[0] ? mapPgUser(res.rows[0]) : null;
  }
  if (sqliteDb) {
    const row = sqliteDb
      .prepare('SELECT * FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?')
      .get(norm, norm) as Record<string, unknown> | undefined;
    return row ? mapSqliteUser(row) : null;
  }
  return (
    jsonStore!.users.find(
      (u) => u.username.toLowerCase() === norm || (u.email && u.email.toLowerCase() === norm)
    ) ?? null
  );
}

export async function getStoredUserByGoogle(
  googleId: string,
  email?: string
): Promise<StoredUser | null> {
  await initDatabase();
  if (pgPool) {
    const byId = await pgPool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
    if (byId.rows[0]) return mapPgUser(byId.rows[0]);
    if (email) {
      const byEmail = await pgPool.query('SELECT * FROM users WHERE LOWER(email) = $1', [
        email.toLowerCase(),
      ]);
      if (byEmail.rows[0]) return mapPgUser(byEmail.rows[0]);
    }
    return null;
  }
  if (sqliteDb) {
    const byId = sqliteDb.prepare('SELECT * FROM users WHERE googleId = ?').get(googleId) as
      | Record<string, unknown>
      | undefined;
    if (byId) return mapSqliteUser(byId);
    if (email) {
      const byEmail = sqliteDb
        .prepare('SELECT * FROM users WHERE LOWER(email) = ?')
        .get(email.toLowerCase()) as Record<string, unknown> | undefined;
      if (byEmail) return mapSqliteUser(byEmail);
    }
    return null;
  }
  const byId = jsonStore!.users.find((u) => u.googleId === googleId);
  if (byId) return byId;
  if (email) {
    return jsonStore!.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
  }
  return null;
}

export async function createUser(input: {
  username: string;
  email?: string;
  passwordHash: string;
  avatarUrl?: string;
  googleId?: string;
  googleLinked?: boolean;
  role?: UserRole;
}): Promise<PublicUser> {
  await initDatabase();
  const user: StoredUser = {
    id: `usr-${crypto.randomUUID().slice(0, 8)}`,
    username: input.username.trim(),
    email: input.email?.trim() || undefined,
    passwordHash: input.passwordHash,
    googleId: input.googleId ?? null,
    role: input.role ?? 'guest',
    avatarUrl: input.avatarUrl?.trim() || DEFAULT_AVATAR_URL,
    googleLinked: Boolean(input.googleLinked),
    accountStatus: 'active',
    createdAt: new Date().toISOString(),
  };

  if (pgPool) {
    await pgPool.query(
      `INSERT INTO users (id, username, email, password_hash, google_id, role, avatar_url, google_linked, account_status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        user.id,
        user.username,
        user.email ?? null,
        user.passwordHash,
        user.googleId ?? null,
        user.role,
        user.avatarUrl,
        Boolean(user.googleLinked),
        'active',
        user.createdAt,
      ]
    );
  } else if (sqliteDb) {
    sqliteDb
      .prepare(
        `INSERT INTO users (id, username, email, passwordHash, googleId, role, avatarUrl, googleLinked, accountStatus, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        user.id,
        user.username,
        user.email ?? null,
        user.passwordHash,
        user.googleId ?? null,
        user.role,
        user.avatarUrl,
        user.googleLinked ? 1 : 0,
        'active',
        user.createdAt
      );
  } else {
    jsonStore!.users.push(user);
    saveJsonStore();
  }
  return toPublicUser(user);
}

export async function updateUserBasic(
  userId: string,
  updates: {
    email?: string;
    avatarUrl?: string;
    passwordHash?: string;
    googleId?: string;
    googleLinked?: boolean;
  }
): Promise<PublicUser | null> {
  await initDatabase();
  const current = await getStoredUserById(userId);
  if (!current) return null;

  const next: StoredUser = {
    ...current,
    email: updates.email !== undefined ? updates.email || undefined : current.email,
    avatarUrl:
      updates.avatarUrl !== undefined ? updates.avatarUrl || DEFAULT_AVATAR_URL : current.avatarUrl,
    passwordHash: updates.passwordHash !== undefined ? updates.passwordHash : current.passwordHash,
    googleId: updates.googleId !== undefined ? updates.googleId : current.googleId,
    googleLinked: updates.googleLinked !== undefined ? updates.googleLinked : current.googleLinked,
  };

  if (pgPool) {
    await pgPool.query(
      `UPDATE users SET email = $1, avatar_url = $2, password_hash = $3, google_id = $4, google_linked = $5 WHERE id = $6`,
      [
        next.email ?? null,
        next.avatarUrl,
        next.passwordHash,
        next.googleId ?? null,
        Boolean(next.googleLinked),
        userId,
      ]
    );
  } else if (sqliteDb) {
    sqliteDb
      .prepare(
        `UPDATE users SET email = ?, avatarUrl = ?, passwordHash = ?, googleId = ?, googleLinked = ? WHERE id = ?`
      )
      .run(
        next.email ?? null,
        next.avatarUrl,
        next.passwordHash,
        next.googleId ?? null,
        next.googleLinked ? 1 : 0,
        userId
      );
  } else {
    const idx = jsonStore!.users.findIndex((u) => u.id === userId);
    if (idx !== -1) {
      jsonStore!.users[idx] = next;
      saveJsonStore();
    }
  }
  return toPublicUser(next);
}

export async function updateUserRole(userId: string, role: UserRole): Promise<PublicUser | null> {
  await initDatabase();
  const current = await getStoredUserById(userId);
  if (!current) return null;
  if (pgPool) {
    await pgPool.query('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);
  } else if (sqliteDb) {
    sqliteDb.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
  } else {
    const idx = jsonStore!.users.findIndex((u) => u.id === userId);
    if (idx !== -1) {
      jsonStore!.users[idx].role = role;
      saveJsonStore();
    }
  }
  return toPublicUser({ ...current, role });
}

export async function setUserAccountStatus(
  userId: string,
  accountStatus: AccountStatus,
  suspendedReason?: string
): Promise<PublicUser | null> {
  await initDatabase();
  const current = await getStoredUserById(userId);
  if (!current) return null;
  const reasonValue =
    accountStatus === 'suspended' ? suspendedReason?.trim() || 'Pelanggaran tata tertib warga' : null;

  if (pgPool) {
    await pgPool.query(
      'UPDATE users SET account_status = $1, suspended_reason = $2 WHERE id = $3',
      [accountStatus, reasonValue, userId]
    );
  } else if (sqliteDb) {
    sqliteDb
      .prepare('UPDATE users SET accountStatus = ?, suspendedReason = ? WHERE id = ?')
      .run(accountStatus, reasonValue, userId);
  } else {
    const idx = jsonStore!.users.findIndex((u) => u.id === userId);
    if (idx !== -1) {
      jsonStore!.users[idx].accountStatus = accountStatus;
      jsonStore!.users[idx].suspendedReason = reasonValue ?? undefined;
      saveJsonStore();
    }
  }
  return toPublicUser({
    ...current,
    accountStatus,
    suspendedReason: reasonValue ?? undefined,
  });
}

export async function getKtpByUserId(userId: string): Promise<KtpProfile | null> {
  await initDatabase();
  if (pgPool) {
    const res = await pgPool.query('SELECT * FROM profiles_ktp WHERE user_id = $1', [userId]);
    return res.rows[0] ? mapPgKtp(res.rows[0]) : null;
  }
  if (sqliteDb) {
    const row = sqliteDb.prepare('SELECT * FROM profiles_ktp WHERE userId = ?').get(userId) as
      | Record<string, unknown>
      | undefined;
    return row ? mapSqliteKtp(row) : null;
  }
  return jsonStore!.profiles_ktp.find((k) => k.userId === userId) ?? null;
}

export async function getCitizenById(userId: string): Promise<CitizenRecord | null> {
  const u = await getStoredUserById(userId);
  if (!u) return null;
  return {
    user: toPublicUser(u),
    ktp: await getKtpByUserId(userId),
  };
}

export async function getCitizenByUsername(username: string): Promise<CitizenRecord | null> {
  await initDatabase();
  const norm = username.trim().toLowerCase();
  let user: StoredUser | null = null;
  if (pgPool) {
    const res = await pgPool.query('SELECT * FROM users WHERE LOWER(username) = $1', [norm]);
    if (res.rows[0]) user = mapPgUser(res.rows[0]);
  } else if (sqliteDb) {
    const row = sqliteDb
      .prepare('SELECT * FROM users WHERE LOWER(username) = ?')
      .get(norm) as Record<string, unknown> | undefined;
    if (row) user = mapSqliteUser(row);
  } else {
    user = jsonStore!.users.find((u) => u.username.toLowerCase() === norm) ?? null;
  }
  if (!user) return null;
  return {
    user: toPublicUser(user),
    ktp: await getKtpByUserId(user.id),
  };
}

export async function listCitizens(): Promise<CitizenRecord[]> {
  await initDatabase();
  let users: StoredUser[] = [];
  let ktps: KtpProfile[] = [];
  if (pgPool) {
    const [uRes, kRes] = await Promise.all([
      pgPool.query('SELECT * FROM users ORDER BY created_at DESC'),
      pgPool.query('SELECT * FROM profiles_ktp'),
    ]);
    users = uRes.rows.map(mapPgUser);
    ktps = kRes.rows.map(mapPgKtp);
  } else if (sqliteDb) {
    users = (
      sqliteDb.prepare('SELECT * FROM users ORDER BY createdAt DESC').all() as Record<
        string,
        unknown
      >[]
    ).map(mapSqliteUser);
    ktps = (sqliteDb.prepare('SELECT * FROM profiles_ktp').all() as Record<string, unknown>[]).map(
      mapSqliteKtp
    );
  } else {
    users = [...jsonStore!.users].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    ktps = jsonStore!.profiles_ktp;
  }

  const ktpByUser: Record<string, KtpProfile> = {};
  for (const k of ktps) ktpByUser[k.userId] = k;
  return users.map((u) => ({
    user: toPublicUser(u),
    ktp: ktpByUser[u.id] ?? null,
  }));
}

function generateKtpSerial(locationName: string): string {
  const cleanCode =
    locationName
      .replace(/[^A-Za-z]/g, '')
      .toUpperCase()
      .slice(0, 3) || 'NGW';
  const year = new Date().getFullYear();
  const seq = String(Math.floor(1000 + Math.random() * 9000));
  return `JMK-${cleanCode}-${year}-${seq}`;
}

export async function upsertKtpProfile(
  userId: string,
  input: {
    fullName: string;
    title: string;
    locationType: LocationType;
    locationName: string;
    faction: string;
    motto: string;
    bloodGroup: string;
    socialLinks: SocialLinks;
  }
): Promise<CitizenRecord | null> {
  await initDatabase();
  const user = await getStoredUserById(userId);
  if (!user) return null;

  const existing = await getKtpByUserId(userId);
  const locationName = input.locationName.trim() || 'NGAWI';
  const profile: KtpProfile = {
    userId,
    ktpSerial: existing?.ktpSerial || generateKtpSerial(locationName),
    fullName: input.fullName.trim(),
    title: input.title.trim() || 'Warga Penjomok Aktif',
    locationType: input.locationType,
    locationName,
    faction: input.faction.trim() || 'Serikat Warga Ngawi',
    motto: input.motto.trim(),
    bloodGroup: input.bloodGroup.trim() || 'O+',
    socialLinks: input.socialLinks || {},
    verifiedByAdmin: existing?.verifiedByAdmin ?? false,
    issuedAt: existing?.issuedAt || new Date().toISOString(),
  };

  const nextRole: UserRole = user.role === 'guest' ? 'member' : user.role;

  if (pgPool) {
    await pgPool.query(
      `INSERT INTO profiles_ktp (user_id, ktp_serial, full_name, title, location_type, location_name, faction, motto, blood_group, social_links, verified_by_admin, issued_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
       ON CONFLICT (user_id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         title = EXCLUDED.title,
         location_type = EXCLUDED.location_type,
         location_name = EXCLUDED.location_name,
         faction = EXCLUDED.faction,
         motto = EXCLUDED.motto,
         blood_group = EXCLUDED.blood_group,
         social_links = EXCLUDED.social_links`,
      [
        profile.userId,
        profile.ktpSerial,
        profile.fullName,
        profile.title,
        profile.locationType,
        profile.locationName,
        profile.faction,
        profile.motto,
        profile.bloodGroup,
        JSON.stringify(profile.socialLinks),
        profile.verifiedByAdmin,
        profile.issuedAt,
      ]
    );
    if (nextRole !== user.role) {
      await pgPool.query('UPDATE users SET role = $1 WHERE id = $2', [nextRole, userId]);
    }
  } else if (sqliteDb) {
    sqliteDb
      .prepare(
        `INSERT INTO profiles_ktp (userId, ktpSerial, fullName, title, locationType, locationName, faction, motto, bloodGroup, socialLinks, verifiedByAdmin, issuedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(userId) DO UPDATE SET
           fullName = excluded.fullName,
           title = excluded.title,
           locationType = excluded.locationType,
           locationName = excluded.locationName,
           faction = excluded.faction,
           motto = excluded.motto,
           bloodGroup = excluded.bloodGroup,
           socialLinks = excluded.socialLinks`
      )
      .run(
        profile.userId,
        profile.ktpSerial,
        profile.fullName,
        profile.title,
        profile.locationType,
        profile.locationName,
        profile.faction,
        profile.motto,
        profile.bloodGroup,
        JSON.stringify(profile.socialLinks),
        profile.verifiedByAdmin ? 1 : 0,
        profile.issuedAt
      );
    if (nextRole !== user.role) {
      sqliteDb.prepare('UPDATE users SET role = ? WHERE id = ?').run(nextRole, userId);
    }
  } else {
    const idx = jsonStore!.profiles_ktp.findIndex((k) => k.userId === userId);
    if (idx === -1) {
      jsonStore!.profiles_ktp.push(profile);
    } else {
      jsonStore!.profiles_ktp[idx] = profile;
    }
    const uIdx = jsonStore!.users.findIndex((u) => u.id === userId);
    if (uIdx !== -1) {
      jsonStore!.users[uIdx].role = nextRole;
    }
    saveJsonStore();
  }

  return {
    user: toPublicUser({ ...user, role: nextRole }),
    ktp: profile,
  };
}

export async function verifyKtpProfile(
  userId: string,
  verified: boolean
): Promise<KtpProfile | null> {
  await initDatabase();
  const existing = await getKtpByUserId(userId);
  if (!existing) return null;
  if (pgPool) {
    await pgPool.query('UPDATE profiles_ktp SET verified_by_admin = $1 WHERE user_id = $2', [
      verified,
      userId,
    ]);
  } else if (sqliteDb) {
    sqliteDb
      .prepare('UPDATE profiles_ktp SET verifiedByAdmin = ? WHERE userId = ?')
      .run(verified ? 1 : 0, userId);
  } else {
    const idx = jsonStore!.profiles_ktp.findIndex((k) => k.userId === userId);
    if (idx !== -1) {
      jsonStore!.profiles_ktp[idx].verifiedByAdmin = verified;
      saveJsonStore();
    }
  }
  return { ...existing, verifiedByAdmin: verified };
}

// ---------- User Blocks ----------

export async function listBlockedUserIds(blockerId?: string): Promise<string[]> {
  if (!blockerId) return [];
  await initDatabase();
  if (pgPool) {
    const res = await pgPool.query<{ blocked_id: string }>(
      'SELECT blocked_id FROM user_blocks WHERE blocker_id = $1',
      [blockerId]
    );
    return res.rows.map((r) => String(r.blocked_id));
  }
  if (sqliteDb) {
    const rows = sqliteDb
      .prepare('SELECT blockedId FROM user_blocks WHERE blockerId = ?')
      .all(blockerId) as Array<{ blockedId: string }>;
    return rows.map((r) => String(r.blockedId));
  }
  return (jsonStore!.user_blocks || [])
    .filter((b) => b.blockerId === blockerId)
    .map((b) => b.blockedId);
}

export async function listBlockedUsers(blockerId: string): Promise<BlockedUserEntry[]> {
  await initDatabase();
  const citizens = await listCitizens();
  const map: Record<string, CitizenRecord> = {};
  for (const c of citizens) map[c.user.id] = c;

  let blocks: StoredBlock[] = [];
  if (pgPool) {
    const res = await pgPool.query(
      'SELECT blocker_id, blocked_id, created_at FROM user_blocks WHERE blocker_id = $1 ORDER BY created_at DESC',
      [blockerId]
    );
    blocks = res.rows.map((r) => ({
      blockerId: String(r.blocker_id),
      blockedId: String(r.blocked_id),
      createdAt: String(r.created_at),
    }));
  } else if (sqliteDb) {
    blocks = sqliteDb
      .prepare('SELECT blockerId, blockedId, createdAt FROM user_blocks WHERE blockerId = ? ORDER BY createdAt DESC')
      .all(blockerId) as StoredBlock[];
  } else {
    blocks = (jsonStore!.user_blocks || [])
      .filter((b) => b.blockerId === blockerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return blocks.map((b) => {
    const target = map[b.blockedId];
    return {
      blockedUserId: b.blockedId,
      username: target?.user.username || 'warga',
      avatarUrl: target?.user.avatarUrl || DEFAULT_AVATAR_URL,
      createdAt: b.createdAt,
    };
  });
}

export async function isBlockedBetween(userAId: string, userBId: string): Promise<boolean> {
  await initDatabase();
  if (pgPool) {
    const res = await pgPool.query(
      `SELECT 1 FROM user_blocks
       WHERE (blocker_id = $1 AND blocked_id = $2)
          OR (blocker_id = $2 AND blocked_id = $1)
       LIMIT 1`,
      [userAId, userBId]
    );
    return res.rows.length > 0;
  }
  if (sqliteDb) {
    const row = sqliteDb
      .prepare(
        `SELECT 1 FROM user_blocks
         WHERE (blockerId = ? AND blockedId = ?)
            OR (blockerId = ? AND blockedId = ?)
         LIMIT 1`
      )
      .get(userAId, userBId, userBId, userAId);
    return Boolean(row);
  }
  return (jsonStore!.user_blocks || []).some(
    (b) =>
      (b.blockerId === userAId && b.blockedId === userBId) ||
      (b.blockerId === userBId && b.blockedId === userAId)
  );
}

export async function blockUser(blockerId: string, blockedId: string): Promise<boolean> {
  await initDatabase();
  if (blockerId === blockedId) return false;
  const target = await getStoredUserById(blockedId);
  if (!target) return false;

  const createdAt = new Date().toISOString();
  if (pgPool) {
    await pgPool.query(
      `INSERT INTO user_blocks (blocker_id, blocked_id, created_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
      [blockerId, blockedId, createdAt]
    );
  } else if (sqliteDb) {
    sqliteDb
      .prepare('INSERT OR IGNORE INTO user_blocks (blockerId, blockedId, createdAt) VALUES (?, ?, ?)')
      .run(blockerId, blockedId, createdAt);
  } else {
    const list = jsonStore!.user_blocks || [];
    if (!list.some((b) => b.blockerId === blockerId && b.blockedId === blockedId)) {
      list.push({ blockerId, blockedId, createdAt });
      jsonStore!.user_blocks = list;
      saveJsonStore();
    }
  }
  return true;
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<boolean> {
  await initDatabase();
  if (pgPool) {
    await pgPool.query('DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2', [
      blockerId,
      blockedId,
    ]);
  } else if (sqliteDb) {
    sqliteDb
      .prepare('DELETE FROM user_blocks WHERE blockerId = ? AND blockedId = ?')
      .run(blockerId, blockedId);
  } else {
    jsonStore!.user_blocks = (jsonStore!.user_blocks || []).filter(
      (b) => !(b.blockerId === blockerId && b.blockedId === blockedId)
    );
    saveJsonStore();
  }
  return true;
}

// ---------- Timeline Posts ----------

export async function listPosts(viewerUserId?: string): Promise<TimelinePost[]> {
  await initDatabase();
  const [citizens, blockedIds] = await Promise.all([
    listCitizens(),
    listBlockedUserIds(viewerUserId),
  ]);
  const blockedSet = new Set(blockedIds);
  const citizenMap: Record<string, CitizenRecord> = {};
  for (const c of citizens) citizenMap[c.user.id] = c;

  let rawPosts: StoredPost[] = [];
  const likedSet = new Set<string>();

  if (pgPool) {
    const pRes = await pgPool.query('SELECT * FROM posts ORDER BY created_at DESC');
    rawPosts = pRes.rows.map((r) => ({
      id: String(r.id),
      authorId: String(r.author_id),
      contentText: String(r.content_text),
      imageUrl: r.image_url ? String(r.image_url) : null,
      imageMimeType: r.image_mime_type ? String(r.image_mime_type) : null,
      locationTag: String(r.location_tag),
      likesCount: Number(r.likes_count || 0),
      createdAt: String(r.created_at),
    }));
    if (viewerUserId) {
      const lRes = await pgPool.query('SELECT post_id FROM post_likes WHERE user_id = $1', [
        viewerUserId,
      ]);
      for (const l of lRes.rows) likedSet.add(String(l.post_id));
    }
  } else if (sqliteDb) {
    rawPosts = (
      sqliteDb.prepare('SELECT * FROM posts ORDER BY createdAt DESC').all() as Record<
        string,
        unknown
      >[]
    ).map((r) => ({
      id: String(r.id),
      authorId: String(r.authorId),
      contentText: String(r.contentText),
      imageUrl: r.imageUrl ? String(r.imageUrl) : null,
      imageMimeType: r.imageMimeType ? String(r.imageMimeType) : null,
      locationTag: String(r.locationTag),
      likesCount: Number(r.likesCount || 0),
      createdAt: String(r.createdAt),
    }));
    if (viewerUserId) {
      const likes = sqliteDb
        .prepare('SELECT postId FROM post_likes WHERE userId = ?')
        .all(viewerUserId) as Array<{ postId: string }>;
      for (const l of likes) likedSet.add(l.postId);
    }
  } else {
    rawPosts = [...jsonStore!.posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (viewerUserId) {
      for (const l of jsonStore!.post_likes) {
        if (l.userId === viewerUserId) likedSet.add(l.postId);
      }
    }
  }

  return rawPosts
    .filter((p) => !blockedSet.has(p.authorId))
    .map((p) => {
      const author = citizenMap[p.authorId];
      return {
        id: p.id,
        authorId: p.authorId,
        authorUsername: author?.user.username || 'warga_anom',
        authorAvatar: author?.user.avatarUrl || DEFAULT_AVATAR_URL,
        authorRole: author?.user.role || 'guest',
        authorTitle: author?.ktp?.title,
        contentText: p.contentText,
        imageUrl: p.imageUrl ?? undefined,
        imageMimeType: p.imageMimeType ?? undefined,
        locationTag: p.locationTag,
        likesCount: p.likesCount,
        likedByMe: likedSet.has(p.id),
        createdAt: p.createdAt,
      };
    });
}

export async function getStoredPostById(postId: string): Promise<StoredPost | null> {
  await initDatabase();
  if (pgPool) {
    const res = await pgPool.query('SELECT * FROM posts WHERE id = $1', [postId]);
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: String(r.id),
      authorId: String(r.author_id),
      contentText: String(r.content_text),
      imageUrl: r.image_url ? String(r.image_url) : null,
      imageMimeType: r.image_mime_type ? String(r.image_mime_type) : null,
      locationTag: String(r.location_tag),
      likesCount: Number(r.likes_count || 0),
      createdAt: String(r.created_at),
    };
  }
  if (sqliteDb) {
    const r = sqliteDb.prepare('SELECT * FROM posts WHERE id = ?').get(postId) as
      | Record<string, unknown>
      | undefined;
    if (!r) return null;
    return {
      id: String(r.id),
      authorId: String(r.authorId),
      contentText: String(r.contentText),
      imageUrl: r.imageUrl ? String(r.imageUrl) : null,
      imageMimeType: r.imageMimeType ? String(r.imageMimeType) : null,
      locationTag: String(r.locationTag),
      likesCount: Number(r.likesCount || 0),
      createdAt: String(r.createdAt),
    };
  }
  return jsonStore!.posts.find((p) => p.id === postId) ?? null;
}

export async function createPost(input: {
  authorId: string;
  contentText: string;
  imageUrl?: string;
  imageMimeType?: string;
  locationTag?: string;
}): Promise<TimelinePost> {
  await initDatabase();
  const citizen = await getCitizenById(input.authorId);
  const post: StoredPost = {
    id: `post-${crypto.randomUUID().slice(0, 8)}`,
    authorId: input.authorId,
    contentText: input.contentText.trim(),
    imageUrl: input.imageUrl?.trim() || null,
    imageMimeType: input.imageMimeType?.trim() || null,
    locationTag: input.locationTag?.trim() || citizen?.ktp?.locationName || 'NGAWI',
    likesCount: 0,
    createdAt: new Date().toISOString(),
  };

  if (pgPool) {
    await pgPool.query(
      `INSERT INTO posts (id, author_id, content_text, image_url, image_mime_type, location_tag, likes_count, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        post.id,
        post.authorId,
        post.contentText,
        post.imageUrl,
        post.imageMimeType,
        post.locationTag,
        post.likesCount,
        post.createdAt,
      ]
    );
  } else if (sqliteDb) {
    sqliteDb
      .prepare(
        `INSERT INTO posts (id, authorId, contentText, imageUrl, imageMimeType, locationTag, likesCount, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        post.id,
        post.authorId,
        post.contentText,
        post.imageUrl,
        post.imageMimeType,
        post.locationTag,
        post.likesCount,
        post.createdAt
      );
  } else {
    jsonStore!.posts.unshift(post);
    saveJsonStore();
  }

  return {
    id: post.id,
    authorId: post.authorId,
    authorUsername: citizen?.user.username || 'warga',
    authorAvatar: citizen?.user.avatarUrl || DEFAULT_AVATAR_URL,
    authorRole: citizen?.user.role || 'guest',
    authorTitle: citizen?.ktp?.title,
    contentText: post.contentText,
    imageUrl: post.imageUrl ?? undefined,
    imageMimeType: post.imageMimeType ?? undefined,
    locationTag: post.locationTag,
    likesCount: 0,
    likedByMe: false,
    createdAt: post.createdAt,
  };
}

export async function togglePostLike(
  postId: string,
  userId: string
): Promise<{ likesCount: number; liked: boolean } | null> {
  await initDatabase();
  if (pgPool) {
    const pRes = await pgPool.query<{ likes_count: number }>(
      'SELECT likes_count FROM posts WHERE id = $1',
      [postId]
    );
    if (!pRes.rows[0]) return null;
    const currentLikes = Number(pRes.rows[0].likes_count || 0);
    const ex = await pgPool.query(
      'SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2',
      [postId, userId]
    );
    if (ex.rows[0]) {
      await pgPool.query('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [
        postId,
        userId,
      ]);
      const next = Math.max(0, currentLikes - 1);
      await pgPool.query('UPDATE posts SET likes_count = $1 WHERE id = $2', [next, postId]);
      return { likesCount: next, liked: false };
    }
    await pgPool.query('INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2)', [
      postId,
      userId,
    ]);
    const next = currentLikes + 1;
    await pgPool.query('UPDATE posts SET likes_count = $1 WHERE id = $2', [next, postId]);
    return { likesCount: next, liked: true };
  }

  if (sqliteDb) {
    const post = sqliteDb.prepare('SELECT likesCount FROM posts WHERE id = ?').get(postId) as
      | { likesCount: number }
      | undefined;
    if (!post) return null;
    const existing = sqliteDb
      .prepare('SELECT 1 FROM post_likes WHERE postId = ? AND userId = ?')
      .get(postId, userId);
    if (existing) {
      sqliteDb.prepare('DELETE FROM post_likes WHERE postId = ? AND userId = ?').run(postId, userId);
      const next = Math.max(0, post.likesCount - 1);
      sqliteDb.prepare('UPDATE posts SET likesCount = ? WHERE id = ?').run(next, postId);
      return { likesCount: next, liked: false };
    }
    sqliteDb.prepare('INSERT INTO post_likes (postId, userId) VALUES (?, ?)').run(postId, userId);
    const next = post.likesCount + 1;
    sqliteDb.prepare('UPDATE posts SET likesCount = ? WHERE id = ?').run(next, postId);
    return { likesCount: next, liked: true };
  }

  const post = jsonStore!.posts.find((p) => p.id === postId);
  if (!post) return null;
  const idx = jsonStore!.post_likes.findIndex((l) => l.postId === postId && l.userId === userId);
  if (idx !== -1) {
    jsonStore!.post_likes.splice(idx, 1);
    post.likesCount = Math.max(0, post.likesCount - 1);
    saveJsonStore();
    return { likesCount: post.likesCount, liked: false };
  }
  jsonStore!.post_likes.push({ postId, userId });
  post.likesCount += 1;
  saveJsonStore();
  return { likesCount: post.likesCount, liked: true };
}

export async function deletePost(
  postId: string,
  requesterId: string,
  requesterRole: UserRole
): Promise<boolean> {
  await initDatabase();
  const canModerate = requesterRole === 'admin' || requesterRole === 'superadmin';
  if (pgPool) {
    const pRes = await pgPool.query<{ author_id: string }>(
      'SELECT author_id FROM posts WHERE id = $1',
      [postId]
    );
    if (!pRes.rows[0]) return false;
    if (pRes.rows[0].author_id !== requesterId && !canModerate) return false;
    await pgPool.query('DELETE FROM post_likes WHERE post_id = $1', [postId]);
    await pgPool.query('DELETE FROM posts WHERE id = $1', [postId]);
    return true;
  }
  if (sqliteDb) {
    const post = sqliteDb.prepare('SELECT authorId FROM posts WHERE id = ?').get(postId) as
      | { authorId: string }
      | undefined;
    if (!post) return false;
    if (post.authorId !== requesterId && !canModerate) return false;
    sqliteDb.prepare('DELETE FROM post_likes WHERE postId = ?').run(postId);
    sqliteDb.prepare('DELETE FROM posts WHERE id = ?').run(postId);
    return true;
  }
  const idx = jsonStore!.posts.findIndex((p) => p.id === postId);
  if (idx === -1) return false;
  if (jsonStore!.posts[idx].authorId !== requesterId && !canModerate) return false;
  jsonStore!.posts.splice(idx, 1);
  jsonStore!.post_likes = jsonStore!.post_likes.filter((l) => l.postId !== postId);
  saveJsonStore();
  return true;
}

// ---------- Chat Rooms, Group Chat & Messages ----------

export async function listAllChatRoomsRaw(): Promise<ChatRoom[]> {
  await initDatabase();
  if (pgPool) {
    const res = await pgPool.query('SELECT * FROM chat_rooms ORDER BY created_at ASC');
    return res.rows.map(mapPgRoom);
  }
  if (sqliteDb) {
    const rows = sqliteDb.prepare('SELECT * FROM chat_rooms ORDER BY createdAt ASC').all() as Record<
      string,
      unknown
    >[];
    return rows.map(mapSqliteRoom);
  }
  return jsonStore!.chat_rooms.map((r) => ({
    ...r,
    coCreatorIds: r.coCreatorIds || [],
    isArchived: Boolean(r.isArchived),
  }));
}

export async function getChatRoomById(roomId: string): Promise<ChatRoom | null> {
  await initDatabase();
  if (pgPool) {
    const res = await pgPool.query('SELECT * FROM chat_rooms WHERE id = $1', [roomId]);
    return res.rows[0] ? mapPgRoom(res.rows[0]) : null;
  }
  if (sqliteDb) {
    const row = sqliteDb.prepare('SELECT * FROM chat_rooms WHERE id = ?').get(roomId) as
      | Record<string, unknown>
      | undefined;
    return row ? mapSqliteRoom(row) : null;
  }
  const found = jsonStore!.chat_rooms.find((r) => r.id === roomId);
  return found
    ? {
        ...found,
        coCreatorIds: found.coCreatorIds || [],
        isArchived: Boolean(found.isArchived),
      }
    : null;
}

export async function listChatRooms(userId?: string): Promise<ChatRoom[]> {
  const [rooms, blockedIds] = await Promise.all([
    listAllChatRoomsRaw(),
    listBlockedUserIds(userId),
  ]);
  const blockedSet = new Set(blockedIds);

  return rooms.filter((r) => {
    if (r.type === 'channel') return true;
    if (!userId) return false;
    if (!r.participants?.includes(userId)) return false;
    if (r.type === 'dm') {
      const otherId = r.participants.find((id) => id !== userId);
      if (otherId && blockedSet.has(otherId)) return false;
    }
    return true;
  });
}

async function saveChatRoomUpdate(room: ChatRoom): Promise<void> {
  if (pgPool) {
    await pgPool.query(
      `UPDATE chat_rooms
       SET name = $1, description = $2, realm_tag = $3, participants = $4::jsonb, co_creator_ids = $5::jsonb, is_archived = $6
       WHERE id = $7`,
      [
        room.name,
        room.description,
        room.realmTag,
        JSON.stringify(room.participants || []),
        JSON.stringify(room.coCreatorIds || []),
        Boolean(room.isArchived),
        room.id,
      ]
    );
  } else if (sqliteDb) {
    sqliteDb
      .prepare(
        `UPDATE chat_rooms
         SET name = ?, description = ?, realmTag = ?, participants = ?, coCreatorIds = ?, isArchived = ?
         WHERE id = ?`
      )
      .run(
        room.name,
        room.description,
        room.realmTag,
        JSON.stringify(room.participants || []),
        JSON.stringify(room.coCreatorIds || []),
        room.isArchived ? 1 : 0,
        room.id
      );
  } else {
    const idx = jsonStore!.chat_rooms.findIndex((r) => r.id === room.id);
    if (idx !== -1) {
      jsonStore!.chat_rooms[idx] = room;
      saveJsonStore();
    }
  }
}

export async function getOrCreateDmRoom(
  userAId: string,
  userBId: string
): Promise<ChatRoom | null> {
  await initDatabase();
  const userA = await getStoredUserById(userAId);
  const userB = await getStoredUserById(userBId);
  if (!userA || !userB) return null;

  const sortedPair = [userAId, userBId].sort();
  const allRooms = await listAllChatRoomsRaw();
  const existing = allRooms.find(
    (r) =>
      r.type === 'dm' &&
      r.participants?.length === 2 &&
      [...r.participants].sort().join(':') === sortedPair.join(':')
  );
  if (existing) return existing;

  const room: ChatRoom = {
    id: `dm-${sortedPair[0].slice(-4)}-${sortedPair[1].slice(-4)}-${Date.now().toString(36)}`,
    name: `${userA.username} & ${userB.username}`,
    description: `Pesan langsung antar warga ${userA.username} dan ${userB.username}`,
    type: 'dm',
    realmTag: 'Direct Message',
    participants: sortedPair,
    coCreatorIds: [],
    isArchived: false,
    createdAt: new Date().toISOString(),
  };

  if (pgPool) {
    await pgPool.query(
      `INSERT INTO chat_rooms (id, name, description, type, realm_tag, participants, creator_id, co_creator_ids, is_archived, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9, $10)`,
      [
        room.id,
        room.name,
        room.description,
        room.type,
        room.realmTag,
        JSON.stringify(room.participants),
        null,
        JSON.stringify([]),
        false,
        room.createdAt,
      ]
    );
  } else if (sqliteDb) {
    sqliteDb
      .prepare(
        `INSERT INTO chat_rooms (id, name, description, type, realmTag, participants, creatorId, coCreatorIds, isArchived, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        room.id,
        room.name,
        room.description,
        room.type,
        room.realmTag,
        JSON.stringify(room.participants),
        null,
        JSON.stringify([]),
        0,
        room.createdAt
      );
  } else {
    jsonStore!.chat_rooms.push(room);
    saveJsonStore();
  }
  return room;
}

export async function createGroupRoom(input: {
  creatorId: string;
  name: string;
  description?: string;
  realmTag?: string;
  memberIds: string[];
}): Promise<ChatRoom> {
  await initDatabase();
  const uniqueMembers = Array.from(
    new Set([input.creatorId, ...input.memberIds.filter(Boolean)])
  );
  const validMembers: string[] = [input.creatorId];
  for (const id of uniqueMembers) {
    if (id === input.creatorId) continue;
    const u = await getStoredUserById(id);
    if (u) validMembers.push(u.id);
  }

  const room: ChatRoom = {
    id: `grp-${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.trim(),
    description: input.description?.trim() || 'Grup obrolan warga Republik Jomokerto.',
    type: 'group',
    realmTag: input.realmTag?.trim() || 'Grup Warga',
    participants: validMembers,
    creatorId: input.creatorId, // Immutable creator
    coCreatorIds: [],
    isArchived: false,
    createdAt: new Date().toISOString(),
  };

  if (pgPool) {
    await pgPool.query(
      `INSERT INTO chat_rooms (id, name, description, type, realm_tag, participants, creator_id, co_creator_ids, is_archived, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9, $10)`,
      [
        room.id,
        room.name,
        room.description,
        room.type,
        room.realmTag,
        JSON.stringify(room.participants),
        room.creatorId,
        JSON.stringify(room.coCreatorIds),
        false,
        room.createdAt,
      ]
    );
  } else if (sqliteDb) {
    sqliteDb
      .prepare(
        `INSERT INTO chat_rooms (id, name, description, type, realmTag, participants, creatorId, coCreatorIds, isArchived, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        room.id,
        room.name,
        room.description,
        room.type,
        room.realmTag,
        JSON.stringify(room.participants),
        room.creatorId,
        JSON.stringify(room.coCreatorIds),
        0,
        room.createdAt
      );
  } else {
    jsonStore!.chat_rooms.push(room);
    saveJsonStore();
  }

  return room;
}

export async function addGroupMembers(
  roomId: string,
  userIdsToAdd: string[]
): Promise<ChatRoom | null> {
  const room = await getChatRoomById(roomId);
  if (!room || room.type !== 'group') return null;

  const current = new Set(room.participants || []);
  for (const id of userIdsToAdd) {
    if (!current.has(id)) {
      const u = await getStoredUserById(id);
      if (u) current.add(u.id);
    }
  }
  const updated: ChatRoom = {
    ...room,
    participants: Array.from(current),
  };
  await saveChatRoomUpdate(updated);
  return updated;
}

export async function removeGroupMember(
  roomId: string,
  targetUserId: string
): Promise<ChatRoom | null> {
  const room = await getChatRoomById(roomId);
  if (!room || room.type !== 'group') return null;
  if (targetUserId === room.creatorId) return room; // Immutable creator cannot be removed

  const updated: ChatRoom = {
    ...room,
    participants: (room.participants || []).filter((id) => id !== targetUserId),
    coCreatorIds: (room.coCreatorIds || []).filter((id) => id !== targetUserId),
  };
  await saveChatRoomUpdate(updated);
  return updated;
}

export async function setGroupCoCreator(
  roomId: string,
  targetUserId: string,
  makeCoCreator: boolean
): Promise<ChatRoom | null> {
  const room = await getChatRoomById(roomId);
  if (!room || room.type !== 'group') return null;
  if (targetUserId === room.creatorId) return room; // Creator stays immutable

  const participants = new Set(room.participants || []);
  if (!participants.has(targetUserId)) {
    const u = await getStoredUserById(targetUserId);
    if (!u) return null;
    participants.add(u.id);
  }

  const coCreators = new Set(room.coCreatorIds || []);
  if (makeCoCreator) {
    coCreators.add(targetUserId);
  } else {
    coCreators.delete(targetUserId);
  }

  const updated: ChatRoom = {
    ...room,
    participants: Array.from(participants),
    coCreatorIds: Array.from(coCreators),
  };
  await saveChatRoomUpdate(updated);
  return updated;
}

export async function setGroupArchived(
  roomId: string,
  isArchived: boolean
): Promise<ChatRoom | null> {
  const room = await getChatRoomById(roomId);
  if (!room || room.type !== 'group') return null;
  const updated: ChatRoom = { ...room, isArchived };
  await saveChatRoomUpdate(updated);
  return updated;
}

export async function deleteGroupRoom(roomId: string): Promise<boolean> {
  await initDatabase();
  const room = await getChatRoomById(roomId);
  if (!room || room.type !== 'group') return false;

  if (pgPool) {
    await pgPool.query('DELETE FROM chat_messages WHERE room_id = $1', [roomId]);
    await pgPool.query('DELETE FROM chat_rooms WHERE id = $1', [roomId]);
    return true;
  }
  if (sqliteDb) {
    sqliteDb.prepare('DELETE FROM chat_messages WHERE roomId = ?').run(roomId);
    sqliteDb.prepare('DELETE FROM chat_rooms WHERE id = ?').run(roomId);
    return true;
  }
  jsonStore!.chat_messages = jsonStore!.chat_messages.filter((m) => m.roomId !== roomId);
  jsonStore!.chat_rooms = jsonStore!.chat_rooms.filter((r) => r.id !== roomId);
  saveJsonStore();
  return true;
}

export async function listChatMessages(
  roomId: string,
  afterIso?: string,
  viewerUserId?: string
): Promise<ChatMessage[]> {
  await initDatabase();
  const [citizens, blockedIds] = await Promise.all([
    listCitizens(),
    listBlockedUserIds(viewerUserId),
  ]);
  const blockedSet = new Set(blockedIds);
  const citizenMap: Record<string, CitizenRecord> = {};
  for (const c of citizens) citizenMap[c.user.id] = c;

  let raw: StoredMessage[] = [];
  if (pgPool) {
    const res = afterIso
      ? await pgPool.query(
          'SELECT * FROM chat_messages WHERE room_id = $1 AND created_at > $2 ORDER BY created_at ASC',
          [roomId, afterIso]
        )
      : await pgPool.query(
          'SELECT * FROM chat_messages WHERE room_id = $1 ORDER BY created_at ASC LIMIT 120',
          [roomId]
        );
    raw = res.rows.map((r) => ({
      id: String(r.id),
      roomId: String(r.room_id),
      senderId: String(r.sender_id),
      messageText: String(r.message_text),
      createdAt: String(r.created_at),
    }));
  } else if (sqliteDb) {
    if (afterIso) {
      raw = sqliteDb
        .prepare('SELECT * FROM chat_messages WHERE roomId = ? AND createdAt > ? ORDER BY createdAt ASC')
        .all(roomId, afterIso) as StoredMessage[];
    } else {
      raw = sqliteDb
        .prepare('SELECT * FROM chat_messages WHERE roomId = ? ORDER BY createdAt ASC LIMIT 120')
        .all(roomId) as StoredMessage[];
    }
  } else {
    raw = jsonStore!.chat_messages
      .filter((m) => m.roomId === roomId && (!afterIso || m.createdAt > afterIso))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-120);
  }

  return raw
    .filter((m) => !blockedSet.has(m.senderId))
    .map((m) => {
      const sender = citizenMap[m.senderId];
      return {
        id: m.id,
        roomId: m.roomId,
        senderId: m.senderId,
        senderUsername: sender?.user.username || 'warga',
        senderAvatar: sender?.user.avatarUrl || DEFAULT_AVATAR_URL,
        senderRole: sender?.user.role || 'guest',
        messageText: m.messageText,
        createdAt: m.createdAt,
      };
    });
}

export async function getStoredChatMessageById(messageId: string): Promise<StoredMessage | null> {
  await initDatabase();
  if (pgPool) {
    const res = await pgPool.query('SELECT * FROM chat_messages WHERE id = $1', [messageId]);
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: String(r.id),
      roomId: String(r.room_id),
      senderId: String(r.sender_id),
      messageText: String(r.message_text),
      createdAt: String(r.created_at),
    };
  }
  if (sqliteDb) {
    const r = sqliteDb.prepare('SELECT * FROM chat_messages WHERE id = ?').get(messageId) as
      | StoredMessage
      | undefined;
    return r ?? null;
  }
  return jsonStore!.chat_messages.find((m) => m.id === messageId) ?? null;
}

export async function createChatMessage(
  roomId: string,
  senderId: string,
  messageText: string
): Promise<ChatMessage> {
  await initDatabase();
  const sender = await getStoredUserById(senderId);
  const msg: StoredMessage = {
    id: `msg-${crypto.randomUUID().slice(0, 8)}`,
    roomId,
    senderId,
    messageText: messageText.trim(),
    createdAt: new Date().toISOString(),
  };

  if (pgPool) {
    await pgPool.query(
      `INSERT INTO chat_messages (id, room_id, sender_id, message_text, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [msg.id, msg.roomId, msg.senderId, msg.messageText, msg.createdAt]
    );
  } else if (sqliteDb) {
    sqliteDb
      .prepare(
        `INSERT INTO chat_messages (id, roomId, senderId, messageText, createdAt)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(msg.id, msg.roomId, msg.senderId, msg.messageText, msg.createdAt);
  } else {
    jsonStore!.chat_messages.push(msg);
    saveJsonStore();
  }

  return {
    id: msg.id,
    roomId: msg.roomId,
    senderId: msg.senderId,
    senderUsername: sender?.username || 'warga',
    senderAvatar: sender?.avatarUrl || DEFAULT_AVATAR_URL,
    senderRole: sender?.role || 'guest',
    messageText: msg.messageText,
    createdAt: msg.createdAt,
  };
}

export async function deleteChatMessageById(messageId: string): Promise<string | null> {
  await initDatabase();
  const msg = await getStoredChatMessageById(messageId);
  if (!msg) return null;

  if (pgPool) {
    await pgPool.query('DELETE FROM chat_messages WHERE id = $1', [messageId]);
  } else if (sqliteDb) {
    sqliteDb.prepare('DELETE FROM chat_messages WHERE id = ?').run(messageId);
  } else {
    jsonStore!.chat_messages = jsonStore!.chat_messages.filter((m) => m.id !== messageId);
    saveJsonStore();
  }
  return msg.roomId;
}

// ---------- Reports & Moderation ----------

export async function createReport(input: {
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  targetUserId: string;
  targetSnippet: string;
  category: string;
  reason: string;
}): Promise<ContentReport> {
  await initDatabase();
  const now = new Date().toISOString();
  const stored: StoredReport = {
    id: `rep-${crypto.randomUUID().slice(0, 8)}`,
    reporterId: input.reporterId,
    targetType: input.targetType,
    targetId: input.targetId,
    targetUserId: input.targetUserId,
    targetSnippet: input.targetSnippet.slice(0, 280),
    category: input.category.trim() || 'Pelanggaran Tata Tertib',
    reason: input.reason.trim(),
    status: 'pending',
    resolutionNote: null,
    reviewedBy: null,
    createdAt: now,
    updatedAt: now,
  };

  if (pgPool) {
    await pgPool.query(
      `INSERT INTO reports (id, reporter_id, target_type, target_id, target_user_id, target_snippet, category, reason, status, resolution_note, reviewed_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        stored.id,
        stored.reporterId,
        stored.targetType,
        stored.targetId,
        stored.targetUserId,
        stored.targetSnippet,
        stored.category,
        stored.reason,
        stored.status,
        null,
        null,
        stored.createdAt,
        stored.updatedAt,
      ]
    );
  } else if (sqliteDb) {
    sqliteDb
      .prepare(
        `INSERT INTO reports (id, reporterId, targetType, targetId, targetUserId, targetSnippet, category, reason, status, resolutionNote, reviewedBy, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        stored.id,
        stored.reporterId,
        stored.targetType,
        stored.targetId,
        stored.targetUserId,
        stored.targetSnippet,
        stored.category,
        stored.reason,
        stored.status,
        null,
        null,
        stored.createdAt,
        stored.updatedAt
      );
  } else {
    jsonStore!.reports = jsonStore!.reports || [];
    jsonStore!.reports.unshift(stored);
    saveJsonStore();
  }

  const [reporter, targetUser] = await Promise.all([
    getStoredUserById(stored.reporterId),
    getStoredUserById(stored.targetUserId),
  ]);

  return {
    id: stored.id,
    reporterId: stored.reporterId,
    reporterUsername: reporter?.username || 'warga',
    targetType: stored.targetType,
    targetId: stored.targetId,
    targetUserId: stored.targetUserId,
    targetUsername: targetUser?.username || 'warga',
    targetSnippet: stored.targetSnippet,
    category: stored.category,
    reason: stored.reason,
    status: stored.status,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
  };
}

export async function listReports(): Promise<ContentReport[]> {
  await initDatabase();
  const citizens = await listCitizens();
  const userMap: Record<string, string> = {};
  for (const c of citizens) userMap[c.user.id] = c.user.username;

  let raw: StoredReport[] = [];
  if (pgPool) {
    const res = await pgPool.query('SELECT * FROM reports ORDER BY created_at DESC');
    raw = res.rows.map((r) => ({
      id: String(r.id),
      reporterId: String(r.reporter_id),
      targetType: String(r.target_type) as ReportTargetType,
      targetId: String(r.target_id),
      targetUserId: String(r.target_user_id),
      targetSnippet: String(r.target_snippet),
      category: String(r.category),
      reason: String(r.reason),
      status: String(r.status) as ReportStatus,
      resolutionNote: r.resolution_note ? String(r.resolution_note) : null,
      reviewedBy: r.reviewed_by ? String(r.reviewed_by) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  } else if (sqliteDb) {
    raw = sqliteDb
      .prepare('SELECT * FROM reports ORDER BY createdAt DESC')
      .all() as StoredReport[];
  } else {
    raw = [...(jsonStore!.reports || [])].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }

  return raw.map((r) => ({
    id: r.id,
    reporterId: r.reporterId,
    reporterUsername: userMap[r.reporterId] || 'warga',
    targetType: r.targetType,
    targetId: r.targetId,
    targetUserId: r.targetUserId,
    targetUsername: userMap[r.targetUserId] || 'warga',
    targetSnippet: r.targetSnippet,
    category: r.category,
    reason: r.reason,
    status: r.status,
    resolutionNote: r.resolutionNote || undefined,
    reviewedBy: r.reviewedBy || undefined,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function getReportById(reportId: string): Promise<ContentReport | null> {
  const all = await listReports();
  return all.find((r) => r.id === reportId) ?? null;
}

export async function updateReportStatus(
  reportId: string,
  status: ReportStatus,
  reviewedBy: string,
  resolutionNote?: string
): Promise<ContentReport | null> {
  await initDatabase();
  const updatedAt = new Date().toISOString();
  const note = resolutionNote?.trim() || null;

  if (pgPool) {
    await pgPool.query(
      'UPDATE reports SET status = $1, resolution_note = $2, reviewed_by = $3, updated_at = $4 WHERE id = $5',
      [status, note, reviewedBy, updatedAt, reportId]
    );
  } else if (sqliteDb) {
    sqliteDb
      .prepare(
        'UPDATE reports SET status = ?, resolutionNote = ?, reviewedBy = ?, updatedAt = ? WHERE id = ?'
      )
      .run(status, note, reviewedBy, updatedAt, reportId);
  } else {
    const idx = (jsonStore!.reports || []).findIndex((r) => r.id === reportId);
    if (idx !== -1) {
      jsonStore!.reports![idx].status = status;
      jsonStore!.reports![idx].resolutionNote = note;
      jsonStore!.reports![idx].reviewedBy = reviewedBy;
      jsonStore!.reports![idx].updatedAt = updatedAt;
      saveJsonStore();
    }
  }
  return getReportById(reportId);
}

// ---------- Satirical Court Appeals (Pledoi -> Replik -> Duplik -> Kasasi) ----------

function mapAppealRow(
  r: Record<string, unknown>,
  camelCase: boolean,
  citizenMap: Record<string, CitizenRecord>
): ModerationAppeal {
  const userId = String(camelCase ? r.userId : r.user_id);
  const citizen = citizenMap[userId];
  return {
    id: String(r.id),
    userId,
    username: citizen?.user.username || 'warga',
    avatarUrl: citizen?.user.avatarUrl || DEFAULT_AVATAR_URL,
    suspendedReason: citizen?.user.suspendedReason,
    stage: String(r.stage) as AppealStage,
    pledoiText: String(camelCase ? r.pledoiText : r.pledoi_text),
    replikText: (camelCase ? r.replikText : r.replik_text)
      ? String(camelCase ? r.replikText : r.replik_text)
      : undefined,
    duplikText: (camelCase ? r.duplikText : r.duplik_text)
      ? String(camelCase ? r.duplikText : r.duplik_text)
      : undefined,
    kasasiText: (camelCase ? r.kasasiText : r.kasasi_text)
      ? String(camelCase ? r.kasasiText : r.kasasi_text)
      : undefined,
    adminVerdictNote: (camelCase ? r.adminVerdictNote : r.admin_verdict_note)
      ? String(camelCase ? r.adminVerdictNote : r.admin_verdict_note)
      : undefined,
    reviewedBy: (camelCase ? r.reviewedBy : r.reviewed_by)
      ? String(camelCase ? r.reviewedBy : r.reviewed_by)
      : undefined,
    createdAt: String(camelCase ? r.createdAt : r.created_at),
    updatedAt: String(camelCase ? r.updatedAt : r.updated_at),
  };
}

export async function listAppeals(filterUserId?: string): Promise<ModerationAppeal[]> {
  await initDatabase();
  const citizens = await listCitizens();
  const citizenMap: Record<string, CitizenRecord> = {};
  for (const c of citizens) citizenMap[c.user.id] = c;

  if (pgPool) {
    const res = filterUserId
      ? await pgPool.query(
          'SELECT * FROM moderation_appeals WHERE user_id = $1 ORDER BY updated_at DESC',
          [filterUserId]
        )
      : await pgPool.query('SELECT * FROM moderation_appeals ORDER BY updated_at DESC');
    return res.rows.map((r) => mapAppealRow(r, false, citizenMap));
  }
  if (sqliteDb) {
    const rows = (
      filterUserId
        ? sqliteDb
            .prepare('SELECT * FROM moderation_appeals WHERE userId = ? ORDER BY updatedAt DESC')
            .all(filterUserId)
        : sqliteDb.prepare('SELECT * FROM moderation_appeals ORDER BY updatedAt DESC').all()
    ) as Record<string, unknown>[];
    return rows.map((r) => mapAppealRow(r, true, citizenMap));
  }
  return (jsonStore!.moderation_appeals || [])
    .filter((a) => !filterUserId || a.userId === filterUserId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((a) =>
      mapAppealRow(a as unknown as Record<string, unknown>, true, citizenMap)
    );
}

export async function getAppealById(appealId: string): Promise<ModerationAppeal | null> {
  const all = await listAppeals();
  return all.find((a) => a.id === appealId) ?? null;
}

export async function createUserAppeal(
  userId: string,
  pledoiText: string
): Promise<ModerationAppeal> {
  await initDatabase();
  const now = new Date().toISOString();
  const stored: StoredAppeal = {
    id: `apl-${crypto.randomUUID().slice(0, 8)}`,
    userId,
    stage: 'pledoi',
    pledoiText: pledoiText.trim(),
    createdAt: now,
    updatedAt: now,
  };

  if (pgPool) {
    await pgPool.query(
      `INSERT INTO moderation_appeals (id, user_id, stage, pledoi_text, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [stored.id, stored.userId, stored.stage, stored.pledoiText, stored.createdAt, stored.updatedAt]
    );
  } else if (sqliteDb) {
    sqliteDb
      .prepare(
        `INSERT INTO moderation_appeals (id, userId, stage, pledoiText, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        stored.id,
        stored.userId,
        stored.stage,
        stored.pledoiText,
        stored.createdAt,
        stored.updatedAt
      );
  } else {
    jsonStore!.moderation_appeals = jsonStore!.moderation_appeals || [];
    jsonStore!.moderation_appeals.unshift(stored);
    saveJsonStore();
  }
  return (await getAppealById(stored.id))!;
}

export async function updateAppealRecord(
  appealId: string,
  updates: {
    stage: AppealStage;
    replikText?: string;
    duplikText?: string;
    kasasiText?: string;
    adminVerdictNote?: string;
    reviewedBy?: string;
  }
): Promise<ModerationAppeal | null> {
  await initDatabase();
  const current = await getAppealById(appealId);
  if (!current) return null;
  const updatedAt = new Date().toISOString();

  const nextReplik = updates.replikText !== undefined ? updates.replikText : current.replikText ?? null;
  const nextDuplik = updates.duplikText !== undefined ? updates.duplikText : current.duplikText ?? null;
  const nextKasasi = updates.kasasiText !== undefined ? updates.kasasiText : current.kasasiText ?? null;
  const nextNote =
    updates.adminVerdictNote !== undefined
      ? updates.adminVerdictNote
      : current.adminVerdictNote ?? null;
  const nextReviewer =
    updates.reviewedBy !== undefined ? updates.reviewedBy : current.reviewedBy ?? null;

  if (pgPool) {
    await pgPool.query(
      `UPDATE moderation_appeals
       SET stage = $1, replik_text = $2, duplik_text = $3, kasasi_text = $4, admin_verdict_note = $5, reviewed_by = $6, updated_at = $7
       WHERE id = $8`,
      [
        updates.stage,
        nextReplik,
        nextDuplik,
        nextKasasi,
        nextNote,
        nextReviewer,
        updatedAt,
        appealId,
      ]
    );
  } else if (sqliteDb) {
    sqliteDb
      .prepare(
        `UPDATE moderation_appeals
         SET stage = ?, replikText = ?, duplikText = ?, kasasiText = ?, adminVerdictNote = ?, reviewedBy = ?, updatedAt = ?
         WHERE id = ?`
      )
      .run(
        updates.stage,
        nextReplik,
        nextDuplik,
        nextKasasi,
        nextNote,
        nextReviewer,
        updatedAt,
        appealId
      );
  } else {
    const idx = (jsonStore!.moderation_appeals || []).findIndex((a) => a.id === appealId);
    if (idx !== -1) {
      jsonStore!.moderation_appeals![idx] = {
        ...jsonStore!.moderation_appeals![idx],
        stage: updates.stage,
        replikText: nextReplik,
        duplikText: nextDuplik,
        kasasiText: nextKasasi,
        adminVerdictNote: nextNote,
        reviewedBy: nextReviewer,
        updatedAt,
      };
      saveJsonStore();
    }
  }
  return getAppealById(appealId);
}

// ---------- Map Pins ----------

export async function listMapPins(mode?: LocationType): Promise<MapPinItem[]> {
  await initDatabase();
  const citizens = await listCitizens();
  const nameMap: Record<string, string> = {};
  for (const c of citizens) nameMap[c.user.id] = c.user.username;

  let pins: MapPinItem[] = [];
  if (pgPool) {
    const res = mode
      ? await pgPool.query('SELECT * FROM map_pins WHERE mode = $1 ORDER BY created_at DESC', [
          mode,
        ])
      : await pgPool.query('SELECT * FROM map_pins ORDER BY created_at DESC');
    pins = res.rows.map((r) => ({
      id: String(r.id),
      authorId: String(r.author_id),
      authorUsername: nameMap[String(r.author_id)] || 'warga',
      title: String(r.title),
      description: String(r.description),
      gameTag: String(r.game_tag),
      mode: String(r.mode) as LocationType,
      lat: r.lat !== null && r.lat !== undefined ? Number(r.lat) : undefined,
      lng: r.lng !== null && r.lng !== undefined ? Number(r.lng) : undefined,
      realmId: r.realm_id ? String(r.realm_id) : undefined,
      realmX: r.realm_x !== null && r.realm_x !== undefined ? Number(r.realm_x) : undefined,
      realmY: r.realm_y !== null && r.realm_y !== undefined ? Number(r.realm_y) : undefined,
      placeUri: r.place_uri ? String(r.place_uri) : undefined,
      createdAt: String(r.created_at),
    }));
  } else if (sqliteDb) {
    const rows = (
      mode
        ? sqliteDb.prepare('SELECT * FROM map_pins WHERE mode = ? ORDER BY createdAt DESC').all(mode)
        : sqliteDb.prepare('SELECT * FROM map_pins ORDER BY createdAt DESC').all()
    ) as Record<string, unknown>[];
    pins = rows.map((r) => ({
      id: String(r.id),
      authorId: String(r.authorId),
      authorUsername: nameMap[String(r.authorId)] || 'warga',
      title: String(r.title),
      description: String(r.description),
      gameTag: String(r.gameTag),
      mode: String(r.mode) as LocationType,
      lat: r.lat !== null && r.lat !== undefined ? Number(r.lat) : undefined,
      lng: r.lng !== null && r.lng !== undefined ? Number(r.lng) : undefined,
      realmId: r.realmId ? String(r.realmId) : undefined,
      realmX: r.realmX !== null && r.realmX !== undefined ? Number(r.realmX) : undefined,
      realmY: r.realmY !== null && r.realmY !== undefined ? Number(r.realmY) : undefined,
      placeUri: r.placeUri ? String(r.placeUri) : undefined,
      createdAt: String(r.createdAt),
    }));
  } else {
    pins = jsonStore!.map_pins
      .filter((p) => !mode || p.mode === mode)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((p) => ({
        ...p,
        authorUsername: nameMap[p.authorId] || p.authorUsername || 'warga',
      }));
  }
  return pins;
}

export async function createMapPin(input: {
  authorId: string;
  title: string;
  description: string;
  gameTag: string;
  mode: LocationType;
  lat?: number;
  lng?: number;
  realmId?: string;
  realmX?: number;
  realmY?: number;
  placeUri?: string;
}): Promise<MapPinItem> {
  await initDatabase();
  const author = await getStoredUserById(input.authorId);
  const pin: MapPinItem = {
    id: `pin-${crypto.randomUUID().slice(0, 8)}`,
    authorId: input.authorId,
    authorUsername: author?.username || 'warga',
    title: input.title.trim(),
    description: input.description.trim(),
    gameTag: input.gameTag.trim() || 'Komunitas',
    mode: input.mode,
    lat: input.lat,
    lng: input.lng,
    realmId: input.realmId,
    realmX: input.realmX,
    realmY: input.realmY,
    placeUri: input.placeUri,
    createdAt: new Date().toISOString(),
  };

  if (pgPool) {
    await pgPool.query(
      `INSERT INTO map_pins (id, author_id, title, description, game_tag, mode, lat, lng, realm_id, realm_x, realm_y, place_uri, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        pin.id,
        pin.authorId,
        pin.title,
        pin.description,
        pin.gameTag,
        pin.mode,
        pin.lat ?? null,
        pin.lng ?? null,
        pin.realmId ?? null,
        pin.realmX ?? null,
        pin.realmY ?? null,
        pin.placeUri ?? null,
        pin.createdAt,
      ]
    );
  } else if (sqliteDb) {
    sqliteDb
      .prepare(
        `INSERT INTO map_pins (id, authorId, title, description, gameTag, mode, lat, lng, realmId, realmX, realmY, placeUri, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        pin.id,
        pin.authorId,
        pin.title,
        pin.description,
        pin.gameTag,
        pin.mode,
        pin.lat ?? null,
        pin.lng ?? null,
        pin.realmId ?? null,
        pin.realmX ?? null,
        pin.realmY ?? null,
        pin.placeUri ?? null,
        pin.createdAt
      );
  } else {
    jsonStore!.map_pins.unshift(pin);
    saveJsonStore();
  }
  return pin;
}

export async function deleteMapPin(
  pinId: string,
  requesterId: string,
  requesterRole: UserRole
): Promise<boolean> {
  await initDatabase();
  const canModerate = requesterRole === 'admin' || requesterRole === 'superadmin';
  if (pgPool) {
    const res = await pgPool.query<{ author_id: string }>(
      'SELECT author_id FROM map_pins WHERE id = $1',
      [pinId]
    );
    if (!res.rows[0]) return false;
    if (res.rows[0].author_id !== requesterId && !canModerate) return false;
    await pgPool.query('DELETE FROM map_pins WHERE id = $1', [pinId]);
    return true;
  }
  if (sqliteDb) {
    const row = sqliteDb.prepare('SELECT authorId FROM map_pins WHERE id = ?').get(pinId) as
      | { authorId: string }
      | undefined;
    if (!row) return false;
    if (row.authorId !== requesterId && !canModerate) return false;
    sqliteDb.prepare('DELETE FROM map_pins WHERE id = ?').run(pinId);
    return true;
  }
  const idx = jsonStore!.map_pins.findIndex((p) => p.id === pinId);
  if (idx === -1) return false;
  if (jsonStore!.map_pins[idx].authorId !== requesterId && !canModerate) return false;
  jsonStore!.map_pins.splice(idx, 1);
  saveJsonStore();
  return true;
}

export async function createPasswordResetToken(
  email: string
): Promise<{ token: string; username: string } | null> {
  await initDatabase();
  const norm = email.trim().toLowerCase();
  let user: StoredUser | null = null;
  if (pgPool) {
    const res = await pgPool.query('SELECT * FROM users WHERE LOWER(email) = $1', [norm]);
    if (res.rows[0]) user = mapPgUser(res.rows[0]);
  } else if (sqliteDb) {
    const row = sqliteDb
      .prepare('SELECT * FROM users WHERE LOWER(email) = ?')
      .get(norm) as Record<string, unknown> | undefined;
    if (row) user = mapSqliteUser(row);
  } else {
    user = jsonStore!.users.find((u) => u.email?.toLowerCase() === norm) ?? null;
  }
  if (!user) return null;

  const token = `JMK-RST-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();
  if (pgPool) {
    await pgPool.query(
      'INSERT INTO password_resets (token, user_id, expires_at) VALUES ($1, $2, $3)',
      [token, user.id, expiresAt]
    );
  } else if (sqliteDb) {
    sqliteDb
      .prepare('INSERT INTO password_resets (token, userId, expiresAt) VALUES (?, ?, ?)')
      .run(token, user.id, expiresAt);
  } else {
    jsonStore!.password_resets.push({ token, userId: user.id, expiresAt });
    saveJsonStore();
  }
  return { token, username: user.username };
}

export async function consumePasswordResetToken(
  token: string,
  newPasswordHash: string
): Promise<boolean> {
  await initDatabase();
  const now = new Date().toISOString();
  if (pgPool) {
    const res = await pgPool.query<{ token: string; user_id: string; expires_at: string }>(
      'SELECT * FROM password_resets WHERE token = $1',
      [token.trim()]
    );
    const row = res.rows[0];
    if (!row || row.expires_at < now) return false;
    await pgPool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
      newPasswordHash,
      row.user_id,
    ]);
    await pgPool.query('DELETE FROM password_resets WHERE token = $1', [row.token]);
    return true;
  }
  if (sqliteDb) {
    const row = sqliteDb
      .prepare('SELECT * FROM password_resets WHERE token = ?')
      .get(token.trim()) as StoredReset | undefined;
    if (!row || row.expiresAt < now) return false;
    sqliteDb
      .prepare('UPDATE users SET passwordHash = ? WHERE id = ?')
      .run(newPasswordHash, row.userId);
    sqliteDb.prepare('DELETE FROM password_resets WHERE token = ?').run(row.token);
    return true;
  }
  const idx = jsonStore!.password_resets.findIndex((r) => r.token === token.trim());
  if (idx === -1) return false;
  const rec = jsonStore!.password_resets[idx];
  if (rec.expiresAt < now) return false;
  const uIdx = jsonStore!.users.findIndex((u) => u.id === rec.userId);
  if (uIdx !== -1) {
    jsonStore!.users[uIdx].passwordHash = newPasswordHash;
  }
  jsonStore!.password_resets.splice(idx, 1);
  saveJsonStore();
  return true;
}

export async function exportDatabaseSnapshot(): Promise<Record<string, unknown>> {
  await initDatabase();
  return {
    exportedAt: new Date().toISOString(),
    driver: activeDriver,
    citizens: await listCitizens(),
    posts: await listPosts(),
    chatRooms: await listAllChatRoomsRaw(),
    mapPins: await listMapPins(),
    reports: await listReports(),
    moderationAppeals: await listAppeals(),
  };
}
