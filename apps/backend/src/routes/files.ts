/**
 * Routes fichiers : upload multipart + téléchargement contrôlé.
 * L'URL renvoyée est un path relatif à l'API — le client la préfixe
 * avec sa base (VITE_API_URL ou /api) via apiUrl().
 */
import type { FastifyInstance } from 'fastify';
import type { Server as IOServer } from 'socket.io';
import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  getRoom, publicFiles, UPLOAD_DIR, MAX_FILE_BYTES, FILE_TTL_MS,
  MAX_FILES_PER_ROOM, MAX_ROOM_BYTES,
  type FileMeta,
} from '../lib/state';

export function registerFileRoutes(app: FastifyInstance, getIO: () => IOServer): void {

  app.post<{ Params: { id: string } }>('/room/:id/upload', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const id = req.params.id.toUpperCase();
    const r = getRoom(id);
    if (!r) return reply.code(404).send({ error: 'NOT_FOUND' });

    // Quota room : anti-DoS disque (fichiers illimités sinon)
    const active = publicFiles(r);
    if (active.length >= MAX_FILES_PER_ROOM) return reply.code(429).send({ error: 'ROOM_FILES_LIMIT' });
    const roomBytes = active.reduce((s, f) => s + f.size, 0);

    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'NO_FILE' });

    const buf = await data.toBuffer();
    if (buf.byteLength > MAX_FILE_BYTES) return reply.code(413).send({ error: 'TOO_LARGE' });
    if (roomBytes + buf.byteLength > MAX_ROOM_BYTES) return reply.code(429).send({ error: 'ROOM_QUOTA_FULL' });

    const key = `${id}_${randomBytes(8).toString('hex')}_${data.filename.replace(/[^\w.\-]/g, '_')}`;
    await writeFile(join(UPLOAD_DIR, key), buf);

    const meta: FileMeta = {
      key, name: data.filename, size: buf.byteLength,
      url: `/room/${id}/file/${key}`,
      expiresAt: Date.now() + FILE_TTL_MS,
    };
    r.files.push(meta);
    getIO().to(id).emit('files:updated', publicFiles(r));
    return meta;
  });

  app.get<{ Params: { id: string; key: string } }>('/room/:id/file/:key', async (req, reply) => {
    const id = req.params.id.toUpperCase();
    const r = getRoom(id);
    if (!r) return reply.code(404).send({ error: 'NOT_FOUND' });
    const meta = r.files.find(f => f.key === req.params.key);
    if (!meta || meta.expiresAt < Date.now()) return reply.code(404).send({ error: 'FILE_GONE' });
    const fullPath = join(UPLOAD_DIR, meta.key);
    if (!existsSync(fullPath)) return reply.code(404).send({ error: 'MISSING' });
    // Sanitize : quotes/backslash cassent le parsing du header ; RFC 5987
    // filename* pour les noms Unicode.
    const safeName = meta.name.replace(/["\\\r\n]/g, '_');
    const encoded = encodeURIComponent(meta.name);
    reply.header('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encoded}`);
    reply.type('application/octet-stream');
    return reply.send(createReadStream(fullPath));
  });
}
