export const THEME_KEY = 'inventaire.theme';

export type ThemeChoice = 'auto' | 'light' | 'dark';

export function readTheme(): ThemeChoice {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function resolveTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'auto') return choice;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Sets `data-theme` on <html> and makes the theme-color meta follow `--theme-color`. */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  root.dataset['theme'] = resolveTheme(choice);
  const color = getComputedStyle(root).getPropertyValue('--theme-color').trim();
  if (!color) return;
  const metas = document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  metas.forEach((meta) => {
    meta.removeAttribute('media');
    meta.content = color;
  });
  if (metas.length === 0) {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = color;
    document.head.appendChild(meta);
  }
}

export function saveTheme(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Private mode: the choice then lasts until the page is closed, at most.
  }
  applyTheme(choice);
}

/**
 * Runs in <head> before the first paint (inline, no dependency): data-theme is on <html> from the
 * first DOM, so there is no flash of the other theme.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var c=localStorage.getItem('${THEME_KEY}');var d=c==='dark'||(c!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light')}catch(e){}})()`;
