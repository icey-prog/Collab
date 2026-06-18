/**
 * Y.js document + Socket.io transport for collaborative notes.
 * Adds awareness (multi-cursor + presence) via y-protocols/awareness.
 *
 * Protocol (custom, minimal):
 *   client → server : 'yjs:sync'        { roomId, update: Uint8Array }
 *   client ← server : 'yjs:update'      { roomId, update: Uint8Array }
 *   client → server : 'yjs:state'       { roomId, sv: Uint8Array }
 *   client ← server : 'yjs:state'       { roomId, doc: Uint8Array }
 *   client → server : 'awareness:update'{ roomId, update: Uint8Array }
 *   client ← server : 'awareness:update'{ roomId, update: Uint8Array }
 */
import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { IndexeddbPersistence } from 'y-indexeddb';
import type { Socket } from 'socket.io-client';

export interface UserIdentity {
  name:  string;
  color: string;
  colorLight: string;
}

export interface YDocBundle {
  doc:       Y.Doc;
  text:      Y.Text;
  awareness: Awareness;
  provider:  IndexeddbPersistence;
  destroy:   () => void;
}

/* ── User identity (anonymous, animal-themed) ───────────── */

const ANIMALS = ['Renard', 'Hibou', 'Loutre', 'Caméléon', 'Panda', 'Faucon', 'Lynx', 'Toucan', 'Coati', 'Tatou', 'Marmotte', 'Échidné'];
const PALETTE = [
  { c: '#E63946', l: '#FFE3E5' },
  { c: '#F77F00', l: '#FFEAD2' },
  { c: '#2A9D8F', l: '#D9F0EC' },
  { c: '#264653', l: '#D5DEE1' },
  { c: '#9D4EDD', l: '#EBDDFA' },
  { c: '#3A86FF', l: '#DCE9FF' },
  { c: '#06A77D', l: '#D2F1E5' },
  { c: '#D62828', l: '#FBD9D9' },
];

// Fix #8: in-memory fallback for Safari private mode (sessionStorage throws there)
let inMemoryIdentity: UserIdentity | null = null;

function loadOrCreateIdentity(): UserIdentity {
  if (typeof window === 'undefined') return { name: 'Anon', color: '#888', colorLight: '#eee' };
  if (inMemoryIdentity) return inMemoryIdentity;
  try {
    const raw = sessionStorage.getItem('collab.identity');
    if (raw) {
      const parsed = JSON.parse(raw) as UserIdentity;
      inMemoryIdentity = parsed;
      return parsed;
    }
  } catch { /* sessionStorage refused — fall through */ }
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const num    = Math.floor(Math.random() * 90) + 10;
  const pal    = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  const id: UserIdentity = { name: `${animal} #${num}`, color: pal.c, colorLight: pal.l };
  try { sessionStorage.setItem('collab.identity', JSON.stringify(id)); } catch { /* ignore */ }
  inMemoryIdentity = id;
  return id;
}

export const localIdentity = loadOrCreateIdentity();

/* ── Size caps (Fix #4 — DoS protection on incoming updates) ─── */

const MAX_YJS_UPDATE_BYTES      = 256 * 1024;  // 256 KB per Y.js update
const MAX_YJS_STATE_BYTES       = 2 * 1024 * 1024;  // 2 MB for initial doc snapshot
const MAX_AWARENESS_UPDATE_BYTES = 16 * 1024;  // 16 KB per awareness update

/* ── Bundle factory ─────────────────────────────────────── */

