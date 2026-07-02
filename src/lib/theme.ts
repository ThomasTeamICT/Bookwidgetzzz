import { getPrefs, savePrefs } from './storage';

export type ThemeMode = 'light' | 'dark' | 'auto';

export function applyTheme(mode: ThemeMode) {
  const dark =
    mode === 'dark' ||
    (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function initTheme() {
  applyTheme(getPrefs().theme);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    applyTheme(getPrefs().theme);
  });
}

export function cycleTheme(): ThemeMode {
  const order: ThemeMode[] = ['auto', 'light', 'dark'];
  const prefs = getPrefs();
  const next = order[(order.indexOf(prefs.theme) + 1) % order.length];
  savePrefs({ ...prefs, theme: next });
  applyTheme(next);
  return next;
}
