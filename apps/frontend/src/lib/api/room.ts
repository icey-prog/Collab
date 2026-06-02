/**
 * Room API — talks to Fastify backend at /room/*
 * Vite dev proxies these calls to http://localhost:3001.
 */

export interface CreateRoomResponse {
  roomId: string;
}

export interface ApiError {
  error: string;
  retryAfter?: number;
}

export async function createRoom(): Promise<CreateRoomResponse> {
  const res = await fetch('/room/create', {
    method: 'POST',
    credentials: 'include',     // admin cookie httpOnly
    headers: { 'Content-Type': 'application/json' }
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as ApiError;
    throw new Error(err.error ?? `Erreur ${res.status}`);
  }
  return res.json();
}

/**
 * Validates room code shape (6 chars, alphanum without ambiguous ones).
 * Server still owns existence check via /room/:id.
 */
export function isValidRoomCode(code: string): boolean {
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code);
}

export interface RoomPreview {
  exists: boolean;
  participants: number;
  expiresInSec: number;
  full: boolean;
}

/**
 * Lightweight check before entering a room — backend route `GET /room/:id`.
 * Returns 404 if expired / inexistant.
 */
export async function getRoomPreview(roomId: string): Promise<RoomPreview> {
  const res = await fetch(`/room/${roomId}`, { credentials: 'include' });
  if (res.status === 404) return { exists: false, participants: 0, expiresInSec: 0, full: false };
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  return res.json();
}
