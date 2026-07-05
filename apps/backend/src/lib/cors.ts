/**
 * Politique CORS : localhost + LAN privé + origines Tauri + Vercel + FRONT_ORIGIN.
 * Déploiement cloud : exporter FRONT_ORIGIN=https://collab.mondomaine.com
 */
const ENV_ORIGIN = process.env.FRONT_ORIGIN;

const LAN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?::\d+)?$/;

export function corsOriginCheck(
  origin: string | undefined,
  cb: (err: Error | null, allow: boolean) => void,
): void {
  if (!origin) return cb(null, true);                       // curl / same-origin
  if (ENV_ORIGIN && origin === ENV_ORIGIN) return cb(null, true);
  if (LAN_RE.test(origin)) return cb(null, true);
  // Tauri WebView custom-protocol origin (Windows: https://tauri.localhost,
  // macOS/Linux: tauri://localhost).
  if (/^https?:\/\/tauri\.localhost$/.test(origin)) return cb(null, true);
  if (origin === 'tauri://localhost') return cb(null, true);
  // Déploiement Vercel du frontend (prod). Les previews éphémères passent
  // par FRONT_ORIGIN si besoin — pas de wildcard *.vercel.app avec credentials.
  if (origin === 'https://collab-one-lac.vercel.app') return cb(null, true);
  // Log volontairement systématique (pas juste en dev) : un mismatch de
  // domaine ici (ex. redéploiement Vercel qui change de nom de projet)
  // se traduit côté client par un simple "chargement infini" sans indice —
  // ce log est la seule trace qui permette de diagnostiquer sans deviner.
  console.warn(`[cors] origine refusée: ${origin}`);
  return cb(null, false);
}

export function corsSummary(): string {
  return `localhost + LAN${ENV_ORIGIN ? ' + ' + ENV_ORIGIN : ''}`;
}
