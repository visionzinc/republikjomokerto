import http from 'node:http';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createApp } from './server/app.ts';
import { verifySessionToken } from './server/auth.ts';
import {
  createChatMessage,
  getStoredUserById,
  isBlockedBetween,
  listChatRooms,
} from './server/db.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

interface WsClientMeta {
  ws: WebSocket;
  userId?: string;
  username?: string;
  roomId: string;
}

const clients = new Set<WsClientMeta>();

function broadcastToRoom(roomId: string, payload: unknown): void {
  const encoded = JSON.stringify(payload);
  for (const client of clients) {
    if (client.roomId === roomId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(encoded);
    }
  }
}

function broadcastPresence(roomId: string): void {
  const activeUsers = Array.from(clients)
    .filter((c) => c.roomId === roomId && c.username)
    .map((c) => c.username!);
  broadcastToRoom(roomId, {
    type: 'presence:update',
    roomId,
    activeUsers: Array.from(new Set(activeUsers)),
  });
}

async function bootstrap(): Promise<void> {
  const app = createApp((roomId: string, payload: Record<string, unknown>) => {
    broadcastToRoom(roomId, payload);
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const reqUrl = new URL(req.url || '/ws', `http://${req.headers.host || 'localhost'}`);
    const token = reqUrl.searchParams.get('token') || undefined;
    const session = verifySessionToken(token);

    const meta: WsClientMeta = {
      ws,
      userId: session?.userId,
      username: session?.username,
      roomId: reqUrl.searchParams.get('roomId') || 'room-alun-alun',
    };
    clients.add(meta);
    broadcastPresence(meta.roomId);

    ws.on('message', async (raw) => {
      try {
        const event = JSON.parse(raw.toString()) as {
          type?: string;
          roomId?: string;
          messageText?: string;
          token?: string;
        };

        if (event.type === 'auth' && event.token) {
          const verified = verifySessionToken(event.token);
          if (verified) {
            meta.userId = verified.userId;
            meta.username = verified.username;
            broadcastPresence(meta.roomId);
          }
          return;
        }

        if (event.type === 'room:join' && event.roomId) {
          const prevRoom = meta.roomId;
          meta.roomId = event.roomId;
          broadcastPresence(prevRoom);
          broadcastPresence(meta.roomId);
          return;
        }

        if (event.type === 'message:send' && event.roomId && event.messageText?.trim()) {
          if (!meta.userId) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'Silakan masuk terlebih dahulu untuk mengirim pesan.',
              })
            );
            return;
          }
          const user = await getStoredUserById(meta.userId);
          if (!user || user.accountStatus === 'suspended') {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'Akun Anda sedang ditangguhkan dan tidak dapat mengirim pesan.',
              })
            );
            return;
          }
          const allowedRooms = await listChatRooms(meta.userId);
          const room = allowedRooms.find((r) => r.id === event.roomId);
          if (!room) {
            ws.send(JSON.stringify({ type: 'error', message: 'Akses ruang chat ditolak.' }));
            return;
          }
          if (room.isArchived) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'Grup ini sedang diarsipkan (read-only).',
              })
            );
            return;
          }
          if (room.type === 'dm') {
            const otherId = room.participants?.find((id) => id !== meta.userId);
            if (otherId && (await isBlockedBetween(meta.userId, otherId))) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  message: 'DM tidak dapat dikirim karena salah satu pihak memblokir akun.',
                })
              );
              return;
            }
          }
          const created = await createChatMessage(event.roomId, meta.userId, event.messageText);
          broadcastToRoom(event.roomId, {
            type: 'message:new',
            roomId: event.roomId,
            message: created,
          });
        }
      } catch {
        // Ignore malformed payloads
      }
    });

    ws.on('close', () => {
      const room = meta.roomId;
      clients.delete(meta);
      broadcastPresence(room);
    });
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Republik Jomokerto server running on http://0.0.0.0:${PORT}`);
  });
}

bootstrap();
