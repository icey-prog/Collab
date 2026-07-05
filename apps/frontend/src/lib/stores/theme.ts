/**
 * COLLAB shared theme controller
 * Two independent persisted axes:
 *   1. mode:    light | dark         (class: theme-dark)
 *   2. palette: a | b | c | d        (class: theme-b | theme-c | theme-d ; A = no class)
 *      A chartreuse · B périwinkle · C rosé-wine · D sage-grey
 * Defaults: light + Palette A.
 */
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const KEY_MODE     = 'collab-theme';
const KEY_EXPLICIT = 'collab-theme-explicit'; // posé seulement quand l'utilisateur clique le toggle
const KEY_PAL      = 'collab-palette';

export type Mode = 'light' | 'dark';
export type Palette = 'a' | 'b' | 'c' | 'd';

// Choix explicite de l'utilisateur (localStorage) prioritaire ; sinon on
// respecte la préférence système (prefers-color-scheme) plutôt que de
// forcer 'light' par défaut.
function detectInitialMode(): Mode {
  if (!browser) return 'light';
  if (localStorage.getItem(KEY_EXPLICIT) === '1') {
    const saved = localStorage.getItem(KEY_MODE);
    if (saved === 'dark' || saved === 'light') return saved;
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
const initialMode: Mode = detectInitialMode();

const initialPal: Palette = (() => {
  if (!browser) return 'a';
  const p = localStorage.getItem(KEY_PAL);
  return p === 'b' || p === 'c' || p === 'd' ? p : 'a';
})();

export const mode = writable<Mode>(initialMode);
export const palette = writable<Palette>(initialPal);

if (browser) {
  mode.subscribe((m) => {
    document.body.classList.toggle('theme-dark', m === 'dark');
    try { localStorage.setItem(KEY_MODE, m); } catch {}
  });
  palette.subscribe((p) => {
    document.body.classList.remove('theme-b', 'theme-c', 'theme-d');
    if (p !== 'a') document.body.classList.add(`theme-${p}`);
    try { localStorage.setItem(KEY_PAL, p); } catch {}
  });

  // Tant que l'utilisateur n'a pas cliqué le toggle lui-même, on suit les
  // changements de thème système en direct (ex. bascule automatique du
  // mode sombre au coucher du soleil sur macOS/Windows).
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (localStorage.getItem(KEY_EXPLICIT) === '1') return;
    mode.set(e.matches ? 'dark' : 'light');
  });
}

export const toggleMode = () => {
  try { localStorage.setItem(KEY_EXPLICIT, '1'); } catch {}
  mode.update((m) => (m === 'dark' ? 'light' : 'dark'));
};

export const setPalette = (p: Palette) => palette.set(p);

// Legacy aliases (kept for any earlier code importing them)
export const theme = mode;
export const toggleTheme = toggleMode;
