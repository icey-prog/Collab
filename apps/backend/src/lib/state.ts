/**
 * État in-memory des rooms + helpers de cycle de vie.
 * Storage: Maps en mémoire (pas de Redis) — suffisant pour le MVP.
 */
import * as Y from 'yjs';
import { randomBytes } from 'node:crypto';
import { mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data');
export const UPLOAD_DIR = join(DATA_DIR, 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

export const ROOM_TTL_MS = 4 * 60 * 60 * 1000;   // 4h
export const FILE_TTL_MS = 24 * 60 * 60 * 1000;  // 24h
export const MAX_PARTICIPANTS = 4;
export const MAX_FILE_BYTES = 500 * 1024 * 1024;   // 500 MB par fichier
export const MAX_FILES_PER_ROOM = 20;               // anti-DoS disque
export const MAX_ROOM_BYTES = 1024 * 1024 * 1024;   // 1 GB cumulés par room
export const MAX_YJS_UPDATE = 256 * 1024;        // 256 KB par update
export const MAX_NOTES_CHARS = 200_000;          // cap texte notes (anti-DoS RAM)

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface Question {
  id: string; text: string; votes: number;
  voters: Set<string>; createdAt: number;
}
export interface FileMeta {
  key: string; name: string; size: number;
  url: string; expiresAt: number;
}
export interface RoomConfig {
  id: string;
  createdAt: number;
  expiresAt: number;
  adminToken: string;
  participants: Set<string>;   // socket ids
  questions: Question[];
  files: FileMeta[];
  doc: Y.Doc;
}

export const rooms = new Map<string, RoomConfig>();

export function genRoomId(): string {
  let id = '';
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i++) id += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
  return id;
}

export function isValidRoomCode(id: string): boolean {
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(id);
}

export function getRoom(id: string): RoomConfig | undefined {
  const r = rooms.get(id);
  if (!r) return undefined;
  if (Date.now() > r.expiresAt) { destroyRoom(id); return undefined; }
  return r;
}

export function destroyRoom(id: string): void {
  const r = rooms.get(id);
  if (!r) return;
  r.doc.destroy();
  for (const f of r.files) { try { unlinkSync(join(UPLOAD_DIR, f.key)); } catch {} }
  rooms.delete(id);
}

export function publicFiles(r: RoomConfig): FileMeta[] {
  const now = Date.now();
  return r.files.filter(f => f.expiresAt > now);
}

export function publicQuestions(r: RoomConfig) {
  return r.questions.map(q => ({ id: q.id, text: q.text, votes: q.votes, createdAt: q.createdAt }));
}

/** Janitor TTL — purge rooms et fichiers expirés chaque minute. */
export function startJanitor(): void {
  setInterval(() => {
    const now = Date.now();
    for (const [id, r] of rooms) if (r.expiresAt < now) destroyRoom(id);
    for (const r of rooms.values()) {
      r.files = r.files.filter(f => {
        if (f.expiresAt > now) return true;
        try { unlinkSync(join(UPLOAD_DIR, f.key)); } catch {}
        return false;
      });
    }
  }, 60_000);
}
