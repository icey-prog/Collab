/**
 * Vérification du rôle admin d'une room via le cookie collab_admin.
 * Format cookie : "<roomId>:<adminToken>" — posé par POST /room/create.
 *
 * Centralisé ici : le même check était dupliqué dans 4 handlers (DELETE room,
 * qa:delete, file:delete, join:room).
 */
import type { RoomConfig } from './state';

/** Depuis un header Cookie brut (handshake Socket.io). */
export function isRoomAdminFromCookieHeader(rawCookieHeader: string | undefined, room: RoomConfig): boolean {
  const raw = rawCookieHeader ?? '';
  const m = /collab_admin=([^;]+)/.exec(raw);
  if (!m) return false;
  return decodeURIComponent(m[1]) === `${room.id}:${room.adminToken}`;
}

/** Depuis les cookies déjà parsés par @fastify/cookie. */
export function isRoomAdminFromCookies(cookies: Record<string, string | undefined>, room: RoomConfig): boolean {
  const val = cookies['collab_admin'] ?? '';
  const [cookieRoom, cookieToken] = val.split(':');
  return cookieRoom === room.id && cookieToken === room.adminToken;
}
