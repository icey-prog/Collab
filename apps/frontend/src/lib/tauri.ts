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
export const getLocalIp         = () => invokeSafe<string>('get_local_ip');
export const checkDockerRunning = () => invokeSafe<boolean>('check_docker_installed');
