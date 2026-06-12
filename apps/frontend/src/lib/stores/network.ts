import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type NetworkMode = 'cloud' | 'lan' | 'offline';

export const networkMode = writable<NetworkMode>('cloud');
export const isOnline = writable<boolean>(true);

if (browser) {
  // Init online status
  isOnline.set(navigator.onLine);

  // Listen to network events
  window.addEventListener('online', () => {
    isOnline.set(true);
    // You might want to trigger a reconnection or sync here
  });
  window.addEventListener('offline', () => {
    isOnline.set(false);
  });
}
