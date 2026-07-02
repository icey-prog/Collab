/**
 * Retourne l'URL de base partageable pour le QR code de la room.
 *
 * En mode cloud : VITE_PUBLIC_URL si le frontend et l'API sont sur des domaines
 * distincts, sinon VITE_API_URL, sinon window.location.origin.
 *
 * VITE_PUBLIC_URL : URL publique du frontend (ex: https://collab.monserveur.com)
 * VITE_API_URL    : URL du backend API          (ex: https://collab.monserveur.com)
 */
export async function getSharableBase(): Promise<string> {
  if (typeof window === 'undefined') return '';
  return (
    import.meta.env.VITE_PUBLIC_URL ||
    import.meta.env.VITE_API_URL ||
    window.location.origin
  );
}
