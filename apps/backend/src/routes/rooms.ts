/**
 * Routes REST des rooms : création, preview, fermeture admin.
 */
import type { FastifyInstance } from 'fastify';
import type { Server as IOServer } from 'socket.io';
import { randomBytes } from 'node:crypto';
import * as Y from 'yjs';
import {
  rooms, getRoom, destroyRoom, genRoomId, isValidRoomCode,
  ROOM_TTL_MS, MAX_PARTICIPANTS, type RoomConfig,
} from '../lib/state';
import { isRoomAdminFromCookies } from '../lib/auth';

export function registerRoomRoutes(app: FastifyInstance, getIO: () => IOServer): void {

  app.post('/room/create', async (_req, reply) => {
    let id = genRoomId();
    while (rooms.has(id)) id = genRoomId();
    const adminToken = randomBytes(24).toString('hex');
    const room: RoomConfig = {
      id, createdAt: Date.now(), expiresAt: Date.now() + ROOM_TTL_MS,
      adminToken, participants: new Set(), questions: [], files: [], doc: new Y.Doc(),
    };
    rooms.set(id, room);
    // Prod : frontend (Vercel/Tauri) et API (VPS) sont cross-site — un cookie
    // Lax n'est jamais envoyé dans ce contexte, l'hôte perdrait son rôle admin.
    // SameSite=None exige Secure (HTTPS), d'où le split prod/dev.
    const isProd = process.env.NODE_ENV === 'production';
    reply.setCookie('collab_admin', `${id}:${adminToken}`, {
      path: '/', httpOnly: true, maxAge: ROOM_TTL_MS / 1000,
      sameSite: isProd ? 'none' : 'lax', secure: isProd,
    });
    return { roomId: id };
  });

  app.get<{ Params: { id: string } }>('/room/:id/preview', async (req, reply) => {
    const id = req.params.id.toUpperCase();
    if (!isValidRoomCode(id)) return reply.code(400).send({ error: 'INVALID_CODE' });
    const r = getRoom(id);
    if (!r) return reply.code(404).send({ exists: false, participants: 0, expiresInSec: 0, full: false });
    return {
      exists: true,
      participants: r.participants.size,
      expiresInSec: Math.max(0, Math.round((r.expiresAt - Date.now()) / 1000)),
      full: r.participants.size >= MAX_PARTICIPANTS,
    };
  });

  app.delete<{ Params: { id: string } }>('/room/:id', async (req, reply) => {
    const id = req.params.id.toUpperCase();
    const r = getRoom(id);
    if (!r) return reply.code(404).send({ error: 'NOT_FOUND' });
    if (!isRoomAdminFromCookies(req.cookies, r)) return reply.code(403).send({ error: 'FORBIDDEN' });
    getIO().to(id).emit('room:closed', { roomId: id });
    destroyRoom(id);
    return { ok: true };
  });
}
