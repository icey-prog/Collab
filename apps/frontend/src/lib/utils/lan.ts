/**
 * Retourne l'URL de base partageable pour la room (utilisée dans le QR code).
 *
 * - Public URL (Vercel, Fly, custom domain)     → window.location.origin tel quel
 * - Localhost dev                              → interroge backend /local-ip
 * - Tauri                                      → interroge sidecar via URL absolue
 *
 * Sans ce remplacement, le QR donnerait `http://localhost:5173/...` inutilisable
 * pour les autres appareils du LAN.
 */
import { isTauri, getBackendUrl } from '$lib/tauri';

let _cache: string | null = null;

export async function getSharableBase(): Promise<string> {
  if (typeof window === 'undefined') return '';

  // Tauri : on demande au sidecar son IP LAN via fetch sur backend absolu.
  if (isTauri()) {
    if (_cache) return _cache;
    try {
      const base = await getBackendUrl();
      const res = await fetch(`${base}/local-ip`);
      if (res.ok) {
        const { ip } = await res.json() as { ip: string | null };
        // En portable Tauri, le sidecar écoute 127.0.0.1:47931 mais d'autres
        // appareils doivent atteindre l'IP LAN de cette machine. Si on a une IP,
        // on l'utilise pour reconstruire l'URL Web sharable.
        // ATTENTION : actuellement le sidecar n'écoute QUE 127.0.0.1 — le QR ne sera
        // pas accessible depuis d'autres appareils sans rebind sur 0.0.0.0.
        // À adresser dans plan port dynamique (option C).
        if (ip) {
          _cache = `http://${ip}:47931`;
          return _cache;
        }
      }
    } catch { /* fallthrough */ }
    _cache = await getBackendUrl();
    return _cache;
  }

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
