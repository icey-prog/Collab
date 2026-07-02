/**
 * fetch wrapper qui résout l'URL backend selon environnement :
 *   - Prod (VPS)   : VITE_API_URL + path
 *   - Dev local    : /api + path (Vite proxy)
 */

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const cleanPath = path.startsWith('/api/') ? path.slice(4) : path;
  const url = resolveApiUrl(cleanPath);
  return fetch(url, init);
}

function resolveApiUrl(path: string): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return `${envUrl}${path}`;
  return `/api${path}`;
}
