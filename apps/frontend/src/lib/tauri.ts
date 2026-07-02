/**
 * Tauri runtime helpers.
 *
 * En mode cloud-first, il n'y a plus de sidecar local. L'app (Tauri ou web)
 * pointe vers le serveur distant via VITE_API_URL. isTauri() reste utile pour
 * les spécificités desktop (tray, décorations, etc.).
 */

interface TauriGlobal {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

declare global {
  interface Window {
    __TAURI__?: TauriGlobal;
    __TAURI_INTERNALS__?: unknown; // Tauri 2.x
  }
}

export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

async function invokeSafe<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauri() || !window.__TAURI__) return null;
  try {
    return (await window.__TAURI__.invoke(cmd, args)) as T;
  } catch (e) {
    console.warn(`[tauri] invoke(${cmd}) failed:`, e);
    return null;
  }
}

export const getAppVersion = () => invokeSafe<string>('get_app_version');

/**
 * URL absolue du backend.
 * - Prod (Tauri + web) : VITE_API_URL (défini à la build → pointe vers le VPS)
 * - Dev local          : '' (Vite proxy /api → :3001)
 */
export async function getBackendUrl(): Promise<string> {
  return import.meta.env.VITE_API_URL ?? '';
}
