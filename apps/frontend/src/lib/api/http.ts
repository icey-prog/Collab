/**
 * Résolution d'URL backend selon environnement :
 *   - Prod (VPS)   : VITE_API_URL + path
 *   - Dev local    : /api + path (Vite proxy)
 *
 * apiUrl() est aussi utilisé pour les liens directs (téléchargement fichiers) —
 * le serveur renvoie des paths relatifs, seul le client connaît son API base.
 */

export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/api/') ? path.slice(4) : path;
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return `${envUrl}${cleanPath}`;
  return `/api${cleanPath}`;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), init);
}
