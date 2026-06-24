/**
 * Collab MVP backend — single-file Fastify + Socket.io server.
 *
 * Storage: in-memory Maps (no Redis, no R2). Suitable for local dev & demo only.
 * Production hardening (Redis, R2, JWT) tracked in SUIVI Phase 2.
 *
 * Routes:
 *   POST   /room/create               → { roomId }, sets collab_admin cookie
 *   GET    /room/:id/preview          → { exists, participants, expiresInSec, full }
 *   DELETE /room/:id                  → admin-only, closes the room
 *   POST   /room/:id/upload           → multipart, stores file under data/uploads/
 *   GET    /room/:id/file/:key        → streams stored file
 *   GET    /admin/stats               → admin dashboard data
 *
 * Socket events (per Y.js + awareness + qa + files):
 *   join:room, room:joined, room:full, room:error, room:closed, participants:count
 *   yjs:state, yjs:sync, yjs:update
 *   awareness:update
 *   qa:add, qa:vote, qa:delete, qa:updated
 *   file:delete, files:updated
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import { Server as IOServer } from 'socket.io';
import * as Y from 'yjs';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdirSync, createReadStream, statSync, unlinkSync, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { networkInterfaces } from 'node:os';

// DATA_DIR : process.cwd() en prod (pkg snapshot n'a pas __dirname/import.meta);
// peut être overridé via env (Tauri sidecar pose userData path).
const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data');
const UPLOAD_DIR = join(DATA_DIR, 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

// Port priority :
//   1. --port=N CLI arg (Tauri sidecar spawn)
//   2. env PORT (Fly.io)
//   3. env COLLAB_PORT (fallback)
//   4. 3001 (dev local)
function parsePortArg(): number | null {
  for (let i = 0; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--port' && process.argv[i + 1]) return Number(process.argv[i + 1]);
    if (a?.startsWith('--port=')) return Number(a.slice(7));
  }
  return null;
}
const PORT = parsePortArg() ?? Number(process.env.PORT ?? process.env.COLLAB_PORT ?? 3001);

// CORS LAN-friendly : localhost + 192.168.* + 10.* + 172.16-31.* + ENV override
// (déploiement cloud : exporter FRONT_ORIGIN=https://collab.exxolab.bf)
const ENV_ORIGIN = process.env.FRONT_ORIGIN; // ex: 'https://collab.exxolab.bf'
const LAN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?::\d+)?$/;
function corsOriginCheck(origin: string | undefined, cb: (err: Error | null, allow: boolean) => void): void {
  if (!origin) return cb(null, true);                       // curl / same-origin
  if (ENV_ORIGIN && origin === ENV_ORIGIN) return cb(null, true);
  if (LAN_RE.test(origin)) return cb(null, true);
  // Tauri WebView custom-protocol origin (Windows: https://tauri.localhost,
  // macOS/Linux: tauri://localhost). Pas matché par LAN_RE à cause du sous-domaine.
  if (/^https?:\/\/tauri\.localhost$/.test(origin)) return cb(null, true);
  if (origin === 'tauri://localhost') return cb(null, true);
  // Vercel auto-domains (collab-talk-*.vercel.app) + main domain
  if (/^https:\/\/collab-talk(-[\w-]+)?\.vercel\.app$/.test(origin)) return cb(null, true);
  return cb(null, false);
}

/* ─── Types & in-memory state ─── */

interface RoomConfig {
  id: string;
  createdAt: number;
  expiresAt: number;
  adminToken: string;
  participants: Set<string>;       // socket ids
  questions: Question[];
  files: FileMeta[];
  doc: Y.Doc;
}
interface Question { id: string; text: string; votes: number; voters: Set<string>; createdAt: number; }
interface FileMeta { key: string; name: string; size: number; url: string; expiresAt: number; }

const rooms = new Map<string, RoomConfig>();
const ROOM_TTL_MS = 4 * 60 * 60 * 1000;       // 4h
const FILE_TTL_MS = 24 * 60 * 60 * 1000;      // 24h
const MAX_PARTICIPANTS = 4;                  // MVP : petites sessions LAN/Cloud (3-4)
const MAX_FILE_BYTES = 10 * 1024 * 1024;      // 10 MB
const MAX_YJS_UPDATE = 256 * 1024;            // 256 KB defense
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/* ─── Helpers ─── */

