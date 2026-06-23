/**
 * Room state — participants, admin flag, sidebar collapsed, active module, toasts.
 * Wired to Socket.io events by useRoom() in routes/room/[id]/+page.svelte.
 */
import { writable, derived } from 'svelte/store';

export type Module = 'notes' | 'files' | 'qa';
export type RoomStatus = 'connecting' | 'joined' | 'full' | 'not_found' | 'closed';

export const participants = writable<number>(0);
export const isAdmin      = writable<boolean>(false);
export const sbCollapsed  = writable<boolean>(false);
export const activeModule = writable<Module>('notes');
export const status       = writable<RoomStatus>('connecting');
export const expiresInSec = writable<number>(4 * 60 * 60);

export const expiresLabel = derived(expiresInSec, ($s) => {
  const h = Math.floor($s / 3600);
  const m = Math.floor(($s % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
});

/* ── Toasts ───────────────────────────────────────────── */
export interface Toast {
  id: number;
  text: string;
  kind?: 'info' | 'success' | 'error';
}
export const toasts = writable<Toast[]>([]);
let toastSeq = 0;

export function pushToast(text: string, kind: Toast['kind'] = 'info', ttl = 3000) {
  const id = ++toastSeq;
  toasts.update((arr) => [...arr, { id, text, kind }]);
  setTimeout(() => {
    toasts.update((arr) => arr.filter((t) => t.id !== id));
  }, ttl);
}
