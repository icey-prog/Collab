/**
 * Tauri runtime helpers — used by /host page and landing redirect.
 *
 * When the SvelteKit build is bundled inside Tauri, window.__TAURI__ exists
 * and exposes invoke()/event APIs. In a normal browser, those calls are no-ops.
 *
 * Stub for v1: real Rust commands (start_backend, get_local_ip, etc.) come in Lot G.
 */

interface TauriGlobal {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  event: any;
}

declare global {
  interface Window {
    __TAURI__?: TauriGlobal;
    __TAURI_INTERNALS__?: unknown;  // Tauri 2.x
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

/* ── Public stubs — real impls land in Lot G (Rust side) ─── */

export const startBackend       = () => invokeSafe<boolean>('start_backend');
export const stopBackend        = () => invokeSafe<boolean>('stop_backend');
export const isBackendRunning   = () => invokeSafe<boolean>('is_backend_running');
export const getBackendPort     = () => invokeSafe<number>('get_backend_port');
export const getLocalIp         = () => invokeSafe<string>('get_local_ip');
export const checkHotspotActive = () => invokeSafe<boolean>('check_hotspot_active');
export const openHotspotSettings = () => invokeSafe<void>('open_hotspot_settings');
export const openLogFile        = () => invokeSafe<void>('open_log_file');
export const readLog            = () => invokeSafe<string>('read_log');
export const diagSnapshot       = () => invokeSafe<Record<string, unknown>>('diag_snapshot');

export function onBackendFailed(callback: (err: string) => void) {
  if (!isTauri() || !window.__TAURI__ || !window.__TAURI__.event) return;
  window.__TAURI__.event.listen('backend_failed', (e: any) => {
    callback(e.payload as string);
  });
}

/**
 * URL absolue du backend (sidecar Tauri local OR cloud Fly).
 * - En Tauri prod : http://127.0.0.1:<port> où port vient du Rust
 * - En web prod   : VITE_API_URL (Vercel env) ou window.location.origin
 * - En dev local  : '' (Vite proxy /api → :3001)
 *
 * Cache : la fonction est appelée plein d'endroits, on évite le round-trip Tauri.
 */
let _backendUrl: string | null = null;

// Bug D fix : depuis l'app desktop, "Rejoindre" doit pouvoir cibler le sidecar
// d'une AUTRE machine (PC hôte) au lieu du sidecar local 127.0.0.1. Sans cet
// override, getBackendUrl() renvoie toujours le backend local — le joiner ne
// trouve jamais la room créée sur l'hôte distant.
let _joinOverrideUrl: string | null = null;

export function setJoinHostOverride(url: string | null): void {
  _joinOverrideUrl = url;
  _backendUrl = null; // invalide le cache pour que le prochain getBackendUrl() le reprenne
}

export async function getBackendUrl(): Promise<string> {
  if (_joinOverrideUrl) return _joinOverrideUrl;
  if (_backendUrl !== null) return _backendUrl;
  if (isTauri()) {
    const port = await getBackendPort();
    _backendUrl = port ? `http://127.0.0.1:${port}` : 'http://127.0.0.1:47931';
    return _backendUrl;
  }
  _backendUrl = '';
  return _backendUrl;
}