function genRoomId(): string {
  let id = '';
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i++) id += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
  return id;
}
function isValidRoomCode(id: string): boolean {
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(id);
}
function getRoom(id: string): RoomConfig | undefined {
  const r = rooms.get(id);
  if (!r) return undefined;
  if (Date.now() > r.expiresAt) { destroyRoom(id); return undefined; }
  return r;
}
function destroyRoom(id: string) {
  const r = rooms.get(id);
  if (!r) return;
  r.doc.destroy();
  for (const f of r.files) { try { unlinkSync(join(UPLOAD_DIR, f.key)); } catch {} }
  rooms.delete(id);
}
function publicFiles(r: RoomConfig): FileMeta[] {
  const now = Date.now();
  return r.files.filter(f => f.expiresAt > now);
}

/* ─── Fastify ─── */

const app = Fastify({ logger: true, bodyLimit: 12 * 1024 * 1024 });

// Tolérance body vide sur POST sans payload (front utilise fetch sans body)
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
  const s = (body as string).trim();
  if (s === '') return done(null, {});
  try { done(null, JSON.parse(s)); } catch (err) { done(err as Error); }
});

// register sans top-level await (Fastify queue les routes jusqu'à app.ready())
app.register(cors, { origin: corsOriginCheck, credentials: true });
app.register(cookie);
app.register(multipart, { limits: { fileSize: MAX_FILE_BYTES } });
app.register(staticPlugin, { root: UPLOAD_DIR, prefix: '/files/', decorateReply: false });

/* POST /room/create */
app.post('/room/create', async (req, reply) => {
  let id = genRoomId();
  while (rooms.has(id)) id = genRoomId();
  const adminToken = randomBytes(24).toString('hex');
  const room: RoomConfig = {
    id, createdAt: Date.now(), expiresAt: Date.now() + ROOM_TTL_MS,
    adminToken, participants: new Set(), questions: [], files: [], doc: new Y.Doc(),
  };
  rooms.set(id, room);
  reply.setCookie('collab_admin', `${id}:${adminToken}`, {
    path: '/', httpOnly: true, sameSite: 'lax', maxAge: ROOM_TTL_MS / 1000,
  });
  return { roomId: id };
});

/* GET /room/:id/preview */
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

/* DELETE /room/:id */
app.delete<{ Params: { id: string } }>('/room/:id', async (req, reply) => {
  const id = req.params.id.toUpperCase();
  const r = getRoom(id);
  if (!r) return reply.code(404).send({ error: 'NOT_FOUND' });
  const cookieVal = req.cookies['collab_admin'] ?? '';
  const [cookieRoom, cookieToken] = cookieVal.split(':');
  if (cookieRoom !== id || cookieToken !== r.adminToken) return reply.code(403).send({ error: 'FORBIDDEN' });
  io.to(id).emit('room:closed', { roomId: id });
  destroyRoom(id);
  return { ok: true };
});

/* POST /room/:id/upload */
app.post<{ Params: { id: string } }>('/room/:id/upload', async (req, reply) => {
  const id = req.params.id.toUpperCase();
  const r = getRoom(id);
  if (!r) return reply.code(404).send({ error: 'NOT_FOUND' });
  const data = await req.file();
  if (!data) return reply.code(400).send({ error: 'NO_FILE' });

  const buf = await data.toBuffer();
  if (buf.byteLength > MAX_FILE_BYTES) return reply.code(413).send({ error: 'TOO_LARGE' });

  const key = `${id}_${randomBytes(8).toString('hex')}_${data.filename.replace(/[^\w.\-]/g, '_')}`;
  await writeFile(join(UPLOAD_DIR, key), buf);

  const meta: FileMeta = {
    key, name: data.filename, size: buf.byteLength,
    url: `/api/room/${id}/file/${key}`,
    expiresAt: Date.now() + FILE_TTL_MS,
  };
  r.files.push(meta);
  io.to(id).emit('files:updated', publicFiles(r));
  return meta;
});

/* GET /room/:id/file/:key */
app.get<{ Params: { id: string; key: string } }>('/room/:id/file/:key', async (req, reply) => {
  const id = req.params.id.toUpperCase();
  const r = getRoom(id);
  if (!r) return reply.code(404).send({ error: 'NOT_FOUND' });
  const meta = r.files.find(f => f.key === req.params.key);
  if (!meta || meta.expiresAt < Date.now()) return reply.code(404).send({ error: 'FILE_GONE' });
  const fullPath = join(UPLOAD_DIR, meta.key);
  if (!existsSync(fullPath)) return reply.code(404).send({ error: 'MISSING' });
  reply.header('Content-Disposition', `attachment; filename="${meta.name}"`);
  reply.type('application/octet-stream');
  return reply.send(createReadStream(fullPath));
});

/* GET /admin/rooms — list all active rooms (codes visibles pour MVP local) */
app.get('/admin/rooms', async (req) => {
  const now = Date.now();
  const cookieVal = req.cookies['collab_admin'] ?? '';
  const [cookieRoom, cookieToken] = cookieVal.split(':');

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
      hasAdmin:       cookieRoom === r.id && cookieToken === r.adminToken,
      docTextLength:  r.doc.getText('notes').toString().length,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);

  return { rooms: list, total: list.length };
});

