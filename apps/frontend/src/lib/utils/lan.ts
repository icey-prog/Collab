/**
 * Retourne l'URL de base partageable pour la room.
 *
 * Pourquoi : si l'hôte ouvre l'app sur `localhost:5173`, le QR code génère
 * `http://localhost:5173/room/X` → inutile pour les autres appareils sur LAN.
 * On interroge le backend pour obtenir l'IP LAN réelle de la machine,
 * puis on remplace `localhost` par cette IP dans l'URL.
 *
 * En production (Vercel / URL publique), aucun remplacement — origin tel quel.
 */

let _cache: string | null = null;

export async function getSharableBase(): Promise<string> {
  if (typeof window === 'undefined') return '';

  const { hostname, port, protocol } = window.location;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

  // Déjà une URL publique (Vercel, Fly, domaine) — on garde tel quel
  if (!isLocal) return window.location.origin;

  // Cache déjà calculé
  if (_cache) return _cache;

  try {
    const res = await fetch('/api/local-ip');
    if (res.ok) {
      const { ip } = await res.json() as { ip: string | null };
      if (ip) {
        _cache = `http://${ip}${port ? ':' + port : ''}`;
        return _cache;
      }
    }
  } catch { /* réseau ko, on reste sur localhost */ }

  return `${protocol}//${hostname}${port ? ':' + port : ''}`;
}
