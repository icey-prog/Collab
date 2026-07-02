/**
 * Routes admin : liste des rooms + stats globales.
 *
 * Protection : ADMIN_SECRET (env). Si défini, exige `Authorization: Bearer <secret>`.
 * Non défini (dev local) → accès libre. Ne touche PAS le user flow : seules
 * ces deux routes de dashboard sont concernées, create/join restent sans auth.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Server as IOServer } from 'socket.io';
import { rooms, publicFiles, MAX_PARTICIPANTS } from '../lib/state';
import { isRoomAdminFromCookies } from '../lib/auth';

const ADMIN_SECRET = process.env.ADMIN_SECRET;

function requireAdminSecret(req: FastifyRequest, reply: FastifyReply, done: () => void): void {
  if (!ADMIN_SECRET) return done();  // dev local sans secret
  const auth = req.headers.authorization ?? '';
  if (auth === `Bearer ${ADMIN_SECRET}`) return done();
  reply.code(401).send({ error: 'UNAUTHORIZED' });
}

export function registerAdminRoutes(app: FastifyInstance, getIO: () => IOServer): void {

  app.addHook('preHandler', (req, reply, done) => {
    if (req.url.startsWith('/admin/')) return requireAdminSecret(req, reply, done);
    done();
  });

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
