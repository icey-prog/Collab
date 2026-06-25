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
const MAX_TOASTS = 3;

// Bug A fix : sans dédup ni plafond, un même message répété (ex. "Failed to
// fetch" en boucle quand le backend reste down) empilait des toasts sans
// limite, débordant hors de la fenêtre.
export function pushToast(text: string, kind: Toast['kind'] = 'info', ttl = 3000) {
  let currentToasts: Toast[] = [];
  toasts.subscribe((arr) => (currentToasts = arr))();
  const dup = currentToasts.find((t) => t.text === text && t.kind === kind);
  if (dup) return; // même message déjà affiché — pas de doublon

  const id = ++toastSeq;
  toasts.update((arr) => {
    const next = [...arr, { id, text, kind }];
    return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
  });
  setTimeout(() => {
    toasts.update((arr) => arr.filter((t) => t.id !== id));
  }, ttl);
}
