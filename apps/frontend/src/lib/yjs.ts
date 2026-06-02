/**
 * Y.js document + Socket.io transport for collaborative notes.
 *
 * Protocol (custom, kept minimal — backend uses y-socket.io which speaks the same):
 *   client → server : 'yjs:sync'   { roomId, update: Uint8Array }   on local change
 *   client ← server : 'yjs:update' { roomId, update: Uint8Array }   on remote change
 *   client → server : 'yjs:state'  { roomId, sv: Uint8Array }       request initial state
 *   client ← server : 'yjs:state'  { roomId, doc: Uint8Array }      full doc snapshot
 */
import * as Y from 'yjs';
import type { Socket } from 'socket.io-client';

export interface YDocBundle {
  doc: Y.Doc;
  text: Y.Text;                              // shared text for the notes editor
  destroy: () => void;
}

export function createRoomDoc(socket: Socket, roomId: string): YDocBundle {
  const doc = new Y.Doc();
  const text = doc.getText('notes');

  // 1) Request initial state
  socket.emit('yjs:state', { roomId, sv: Y.encodeStateVector(doc) });

  // 2) Apply remote updates
  const onUpdate = (msg: { roomId: string; update: ArrayBuffer | Uint8Array }) => {
    if (msg.roomId !== roomId) return;
    const u8 = msg.update instanceof Uint8Array ? msg.update : new Uint8Array(msg.update);
    Y.applyUpdate(doc, u8, 'remote');
  };
  const onState = (msg: { roomId: string; doc: ArrayBuffer | Uint8Array }) => {
    if (msg.roomId !== roomId) return;
    const u8 = msg.doc instanceof Uint8Array ? msg.doc : new Uint8Array(msg.doc);
    Y.applyUpdate(doc, u8, 'remote');
  };

  socket.on('yjs:update', onUpdate);
  socket.on('yjs:state',  onState);

  // 3) Broadcast local updates
  const onLocal = (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote') return;          // never echo back
    socket.emit('yjs:sync', { roomId, update });
  };
  doc.on('update', onLocal);

  return {
    doc,
    text,
    destroy() {
      doc.off('update', onLocal);
      socket.off('yjs:update', onUpdate);
      socket.off('yjs:state',  onState);
      doc.destroy();
    }
  };
}
