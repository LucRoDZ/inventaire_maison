/**
 * The last screen of the application shown with the bottom bar, so that « Fermer le scanner »
 * returns there. Kept in memory and in the tab's session storage (a reload keeps it); never the
 * sign-in page, which a plain `history.back()` would reach right after signing in.
 */
const KEY = 'inventaire.last-screen';
let last: string | null = null;

export function rememberScreen(path: string): void {
  // `/` only redirects to the scanner: never a screen to come back to.
  if (path === '/' || path.startsWith('/?') || path.startsWith('/scanner')) return;
  last = path;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    // Private mode: memory only.
  }
}

export function lastScreen(): string {
  if (last) return last;
  try {
    return sessionStorage.getItem(KEY) ?? '/inventaire';
  } catch {
    return '/inventaire';
  }
}
