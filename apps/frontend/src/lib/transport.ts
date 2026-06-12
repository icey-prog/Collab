import { browser } from '$app/environment';
import { networkMode } from './stores/network';

export function initTransport(): string {
  if (!browser) return '';

  // 1. Priorité variable d'environnement (ex: Vercel pointe vers Render)
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) {
    networkMode.set('cloud');
    return envUrl;
  }

  // 2. Détection dynamique (LAN ou Cloud)
  const host = window.location.hostname;
  const isLan = host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.startsWith('10.') || host.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./);
  
  networkMode.set(isLan ? 'lan' : 'cloud');
  
  // Chaîne vide = connexion relative (host actuel)
  return '';
}