/* GET /admin/stats */
app.get('/admin/stats', async (req) => {
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
    socket_connections: io.sockets.sockets.size,
  };
});

/* GET /local-ip — IP LAN de la machine (utile pour QR code sur localhost)
 * Priorité : 192.168.x > 10.x > 172.16-31.x > APIPA, en évitant les bridges
 * Docker/Hyper-V et interfaces virtuelles (VirtualBox, WSL).
 */
function getLanIp(): string | null {
  const interfaces = networkInterfaces();
  type Candidate = { ip: string; ifName: string; score: number };
  const candidates: Candidate[] = [];

  const ifScore = (name: string): number => {
    // Pénalise les interfaces virtuelles connues
    if (/docker|veth|br-|vEthernet|VirtualBox|WSL|tap|tun|utun/i.test(name)) return -50;
    // Wi-Fi / Ethernet privilégiés
    if (/wlan|wifi|wlp|en0|eth0|enp|eno|Wi-?Fi|Ethernet/i.test(name)) return 10;
    return 0;
  };
  const ipScore = (ip: string): number => {
    if (/^192\.168\./.test(ip))                       return 100;
    if (/^10\./.test(ip))                             return  90;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip))       return  80;
    if (/^169\.254\./.test(ip))                       return -10; // APIPA link-local
    return 0;
  };

  for (const [ifName, ifs] of Object.entries(interfaces)) {
    for (const addr of (ifs ?? [])) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      candidates.push({
        ip: addr.address,
        ifName,
        score: ipScore(addr.address) + ifScore(ifName),
      });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].ip;
}
app.get('/local-ip', async () => ({ ip: getLanIp() }));

/* GET / — sanity */
app.get('/', async () => ({ ok: true, service: 'collab-backend', rooms: rooms.size }));

/* ─── Socket.io ─── */

// Forward declaration : io est utilisé dans les handlers ci-dessous, mais
// instancié seulement après app.listen() (qui requiert app.server prêt).
let io: IOServer;

