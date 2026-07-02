import { browser } from '$app/environment';
import { networkMode } from './stores/network';

/**
 * URL de base pour Socket.io.
 * - Prod : VITE_API_URL → VPS distant
 * - Dev  : '' → Vite proxy /socket.io → :3001
 */
export async function initTransport(): Promise<string> {
  if (!browser) return '';
  const envUrl = import.meta.env.VITE_API_URL;
  networkMode.set('cloud');
  return envUrl ?? '';
}
