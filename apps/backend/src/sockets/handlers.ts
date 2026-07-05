/**
 * Handlers Socket.io : join room, sync Y.js, awareness, Q&A, fichiers.
 */
import type { Server as IOServer, Socket } from 'socket.io';
import * as Y from 'yjs';
import { randomUUID, createHash } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
  rooms, getRoom, publicFiles, publicQuestions,
  UPLOAD_DIR, MAX_PARTICIPANTS, MAX_YJS_UPDATE, MAX_NOTES_CHARS, type Question,
} from '../lib/state';
import { isRoomAdminFromCookieHeader } from '../lib/auth';

export function registerSocketHandlers(io: IOServer): void {
  io.on('connection', (socket: Socket) => {
    let joinedRoom: string | null = null;

    const isAdmin = (roomId: string): boolean => {
      const r = getRoom(roomId);
      if (!r) return false;
      return isRoomAdminFromCookieHeader(socket.handshake.headers.cookie, r);
    };

    socket.on('join:room', ({ roomId }: { roomId: string }) => {
      const id = String(roomId ?? '').toUpperCase();
      if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(id)) { socket.emit('room:error', { code: 'INVALID' }); return; }
      const r = getRoom(id);
      if (!r) { socket.emit('room:error', { code: 'NOT_FOUND' }); return; }
      if (r.participants.size >= MAX_PARTICIPANTS) { socket.emit('room:full'); return; }
      socket.join(id);
      r.participants.add(socket.id);
      joinedRoom = id;

      // expiresInSec réel du serveur (source de vérité) : sans ça, le client
      // repart toujours du défaut 4h — faux pour un joiner tardif, et jamais
      // resynchronisé côté client après un setInterval gelé (veille du PC).
      const expiresInSec = Math.max(0, Math.round((r.expiresAt - Date.now()) / 1000));
      socket.emit('room:joined', { participants: r.participants.size, isAdmin: isAdmin(id), expiresInSec });
      socket.emit('qa:updated', publicQuestions(r));
      socket.emit('files:updated', publicFiles(r));
      io.to(id).emit('participants:count', { count: r.participants.size });

      // Push proactif du snapshot Y.js au retardataire (évite la race yjs:state avant join)
      socket.emit('yjs:state', { roomId: id, doc: Y.encodeStateAsUpdate(r.doc) });
      // Demande aux autres de re-publier leur awareness (curseurs visibles pour le retardataire)
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
      // Cap RAM : doc déjà au max → drop (dépassement max = 1 update de 256 KB)
      if (r.doc.getText('notes').length > MAX_NOTES_CHARS) return;
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
      io.to(joinedRoom).emit('qa:updated', publicQuestions(r));
    });

    socket.on('qa:vote', ({ questionId, voterId }: { questionId: string; voterId?: string }) => {
      if (!joinedRoom) return;
      const r = getRoom(joinedRoom); if (!r) return;
      const q = r.questions.find(x => x.id === questionId); if (!q) return;
      // voterId : identifiant de session persistant côté client (sessionStorage) —
      // survit aux reconnexions socket. Fallback socket.id pour vieux clients.
      const rawVoter = typeof voterId === 'string' && voterId.length >= 8 ? voterId.slice(0, 64) : socket.id;
      const voterKey = createHash('sha256').update(rawVoter).digest('hex').slice(0, 16);
      if (q.voters.has(voterKey)) return;
      q.voters.add(voterKey); q.votes++;
      r.questions.sort((a, b) => b.votes - a.votes || a.createdAt - b.createdAt);
      io.to(joinedRoom).emit('qa:updated', publicQuestions(r));
    });

    socket.on('qa:delete', ({ questionId }: { questionId: string }) => {
      if (!joinedRoom || !isAdmin(joinedRoom)) return;
      const r = getRoom(joinedRoom); if (!r) return;
      r.questions = r.questions.filter(q => q.id !== questionId);
      io.to(joinedRoom).emit('qa:updated', publicQuestions(r));
    });

    /* Files admin delete */
    socket.on('file:delete', ({ fileKey }: { fileKey: string }) => {
      if (!joinedRoom || !isAdmin(joinedRoom)) return;
      const r = getRoom(joinedRoom); if (!r) return;
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
}
