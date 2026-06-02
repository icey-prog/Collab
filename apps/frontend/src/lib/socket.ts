/**
 * Singleton Socket.io client.
 * Connects to the Fastify backend (Vite proxies /socket.io → :3001 in dev).
 * Lazy: only connects once getSocket() is called from a component / store.
 */
import { io, type Socket } from 'socket.io-client';
import { browser } from '$app/environment';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!browser) throw new Error('socket.io is browser-only');
  if (socket) return socket;

  socket = io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    withCredentials: true,
    autoConnect: true
  });

  if (import.meta.env.DEV) {
    socket.on('connect',     () => console.debug('[socket] connected', socket?.id));
    socket.on('disconnect',  (r) => console.debug('[socket] disconnect', r));
    socket.on('connect_error', (e) => console.warn('[socket] error', e.message));
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
