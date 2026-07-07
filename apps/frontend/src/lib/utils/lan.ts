/**
 * Retourne l'URL de base partageable pour le QR code / lien de la room.
 *
 * Un lien de partage sert à OUVRIR la room dans un navigateur — il doit donc
 * pointer vers le FRONTEND, jamais vers l'API. VITE_API_URL (le backend, ex.
 * https://collab-backend.duckdns.org) ne doit surtout PAS entrer ici : c'était
 * la cause des QR qui menaient au backend au lieu du site.
 *
 * VITE_PUBLIC_URL : override optionnel (domaine custom du frontend). En son
 * absence, window.location.origin — le domaine où l'utilisateur est déjà,
 * c'est-à-dire le frontend — est le bon défaut.
 */
export async function getSharableBase(): Promise<string> {
  if (typeof window === 'undefined') return '';
  return import.meta.env.VITE_PUBLIC_URL || window.location.origin;
}
