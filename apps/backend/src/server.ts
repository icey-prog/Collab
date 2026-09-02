/**
 * Collab backend — bootstrap Fastify + Socket.io.
 *
 * Architecture cloud-first : hébergé sur VPS, consommé par le web (Vercel)
 * et l'app desktop Tauri via VITE_API_URL.
 *
 * Modules :
 *   lib/state       → rooms in-memory, TTL janitor
 *   lib/cors        → politique d'origines
 *   lib/auth        → check admin (cookie collab_admin)
 *   routes/rooms    → POST create, GET preview, DELETE
 *   routes/files    → upload multipart, download contrôlé
 *   routes/admin    → stats + liste rooms (auth Lot 1 à venir)
 *   sockets/handlers→ join, Y.js sync, awareness, Q&A, fichiers
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { Server as IOServer } from 'socket.io';

import { rooms, startJanitor, MAX_FILE_BYTES, MAX_ROOM_BYTES, MAX_PARTICIPANTS } from './lib/state';
import { corsOriginCheck, corsSummary } from './lib/cors';
import { registerRoomRoutes } from './routes/rooms';
import { registerFileRoutes } from './routes/files';
import { registerAdminRoutes } from './routes/admin';
import { registerSocketHandlers } from './sockets/handlers';

const PORT = Number(process.env.PORT ?? process.env.COLLAB_PORT ?? 3001);

// bodyLimit Fastify = plafond GLOBAL vérifié AVANT le parsing multipart —
// doit couvrir le plus gros upload possible (MAX_ROOM_BYTES), sinon il
// écrase silencieusement MAX_FILE_BYTES pour tout fichier au-delà.
// +1Mo de marge pour les headers/boundaries multipart.
const app = Fastify({ logger: true, bodyLimit: MAX_ROOM_BYTES + 1024 * 1024 });

// Tolérance body vide sur POST sans payload (front fetch sans body)
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
  const s = (body as string).trim();
  if (s === '') return done(null, {});
  try { done(null, JSON.parse(s)); } catch (err) { done(err as Error); }
});
// Zip de dossier streamé (routes/files.ts, upload sans multipart) — sans ce
// parser Fastify répond 415 (content-type inconnu) avant même d'atteindre
// la route. On ne bufferise rien : le stream passe tel quel en req.body.
app.addContentTypeParser('application/zip', (_req, payload, done) => {
  done(null, payload);
});

app.register(cors, { origin: corsOriginCheck, credentials: true });
app.register(cookie);
// files:1 — un seul fichier par requête : la route upload ne lit que le
// premier part ; sans ce plafond, des parts supplémentaires seraient
// consommés (bande passante) sans être ni comptés ni stockés.
app.register(multipart, { limits: { fileSize: MAX_FILE_BYTES, files: 1 } });
// Anti-DoS : 60 req/min global par IP ; create/upload ont des limites
// dédiées plus strictes (config par route).
app.register(rateLimit, { max: 60, timeWindow: '1 minute' });

// io est instancié après app.listen() — les routes y accèdent via getter.
let io: IOServer;
const getIO = () => io;

// Routes dans un plugin enfant : avvio le charge APRÈS rate-limit, sinon le
// hook onRoute du plugin ne voit pas les routes et ignore leur config.rateLimit.
app.register(async (scope) => {
  registerRoomRoutes(scope, getIO);
  registerFileRoutes(scope, getIO);
  registerAdminRoutes(scope, getIO);
  /* GET / — sanity check */
  scope.get('/', async () => ({ ok: true, service: 'collab-backend', rooms: rooms.size }));
});

app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  io = new IOServer(app.server, {
    cors: { origin: corsOriginCheck, credentials: true },
    path: '/socket.io',
  });
  registerSocketHandlers(io);
  startJanitor();
  console.log(`[collab-backend] http://localhost:${PORT}  |  CORS: ${corsSummary()}  |  Max ${MAX_PARTICIPANTS} participants/room`);
}).catch((err) => {
  console.error('[collab-backend] failed to start:', err);
  process.exit(1);
});
