import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { AI_ASPECT_RATIOS, type AiAspectRatio } from '../src/shared/types.ts';

function resolveGeminiApiKey(): string {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    ''
  ).trim();
}

function getAiClient(timeoutMs = 20000): GoogleGenAI {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY belum terbaca di environment server. Pastikan GEMINI_API_KEY sudah ditambahkan di Vercel Environment Variables lalu Redeploy.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function hasConfiguredGeminiKey(): boolean {
  return Boolean(resolveGeminiApiKey());
}

export function formatGeminiError(err: unknown): { status: number; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('GEMINI_API_KEY belum terbaca')) {
    return { status: 503, message: msg };
  }
  if (msg.includes('404') || msg.includes('NOT_FOUND')) {
    return {
      status: 404,
      message:
        'Model Gemini tidak ditemukan atau tidak didukung pada API ini. Pastikan model aktif (gemini-4-hydrogen / gemini-3.1-flash-lite / gemini-3.1-flash-lite-image / gemini-3-pro-image) digunakan.',
    };
  }
  if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message:
        'API key Gemini tidak valid atau belum memiliki izin. Periksa GEMINI_API_KEY di Vercel Environment Variables atau Settings > Secrets.',
    };
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
    return {
      status: 429,
      message:
        'Kuota model Gemini tercapai atau API key berada di Free Tier. Model gambar (Nano Banana / Pro Image) dan sebagian kuota Maps Grounding membutuhkan API key dengan billing aktif di Google AI Studio.',
    };
  }
  if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
    return {
      status: 503,
      message:
        'Layanan Gemini sedang padat sementara (503 UNAVAILABLE). Silakan coba kirim ulang beberapa detik lagi.',
    };
  }
  if (
    (err instanceof Error && err.name === 'AbortError') ||
    msg.includes('AbortError') ||
    msg.includes('aborted') ||
    msg.includes('timeout') ||
    msg.includes('ETIMEDOUT')
  ) {
    return {
      status: 504,
      message: 'Permintaan ke Gemini AI melebihi batas waktu. Silakan coba kirim ulang.',
    };
  }
  return {
    status: 500,
    message: `Gagal memanggil Gemini API: ${msg}`,
  };
}

function isRetryableChatError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    (err instanceof Error && err.name === 'AbortError') ||
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('AbortError') ||
    msg.includes('aborted') ||
    msg.includes('timeout')
  );
}

function buildCivicSystemInstruction(citizenContext?: {
  username?: string;
  locationName?: string;
  role?: string;
}): string {
  const contextNote = citizenContext?.username
    ? `Pengguna saat ini: ${citizenContext.username} (Peran: ${citizenContext.role || 'guest'}, Domisili: ${citizenContext.locationName || 'NGAWI'}).`
    : 'Pengguna saat ini adalah pengunjung publik.';

  return [
    'Kamu adalah "Bupati AI Republik Jomokerto", asisten resmi portal komunitas hiburan Republik Jomokerto.',
    'Nada bicara: santai, jenaka, sopan ala pejabat kecamatan kreatif yang paham budaya internet Indonesia dan lore game (seperti Genshin Impact Sumeru/Mondstadt, GTA, Mobile Legends, dll).',
    'Bantu warga membuat motto KTP yang lucu, menyarankan ide postingan timeline, atau menjawab pertanyaan tentang fitur portal (KTP Template, Peta Hybrid Ngawi & Dunia Fiktif, Chat Real-time).',
    'Jawab dalam Bahasa Indonesia yang ringkas dan jelas (maksimal 2-3 paragraf singkat agar respons cepat).',
    contextNote,
  ].join(' ');
}

function sanitizeHistory(
  history: Array<{ role: 'user' | 'model'; text: string }>
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  const cleaned = history
    .filter((h) => (h.role === 'user' || h.role === 'model') && typeof h.text === 'string' && h.text.trim())
    .slice(-10);

  const firstUserIdx = cleaned.findIndex((h) => h.role === 'user');
  if (firstUserIdx === -1) return [];

  return cleaned.slice(firstUserIdx).map((h) => ({
    role: h.role,
    parts: [{ text: h.text.trim() }],
  }));
}

export async function runCivicAiChat(
  history: Array<{ role: 'user' | 'model'; text: string }>,
  message: string,
  citizenContext?: { username?: string; locationName?: string; role?: string }
): Promise<{ reply: string; modelUsed: string }> {
  const attempts: Array<{ model: string; thinkingLevel: ThinkingLevel; timeoutMs: number }> = [
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, timeoutMs: 12000 },
    { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL, timeoutMs: 14000 },
  ];

  let lastErr: unknown;
  for (const cfg of attempts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      const ai = getAiClient(cfg.timeoutMs);
      const chat = ai.chats.create({
        model: cfg.model,
        history: sanitizeHistory(history),
        config: {
          systemInstruction: buildCivicSystemInstruction(citizenContext),
          thinkingConfig: { thinkingLevel: cfg.thinkingLevel },
          abortSignal: controller.signal,
        },
      });
      const response = await chat.sendMessage({
        message,
        config: { abortSignal: controller.signal },
      });
      clearTimeout(timer);
      return {
        reply: response.text || 'Maaf warga, mikrofon balai desa sedang berdesis. Coba tanya lagi.',
        modelUsed: cfg.model,
      };
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (!isRetryableChatError(err)) {
        throw err;
      }
    }
  }

  throw lastErr;
}

