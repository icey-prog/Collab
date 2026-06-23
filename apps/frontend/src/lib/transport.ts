import { browser } from '$app/environment';
import { networkMode } from './stores/network';
import { isTauri, getBackendUrl } from './tauri';

/**
 * Détermine l'URL de base du backend pour Socket.io.
 *
 * Priorité :
 *   1. Tauri  : http://127.0.0.1:<COLLAB_PORT> (sidecar local)
 *   2. ENV    : VITE_API_URL (build Vercel → Fly cloud)
 *   3. Dev    : '' (Vite proxy /socket.io → :3001)
 *
 * Async pour gérer le round-trip Tauri invoke('get_backend_port').
 */
export async function initTransport(): Promise<string> {
  if (!browser) return '';

  // 1. Tauri (sidecar local)
  if (isTauri()) {
    const url = await getBackendUrl();
    networkMode.set('lan');
    return url;
  }

  // 2. Vercel/cloud build
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) {
    networkMode.set('cloud');
    return envUrl;
  }

  // 3. Dev local (Vite proxy)
  const host = window.location.hostname;
  const isLan = host === 'localhost' || host === '127.0.0.1'
    || host.startsWith('192.168.') || host.startsWith('10.')
    || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host);

  networkMode.set(isLan ? 'lan' : 'cloud');
  return '';
}
