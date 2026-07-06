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

/**
 * Télécharge un fichier sans navigation de page. Un `<a href target="_blank">`
 * cross-origin (API sur un domaine différent du frontend) se comporte de
 * façon incohérente selon navigateurs — certains ouvrent un onglet vide,
 * mobile Safari navigue parfois la page courante au lieu de déclencher le
 * téléchargement. fetch + blob + lien éphémère élimine toute navigation réelle.
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`Téléchargement échoué (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
