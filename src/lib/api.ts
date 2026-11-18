import { ALLOWED_IMAGE_MIME_TYPES } from '../shared/types';

const TOKEN_STORAGE_KEY = 'jomok_auth_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

export interface ApiFetchOptions extends RequestInit {
  timeoutMs?: number;
}

export async function apiFetch<T>(url: string, init: ApiFetchOptions = {}): Promise<T> {
  const { timeoutMs = 25000, signal: externalSignal, ...restInit } = init;
  const token = getStoredToken();
  const headers = new Headers(restInit.headers);
  if (!headers.has('Content-Type') && restInit.body && typeof restInit.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  if (externalSignal) {
    externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(url, {
      ...restInit,
      headers,
      credentials: 'include',
      signal: controller.signal,
    });

    const rawText = await res.text();
    let data = {} as T & { error?: string };
    try {
      data = rawText ? (JSON.parse(rawText) as T & { error?: string }) : ({} as T & { error?: string });
    } catch {
      if (!res.ok) {
        if (res.status === 504) {
          throw new Error(
            'Server Vercel melewati batas waktu respons (504 Gateway Timeout). Silakan coba ulang.'
          );
        }
        throw new Error(`Server mengembalikan respons non-JSON (${res.status}).`);
      }
    }

    if (!res.ok) {
      throw new Error(data.error || `Permintaan gagal (${res.status})`);
    }
    return data;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        `Permintaan melebihi batas waktu (${Math.round(timeoutMs / 1000)} detik). Silakan coba lagi.`
      );
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function streamAiChat(
  payload: {
    history: Array<{ role: 'user' | 'model'; text: string }>;
    message: string;
  },
  onChunk: (chunkText: string) => void,
  timeoutMs = 28000
): Promise<void> {
  const token = getStoredToken();
  const headers = new Headers({
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  });
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const controller = new AbortController();
  let timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const resetTimer = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => controller.abort(), timeoutMs);
  };

  try {
    const res = await fetch('/api/ai/chat/stream', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok) {
      const errText = await res.text();
      let parsedMsg = '';
      try {
        parsedMsg = (JSON.parse(errText) as { error?: string }).error || '';
      } catch {
        // non-JSON response
      }
      if (res.status === 504) {
        throw new Error(
          'Server Vercel melewati batas waktu (504). Coba kirim pertanyaan yang lebih singkat.'
        );
      }
      throw new Error(parsedMsg || `Gagal menghubungi Bupati AI (${res.status}).`);
    }

    if (!contentType.includes('text/event-stream') || !res.body) {
      const fallback = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (fallback.error) throw new Error(fallback.error);
      if (fallback.reply) {
        onChunk(fallback.reply);
        return;
      }
      throw new Error('Server tidak mengembalikan aliran SSE yang valid.');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      resetTimer();
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const rawEvent of events) {
        for (const line of rawEvent.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonPart = trimmed.slice(5).trim();
          if (!jsonPart) continue;
          const evt = JSON.parse(jsonPart) as {
            type?: string;
            text?: string;
            error?: string;
          };
          if (evt.type === 'error') {
            throw new Error(evt.error || 'Terjadi kesalahan saat memproses jawaban AI.');
          }
          if (evt.type === 'chunk' && evt.text) {
            onChunk(evt.text);
          }
        }
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        `Koneksi Bupati AI terhenti melebihi ${Math.round(timeoutMs / 1000)} detik. Silakan coba kirim ulang.`
      );
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

export function readImageFileAsDataUrl(
  file: File
): Promise<{ dataUrl: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const mime = file.type.toLowerCase();
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(mime as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
      reject(
        new Error(
          `Format "${file.type || file.name}" tidak diizinkan. Hanya gambar (${ALLOWED_IMAGE_MIME_TYPES.join(', ')}) yang didukung.`
        )
      );
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('Ukuran gambar maksimal 5 MB.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve({ dataUrl: reader.result, mimeType: mime });
      } else {
        reject(new Error('Gagal membaca file gambar.'));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });
}

export function formatDateId(iso: string): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatTimeId(iso: string): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}
