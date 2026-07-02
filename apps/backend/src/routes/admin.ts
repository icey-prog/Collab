/**
 * Routes admin : liste des rooms + stats globales.
 * ⚠ Pas encore d'authentification — Lot 1 (sécurité) ajoutera ADMIN_SECRET
 * avant tout déploiement public.
 */
import type { FastifyInstance } from 'fastify';
import type { Server as IOServer } from 'socket.io';
import { rooms, publicFiles, MAX_PARTICIPANTS } from '../lib/state';
import { isRoomAdminFromCookies } from '../lib/auth';

export function registerAdminRoutes(app: FastifyInstance, getIO: () => IOServer): void {

  app.get('/admin/rooms', async (req) => {
    const now = Date.now();
    const list = [...rooms.values()]
      .filter(r => r.expiresAt > now)
      .map(r => ({
        id:             r.id,
        createdAt:      r.createdAt,
        expiresInSec:   Math.max(0, Math.round((r.expiresAt - now) / 1000)),
        participants:   r.participants.size,
        full:           r.participants.size >= MAX_PARTICIPANTS,
        questions:      r.questions.length,
        files:          publicFiles(r).length,
        hasAdmin:       isRoomAdminFromCookies(req.cookies, r),
        docTextLength:  r.doc.getText('notes').toString().length,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);

    return { rooms: list, total: list.length };
  });

  app.get('/admin/stats', async () => {
    let participants_total = 0, files_count = 0, files_size = 0, qa_total = 0;
    for (const r of rooms.values()) {
      participants_total += r.participants.size;
      const files = publicFiles(r);
      files_count += files.length;
      files_size += files.reduce((s, f) => s + f.size, 0);
      qa_total += r.questions.length;
    }
    return {
      rooms_active:       rooms.size,
      rooms_full:         [...rooms.values()].filter(r => r.participants.size >= MAX_PARTICIPANTS).length,
      participants_total,
      files_count,
      files_size_bytes:   files_size,
      qa_questions_count: qa_total,
      uptime_sec:         Math.floor(process.uptime()),
      redis_memory_mb:    Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 10) / 10,
      socket_connections: getIO().sockets.sockets.size,
    };
  });
}