export async function* streamCivicAiChat(
  history: Array<{ role: 'user' | 'model'; text: string }>,
  message: string,
  citizenContext?: { username?: string; locationName?: string; role?: string }
): AsyncGenerator<string, void, unknown> {
  const attempts: Array<{ model: string; thinkingLevel: ThinkingLevel; timeoutMs: number }> = [
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, timeoutMs: 12000 },
    { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL, timeoutMs: 14000 },
  ];

  let lastErr: unknown;
  for (const cfg of attempts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    let yieldedAny = false;
    try {
      const ai = getAiClient(cfg.timeoutMs);
      const chat = ai.chats.create({
        model: cfg.model,
        history: sanitizeHistory(history),
        config: {
          systemInstruction: buildCivicSystemInstruction(citizenContext),
          thinkingConfig: { thinkingLevel: cfg.thinkingLevel },
          abortSignal: controller.signal,
        },
      });
      const stream = await chat.sendMessageStream({
        message,
        config: { abortSignal: controller.signal },
      });
      for await (const chunk of stream) {
        if (chunk.text) {
          yieldedAny = true;
          clearTimeout(timer);
          yield chunk.text;
        }
      }
      clearTimeout(timer);
      return;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (yieldedAny || !isRetryableChatError(err)) {
        throw err;
      }
    }
  }

  throw lastErr;
}

export interface GroundedPlaceLink {
  title: string;
  uri: string;
  reviewSnippets?: string[];
}

export async function runMapsGroundingSearch(
  query: string,
  coords?: { latitude: number; longitude: number }
): Promise<{ answer: string; places: GroundedPlaceLink[] }> {
  const timeoutMs = 18000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const ai = getAiClient(timeoutMs);
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: query,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        abortSignal: controller.signal,
        tools: [{ googleMaps: {} }],
        ...(coords
          ? {
              toolConfig: {
                retrievalConfig: {
                  latLng: {
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                  },
                },
              },
            }
          : {}),
      },
    });

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const places: GroundedPlaceLink[] = [];
    for (const chunk of chunks) {
      const mapsInfo = (
        chunk as {
          maps?: {
            uri?: string;
            title?: string;
            placeAnswerSources?: {
              reviewSnippets?: Array<{ content?: string }>;
            };
          };
        }
      ).maps;
      if (mapsInfo?.uri) {
        places.push({
          title: mapsInfo.title || 'Lokasi Google Maps',
          uri: mapsInfo.uri,
          reviewSnippets: mapsInfo.placeAnswerSources?.reviewSnippets
            ?.map((s) => s.content)
            .filter((s): s is string => Boolean(s)),
        });
      }
    }

    return {
      answer: response.text || 'Berikut hasil pencarian lokasi Google Maps.',
      places,
    };
  } finally {
    clearTimeout(timer);
  }
}

export type AiImageQuality = 'lite' | 'standard' | 'studio';

export async function generateAiImage(input: {
  prompt: string;
  aspectRatio: string;
  quality?: AiImageQuality;
}): Promise<{ imageDataUrl: string; modelUsed: string; caption?: string }> {
  const timeoutMs = 35000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const ai = getAiClient(timeoutMs);
    const validRatio: AiAspectRatio = AI_ASPECT_RATIOS.includes(input.aspectRatio as AiAspectRatio)
      ? (input.aspectRatio as AiAspectRatio)
      : '1:1';

    const model =
      input.quality === 'studio'
        ? 'gemini-3-pro-image'
        : input.quality === 'standard'
          ? 'gemini-nano-banana-2.1'
          : 'gemini-3.1-flash-lite-image';

    const supportsImageSize =
      model === 'gemini-3-pro-image' || model === 'gemini-nano-banana-2.1';

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [{ text: input.prompt }],
      },
      config: {
        abortSignal: controller.signal,
        imageConfig: {
          aspectRatio: validRatio,
          ...(supportsImageSize ? { imageSize: '1K' } : {}),
        },
      },
    });

    let imageDataUrl = '';
    let caption = '';

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType ?? 'image/png';
        imageDataUrl = `data:${mime};base64,${part.inlineData.data}`;
      } else if (part.text) {
        caption += part.text;
      }
    }

    if (!imageDataUrl) {
      throw new Error('Model tidak mengembalikan data gambar. Coba perjelas prompt gambar.');
    }

    return {
      imageDataUrl,
      modelUsed: model,
      caption: caption.trim() || undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}
