/**
 * Minimal Y.js relay over Socket.io — replaces y-socket.io for our custom protocol.
 *
 * Per room we keep one Y.Doc in memory. On 'yjs:state' we send the full doc snapshot,
 * on 'yjs:sync' we apply the update and broadcast to other sockets in the room.
 *
 * The doc is destroyed when the room TTL expires (Redis keyspace notification KEx)
 * or when 'room:close' is emitted by the admin.
 */
import fp from 'fastify-plugin';
import { Server } from 'socket.io';
import * as Y from 'yjs';

const docs = new Map<string, Y.Doc>();

function getDoc(roomId: string): Y.Doc {
  let d = docs.get(roomId);
  if (!d) { d = new Y.Doc(); docs.set(roomId, d); }
  return d;
}

export function releaseDoc(roomId: string) {
  const d = docs.get(roomId);
  if (d) { d.destroy(); docs.delete(roomId); }
}

export default fp(async (app, { io }: { io: Server }) => {
  io.on('connection', (socket) => {

    // Client requests a full snapshot
    socket.on('yjs:state', ({ roomId, sv }: { roomId: string; sv: Uint8Array }) => {
      if (!roomId || !socket.rooms.has(roomId)) return;
      const doc = getDoc(roomId);
      const diff = Y.encodeStateAsUpdate(doc, sv ? new Uint8Array(sv) : undefined);
      socket.emit('yjs:state', { roomId, doc: diff });
    });

    // Client sends a local edit
    socket.on('yjs:sync', ({ roomId, update }: { roomId: string; update: Uint8Array }) => {
      if (!roomId || !socket.rooms.has(roomId)) return;
      const u8 = new Uint8Array(update);
      Y.applyUpdate(getDoc(roomId), u8, 'remote');
      socket.to(roomId).emit('yjs:update', { roomId, update: u8 });
    });
  });

  // Subscribe to Redis key expirations to release docs (set in main server.ts)
  app.redis.subscribe('__keyevent@0__:expired');
  app.redis.on('message', (channel, key) => {
    if (channel !== '__keyevent@0__:expired') return;
    const m = /^room:([^:]+):config$/.exec(key);
    if (m) releaseDoc(m[1]);
  });
});
