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
import staticPlugin from '@fastify/static';
import { Server as IOServer } from 'socket.io';

import { rooms, startJanitor, UPLOAD_DIR, MAX_FILE_BYTES, MAX_PARTICIPANTS } from './lib/state';
import { corsOriginCheck, corsSummary } from './lib/cors';
import { registerRoomRoutes } from './routes/rooms';
import { registerFileRoutes } from './routes/files';
import { registerAdminRoutes } from './routes/admin';
import { registerSocketHandlers } from './sockets/handlers';

const PORT = Number(process.env.PORT ?? process.env.COLLAB_PORT ?? 3001);

const app = Fastify({ logger: true, bodyLimit: 12 * 1024 * 1024 });

// Tolérance body vide sur POST sans payload (front fetch sans body)
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
  const s = (body as string).trim();
  if (s === '') return done(null, {});
  try { done(null, JSON.parse(s)); } catch (err) { done(err as Error); }
});

app.register(cors, { origin: corsOriginCheck, credentials: true });
app.register(cookie);
app.register(multipart, { limits: { fileSize: MAX_FILE_BYTES } });
app.register(staticPlugin, { root: UPLOAD_DIR, prefix: '/files/', decorateReply: false });

// io est instancié après app.listen() — les routes y accèdent via getter.
let io: IOServer;
const getIO = () => io;

registerRoomRoutes(app, getIO);
registerFileRoutes(app, getIO);
registerAdminRoutes(app, getIO);

/* GET / — sanity check */
app.get('/', async () => ({ ok: true, service: 'collab-backend', rooms: rooms.size }));

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
