import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type NetworkMode = 'cloud' | 'lan' | 'offline';

export const networkMode = writable<NetworkMode>('cloud');
export const isOnline    = writable<boolean>(true);

// Subscribers can register a flush callback (set by socket layer at runtime)
let _flushCallback: (() => Promise<void>) | null = null;

export function registerOutboxFlush(fn: () => Promise<void>) {
  _flushCallback = fn;
}

if (browser) {
  isOnline.set(navigator.onLine);

  window.addEventListener('online', () => {
    isOnline.set(true);
    _flushCallback?.();
  });

  window.addEventListener('offline', () => {
    isOnline.set(false);
  });
}