// Bootstrap : démarre Fastify puis attache Socket.io. Pas de top-level await pour
// permettre le bundle CJS via esbuild (sidecar Tauri).
app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  io = new IOServer(app.server, {
    cors: { origin: corsOriginCheck, credentials: true },
    path: '/socket.io',
  });
  io.on('connection', (socket) => {
  let joinedRoom: string | null = null;

  socket.on('join:room', ({ roomId }: { roomId: string }) => {
    const id = String(roomId ?? '').toUpperCase();
    if (!isValidRoomCode(id)) { socket.emit('room:error', { code: 'INVALID' }); return; }
    const r = getRoom(id);
    if (!r) { socket.emit('room:error', { code: 'NOT_FOUND' }); return; }
    if (r.participants.size >= MAX_PARTICIPANTS) { socket.emit('room:full'); return; }
    socket.join(id);
    r.participants.add(socket.id);
    joinedRoom = id;

    // Detect admin via cookie
    const raw = socket.handshake.headers.cookie ?? '';
    const m = /collab_admin=([^;]+)/.exec(raw);
    const isAdmin = !!m && decodeURIComponent(m[1]) === `${id}:${r.adminToken}`;

    socket.emit('room:joined', { participants: r.participants.size, isAdmin });
    socket.emit('qa:updated',    r.questions.map(q => ({ id: q.id, text: q.text, votes: q.votes, createdAt: q.createdAt })));
    socket.emit('files:updated', publicFiles(r));
    io.to(id).emit('participants:count', { count: r.participants.size });

    // Bug fix retardataire : push proactif du snapshot Y.js au socket qui vient de rejoindre.
    // Sans ça le client doit émettre 'yjs:state' AVANT join:room ce qui crée une race.
    const snapshot = Y.encodeStateAsUpdate(r.doc);
    socket.emit('yjs:state', { roomId: id, doc: snapshot });

    // Demande aux autres sockets de la room de re-publier leur awareness state
    // pour que le retardataire voie les curseurs des autres.
    socket.to(id).emit('awareness:request-rebroadcast', { roomId: id });
  });

  /* Y.js */
  socket.on('yjs:state', ({ roomId, sv }: { roomId: string; sv: Uint8Array }) => {
    const r = getRoom(roomId); if (!r || !socket.rooms.has(roomId)) return;
    const diff = Y.encodeStateAsUpdate(r.doc, sv ? new Uint8Array(sv) : undefined);
    socket.emit('yjs:state', { roomId, doc: diff });
  });
  socket.on('yjs:sync', ({ roomId, update }: { roomId: string; update: Uint8Array }) => {
    const r = getRoom(roomId); if (!r || !socket.rooms.has(roomId)) return;
    const u8 = new Uint8Array(update);
    if (u8.byteLength > MAX_YJS_UPDATE) return;
    Y.applyUpdate(r.doc, u8, 'remote');
    socket.to(roomId).emit('yjs:update', { roomId, update: u8 });
  });

  /* Awareness */
  socket.on('awareness:update', ({ roomId, update }: { roomId: string; update: Uint8Array }) => {
    if (!socket.rooms.has(roomId)) return;
    const u8 = new Uint8Array(update);
    if (u8.byteLength > 16 * 1024) return;
    socket.to(roomId).emit('awareness:update', { roomId, update: u8 });
  });

  /* Q&A */
  socket.on('qa:add', ({ text }: { text: string }) => {
    if (!joinedRoom) return;
    const r = getRoom(joinedRoom); if (!r) return;
    const t = String(text ?? '').slice(0, 500).trim();
    if (t.length < 3) return;
    const q: Question = { id: randomUUID(), text: t, votes: 0, voters: new Set(), createdAt: Date.now() };
    r.questions.push(q);
    io.to(joinedRoom).emit('qa:updated', r.questions.map(q => ({ id: q.id, text: q.text, votes: q.votes, createdAt: q.createdAt })));
  });
  socket.on('qa:vote', ({ questionId }: { questionId: string }) => {
    if (!joinedRoom) return;
    const r = getRoom(joinedRoom); if (!r) return;
    const q = r.questions.find(x => x.id === questionId); if (!q) return;
    const voterKey = createHash('sha256').update(socket.id).digest('hex').slice(0, 16);
    if (q.voters.has(voterKey)) return;
    q.voters.add(voterKey); q.votes++;
    r.questions.sort((a, b) => b.votes - a.votes || a.createdAt - b.createdAt);
    io.to(joinedRoom).emit('qa:updated', r.questions.map(q => ({ id: q.id, text: q.text, votes: q.votes, createdAt: q.createdAt })));
  });
  socket.on('qa:delete', ({ questionId }: { questionId: string }) => {
    if (!joinedRoom) return;
    const r = getRoom(joinedRoom); if (!r) return;
    const raw = socket.handshake.headers.cookie ?? '';
    const m = /collab_admin=([^;]+)/.exec(raw);
    const isAdmin = !!m && decodeURIComponent(m[1]) === `${joinedRoom}:${r.adminToken}`;
    if (!isAdmin) return;
    r.questions = r.questions.filter(q => q.id !== questionId);
    io.to(joinedRoom).emit('qa:updated', r.questions.map(q => ({ id: q.id, text: q.text, votes: q.votes, createdAt: q.createdAt })));
  });

  /* Files admin delete */
  socket.on('file:delete', ({ fileKey }: { fileKey: string }) => {
    if (!joinedRoom) return;
    const r = getRoom(joinedRoom); if (!r) return;
    const raw = socket.handshake.headers.cookie ?? '';
    const m = /collab_admin=([^;]+)/.exec(raw);
    const isAdmin = !!m && decodeURIComponent(m[1]) === `${joinedRoom}:${r.adminToken}`;
    if (!isAdmin) return;
    r.files = r.files.filter(f => {
      if (f.key === fileKey) {
        try { unlinkSync(join(UPLOAD_DIR, f.key)); } catch {}
        return false;
      }
      return true;
    });
    io.to(joinedRoom).emit('files:updated', publicFiles(r));
  });

  /* Disconnect */
  socket.on('disconnect', () => {
    if (!joinedRoom) return;
    const r = rooms.get(joinedRoom);
    if (r) {
      r.participants.delete(socket.id);
      io.to(joinedRoom).emit('participants:count', { count: r.participants.size });
    }
  });
  });

  console.log(`[collab-backend] http://localhost:${PORT}  |  CORS: localhost + LAN${ENV_ORIGIN ? ' + ' + ENV_ORIGIN : ''}  |  Max ${MAX_PARTICIPANTS} participants/room`);
}).catch((err) => {
  console.error('[collab-backend] failed to start:', err);
  process.exit(1);
});

/* TTL janitor — runs every minute, drops expired rooms */
setInterval(() => {
  const now = Date.now();
  for (const [id, r] of rooms) if (r.expiresAt < now) destroyRoom(id);
  // file TTL inside rooms
  for (const r of rooms.values()) {
    r.files = r.files.filter(f => {
      if (f.expiresAt > now) return true;
      try { unlinkSync(join(UPLOAD_DIR, f.key)); } catch {}
      return false;
    });
  }
}, 60_000);
