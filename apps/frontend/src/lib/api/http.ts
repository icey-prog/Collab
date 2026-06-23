/**
 * fetch wrapper qui résout l'URL backend selon environnement :
 *   - Tauri prod   : préfixe http://127.0.0.1:47931 (sidecar local)
 *   - Web prod     : VITE_API_URL si défini, sinon /api (Vercel rewrites)
 *   - Dev local    : /api (Vite proxy)
 *
 * Usage :
 *   apiFetch('/room/create', { method: 'POST', credentials: 'include' })
 *   // path SANS le préfixe /api — c'est ajouté automatiquement en web.
 */
import { isTauri, getBackendUrl } from '$lib/tauri';

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  // Path doit commencer par /. Strip leading /api si présent (legacy).
  const cleanPath = path.startsWith('/api/') ? path.slice(4) : path;
  const url = await resolveApiUrl(cleanPath);
  return fetch(url, init);
}

async function resolveApiUrl(path: string): Promise<string> {
  if (isTauri()) {
    const base = await getBackendUrl();
    return `${base}${path}`;
  }
  // Web : env VITE_API_URL (Vercel prod) OU /api (dev + Vercel rewrites)
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return `${envUrl}${path}`;
  return `/api${path}`;
}
