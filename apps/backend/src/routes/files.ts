/**
 * Routes fichiers : upload multipart streamé + téléchargement contrôlé.
 * L'URL renvoyée est un path relatif à l'API — le client la préfixe
 * avec sa base (VITE_API_URL ou /api) via apiUrl().
 *
 * Sécurité archives (zip/rar/7z) : le serveur ne décompresse JAMAIS rien —
 * les fichiers sont stockés et resservis octet pour octet. Une zip bomb
 * (42.zip : 42 Ko → 4,5 Po décompressés) est donc inopérante ici : seuls
 * les octets réellement transmis comptent, plafonnés en streaming par
 * MAX_FILE_BYTES (limite multipart, coupe le flux) et par le quota room.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Server as IOServer } from 'socket.io';
import { randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import {
  getRoom, publicFiles, UPLOAD_DIR, MAX_FILE_BYTES, FILE_TTL_MS,
  MAX_FILES_PER_ROOM, MAX_ROOM_BYTES,
  type RoomConfig, type FileMeta,
} from '../lib/state';

/* ── Réservation de quota — ferme la race TOCTOU sur MAX_ROOM_BYTES ──
 * Plusieurs uploads concurrents sur la même room lisaient le même total
 * "avant écriture" et passaient tous le check. Avec des fichiers de 500 MB
 * streamés (upload longs), la fenêtre de course devient énorme. On réserve
 * les octets déclarés AVANT tout await, on libère en fin de requête. */
const reservedBytes = new Map<string, number>();

function reserve(roomId: string, bytes: number): void {
  reservedBytes.set(roomId, (reservedBytes.get(roomId) ?? 0) + bytes);
}
function release(roomId: string, bytes: number): void {
  const next = (reservedBytes.get(roomId) ?? 0) - bytes;
  if (next <= 0) reservedBytes.delete(roomId);
  else reservedBytes.set(roomId, next);
}

function roomUsedBytes(r: RoomConfig): number {
  return publicFiles(r).reduce((sum, f) => sum + f.size, 0);
}

/** Octets annoncés par le client — approximation haute (inclut l'overhead
 *  multipart, quelques centaines d'octets) utilisée pour la réservation.
 *  Le check final utilise la taille réelle écrite sur disque. */
function declaredBytes(req: FastifyRequest): number {
  const len = Number(req.headers['content-length']);
  return Number.isFinite(len) && len > 0 ? len : MAX_FILE_BYTES;
}

export function registerFileRoutes(app: FastifyInstance, getIO: () => IOServer): void {

  app.post<{ Params: { id: string } }>('/room/:id/upload', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const id = req.params.id.toUpperCase();
    const r = getRoom(id);
    if (!r) return reply.code(404).send({ error: 'NOT_FOUND' });

    if (publicFiles(r).length >= MAX_FILES_PER_ROOM) {
      return reply.code(429).send({ error: 'ROOM_FILES_LIMIT' });
    }

    // Fail-fast sur les octets annoncés, PUIS réservation synchrone (aucun
    // await entre le check et reserve — les concurrents voient la réservation).
    const declared = declaredBytes(req);
    const alreadyReserved = reservedBytes.get(id) ?? 0;
    if (roomUsedBytes(r) + alreadyReserved + declared > MAX_ROOM_BYTES) {
      return reply.code(429).send({ error: 'ROOM_QUOTA_FULL' });
    }
    reserve(id, declared);

    let diskPath: string | null = null;
    try {
      const data = await req.file();
      if (!data) return reply.code(400).send({ error: 'NO_FILE' });

      const key = `${id}_${randomBytes(8).toString('hex')}_${data.filename.replace(/[^\w.\-]/g, '_')}`;
      diskPath = join(UPLOAD_DIR, key);

      // Streaming direct vers le disque — jamais le fichier entier en RAM
      // (l'ancien data.toBuffer() chargeait tout en mémoire : à 500 MB dans
      // un conteneur limité à 512 MB, OOM garanti au premier upload).
      await pipeline(data.file, createWriteStream(diskPath));

      // La limite multipart (limits.fileSize) COUPE le flux au-delà de
      // MAX_FILE_BYTES et pose ce flag — fichier tronqué = rejet.
      if (data.file.truncated) {
        await unlink(diskPath).catch(() => {});
        diskPath = null;
        return reply.code(413).send({ error: 'TOO_LARGE' });
      }

      // Check final sur les octets réels écrits (la réservation était une
      // approximation haute basée sur Content-Length).
      const { size } = await stat(diskPath);
      if (roomUsedBytes(r) + size > MAX_ROOM_BYTES) {
        await unlink(diskPath).catch(() => {});
        diskPath = null;
        return reply.code(429).send({ error: 'ROOM_QUOTA_FULL' });
      }

      const meta: FileMeta = {
        key, name: data.filename, size,
        url: `/room/${id}/file/${key}`,
        expiresAt: Date.now() + FILE_TTL_MS,
      };
      r.files.push(meta);
      getIO().to(id).emit('files:updated', publicFiles(r));
      return meta;
    } catch (err) {
      // Client parti en plein upload, disque plein… — pas de fichier orphelin.
      if (diskPath) await unlink(diskPath).catch(() => {});
      throw err;
    } finally {
      release(id, declared);
    }
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
