import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type NetworkMode = 'cloud' | 'offline';

export const networkMode = writable<NetworkMode>('cloud');
export const isOnline    = writable<boolean>(true);

// Le flush de l'outbox offline est déclenché par 'room:joined' (room page),
// pas par l'event 'online' — le serveur droppe les emits avant re-join.

if (browser) {
  isOnline.set(navigator.onLine);
  window.addEventListener('online',  () => isOnline.set(true));
  window.addEventListener('offline', () => isOnline.set(false));
}
