/**
 * Singleton Socket.io client.
 * - Dev local : Vite proxy /socket.io → :3001
 * - Tauri prod : sidecar local http://127.0.0.1:47931
 * - Web prod   : VITE_API_URL (Fly cloud)
 *
 * Init en 2 temps :
 *   1. await initSocket() une fois au mount (résout URL backend async pour Tauri)
 *   2. getSocket() retourne le singleton synchroniquement partout ensuite
 */
import { io, type Socket } from 'socket.io-client';
import { browser } from '$app/environment';
import { initTransport } from './transport';

let socket: Socket | null = null;
let initPromise: Promise<Socket> | null = null;

export async function initSocket(): Promise<Socket> {
  if (!browser) throw new Error('socket.io is browser-only');
  if (socket) return socket;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const backendUrl = await initTransport();
    const s = io(backendUrl || undefined, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: true
    });

    if (import.meta.env.DEV) {
      s.on('connect',    () => console.debug('[socket] connected', s.id));
      s.on('disconnect', (r) => console.debug('[socket] disconnect', r));
    }
    // Toujours actif (pas gated DEV) : sans ça un handshake refusé (CORS,
    // backend down, mauvaise VITE_API_URL) ne laisse aucune trace en prod —
    // exactement ce qui a rendu le bug CORS de la dernière session invisible
    // jusqu'à investigation manuelle. console.error reste consultable via
    // les devtools d'un utilisateur qui rapporte un souci.
    s.on('connect_error', (e) => console.error('[socket] connect_error:', e.message));
    s.io.on('reconnect_failed', () => console.error('[socket] reconnect_failed: abandon après les tentatives max'));
    socket = s;
    return s;
  })();

  return initPromise;
}

/**
 * Singleton sync. Lance throw si initSocket() pas appelé d'abord.
 * À appeler depuis composants enfants qui assument que la room page a init.
 */
export function getSocket(): Socket {
  if (!socket) throw new Error('socket not initialized — call initSocket() first');
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    initPromise = null;
  }
}
