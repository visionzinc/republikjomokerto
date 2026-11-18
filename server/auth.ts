import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { PublicUser, UserRole } from '../src/shared/types.ts';

const SESSION_SECRET =
  process.env.SESSION_SECRET || 'republik-jomokerto-dev-secret-change-in-prod';

export const COOKIE_NAME = 'jomok_session';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  try {
    const keyBuf = Buffer.from(keyHex, 'hex');
    const derived = crypto.scryptSync(password, salt, 64);
    if (keyBuf.length !== derived.length) return false;
    return crypto.timingSafeEqual(keyBuf, derived);
  } catch {
    return false;
  }
}

export interface SessionPayload {
  userId: string;
  username: string;
  role: UserRole;
  exp: number;
}

export function signSessionToken(user: Pick<PublicUser, 'id' | 'username' | 'role'>): string {
  const payload: SessionPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  };
  const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  if (!data || !sig) return null;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function extractTokenFromRequest(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    for (const part of cookieHeader.split(';')) {
      const [k, ...rest] = part.trim().split('=');
      if (k === COOKIE_NAME) {
        return decodeURIComponent(rest.join('='));
      }
    }
  }
  return undefined;
}

export interface AuthenticatedRequest extends Request {
  sessionUser?: SessionPayload;
}

export function attachSession(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const token = extractTokenFromRequest(req);
  const payload = verifySessionToken(token);
  if (payload) {
    req.sessionUser = payload;
  }
  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.sessionUser) {
    res.status(401).json({ error: 'Silakan masuk terlebih dahulu untuk mengakses fitur ini.' });
    return;
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.sessionUser) {
      res.status(401).json({ error: 'Autentikasi diperlukan.' });
      return;
    }
    if (!roles.includes(req.sessionUser.role)) {
      res.status(403).json({
        error: `Akses ditolak. Memerlukan peran: ${roles.join(', ')}.`,
      });
      return;
    }
    next();
  };
}

export async function verifyGoogleCredential(idToken: string): Promise<{
  sub: string;
  email: string;
  name: string;
  picture?: string;
} | null> {
  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      sub?: string;
      email?: string;
      name?: string;
      picture?: string;
      aud?: string;
    };
    const configuredClientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
    if (configuredClientId && data.aud && data.aud !== configuredClientId) {
      return null;
    }
    if (!data.sub || !data.email) return null;
    return {
      sub: data.sub,
      email: data.email,
      name: data.name || data.email.split('@')[0],
      picture: data.picture,
    };
  } catch {
    return null;
  }
}
