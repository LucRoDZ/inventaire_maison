/** Key of the « Apparence » setting of Phase 4 (dark theme removed in Phase 5). */
export const LEGACY_THEME_KEY = 'inventaire.theme';

/**
 * A device that chose « Sombre » before Phase 5 keeps no trace of it: the stored choice and the
 * `data-theme` attribute are removed, so the light tokens apply everywhere.
 */
export function purgeLegacyTheme(storage: Pick<Storage, 'removeItem'> | null, root: HTMLElement) {
  try {
    storage?.removeItem(LEGACY_THEME_KEY);
  } catch {
    // Storage refused (private mode): nothing was stored either.
  }
  root.removeAttribute('data-theme');
}