export function createRoomDoc(socket: Socket, roomId: string): YDocBundle {
  const doc       = new Y.Doc();
  const text      = doc.getText('notes');
  const awareness = new Awareness(doc);

  // Publish local identity to awareness (consumed by y-codemirror.next for remote cursors)
  awareness.setLocalStateField('user', {
    name:  localIdentity.name,
    color: localIdentity.color,
    colorLight: localIdentity.colorLight,
  });

  // 0) Persistance locale via IndexedDB
  const provider = new IndexeddbPersistence(`collab-room-${roomId}`, doc);
  provider.on('synced', () => {
    console.debug(`[y-indexeddb] Local data loaded for room ${roomId}`);
  });

  // 1) Request initial state from server
  socket.emit('yjs:state', { roomId, sv: Y.encodeStateVector(doc) });

  // 2) Apply remote doc updates (with size cap — Fix #4)
  const onUpdate = (msg: { roomId: string; update: ArrayBuffer | Uint8Array }) => {
    if (msg.roomId !== roomId) return;
    const u8 = msg.update instanceof Uint8Array ? msg.update : new Uint8Array(msg.update);
    if (u8.byteLength > MAX_YJS_UPDATE_BYTES) {
      console.warn(`[yjs] update dropped (${u8.byteLength} > ${MAX_YJS_UPDATE_BYTES} bytes)`);
      return;
    }
    Y.applyUpdate(doc, u8, 'remote');
  };
  const onState = (msg: { roomId: string; doc: ArrayBuffer | Uint8Array }) => {
    if (msg.roomId !== roomId) return;
    const u8 = msg.doc instanceof Uint8Array ? msg.doc : new Uint8Array(msg.doc);
    if (u8.byteLength > MAX_YJS_STATE_BYTES) {
      console.warn(`[yjs] state dropped (${u8.byteLength} > ${MAX_YJS_STATE_BYTES} bytes)`);
      return;
    }
    Y.applyUpdate(doc, u8, 'remote');
  };

  socket.on('yjs:update', onUpdate);
  socket.on('yjs:state',  onState);

  // 3) Broadcast local doc updates
  const onLocal = (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote') return;
    socket.emit('yjs:sync', { roomId, update });
  };
  doc.on('update', onLocal);

  // 4) Awareness transport (with size cap — Fix #4)
  const onAwarenessRemote = (msg: { roomId: string; update: ArrayBuffer | Uint8Array }) => {
    if (msg.roomId !== roomId) return;
    const u8 = msg.update instanceof Uint8Array ? msg.update : new Uint8Array(msg.update);
    if (u8.byteLength > MAX_AWARENESS_UPDATE_BYTES) {
      console.warn(`[awareness] update dropped (${u8.byteLength} > ${MAX_AWARENESS_UPDATE_BYTES} bytes)`);
      return;
    }
    applyAwarenessUpdate(awareness, u8, 'remote');
  };
  socket.on('awareness:update', onAwarenessRemote);

  // Quand un retardataire join, le serveur nous demande de rebroadcaster notre awareness
  // (sinon il ne verrait pas notre curseur tant qu'on ne bouge pas la souris).
  const onAwarenessRequest = (msg: { roomId: string }) => {
    if (msg.roomId !== roomId) return;
    const update = encodeAwarenessUpdate(awareness, [doc.clientID]);
    socket.emit('awareness:update', { roomId, update });
  };
  socket.on('awareness:request-rebroadcast', onAwarenessRequest);

  const onAwarenessLocal = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === 'remote') return;
    const changedClients = added.concat(updated, removed);
    const update = encodeAwarenessUpdate(awareness, changedClients);
    socket.emit('awareness:update', { roomId, update });
  };
  awareness.on('update', onAwarenessLocal);

  // Cleanup awareness on tab close — Fix #7: pagehide for Safari iOS (beforeunload ignored)
  const onUnload = () => {
    removeAwarenessStates(awareness, [doc.clientID], 'unload');
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('pagehide',     onUnload);
  }

  return {
    doc,
    text,
    awareness,
    provider,
    destroy() {
      doc.off('update', onLocal);
      socket.off('yjs:update', onUpdate);
      socket.off('yjs:state',  onState);
      socket.off('awareness:update', onAwarenessRemote);
      socket.off('awareness:request-rebroadcast', onAwarenessRequest);
      awareness.off('update', onAwarenessLocal);
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', onUnload);
        window.removeEventListener('pagehide',     onUnload);
      }
      removeAwarenessStates(awareness, [doc.clientID], 'destroy');
      awareness.destroy();
      provider.destroy();
      doc.destroy();
    }
  };
}
