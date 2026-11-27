import { useSyncExternalStore } from 'react';
import { detectPlatform, isInAppBrowser } from './platform';

/** Chrome, Edge and Android browsers hand the install prompt over in this event. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallMode = 'prompt' | 'ios' | 'ios-other' | 'firefox-android' | 'none';

export interface InstallEnv {
  userAgent: string;
  maxTouchPoints: number;
  /** Already launched from the home screen. */
  standalone: boolean;
  /** `beforeinstallprompt` was received and kept. */
  hasPrompt: boolean;
}

/** How the app can be installed here; `none` when it is installed already or cannot be. */
export function installMode(env: InstallEnv): InstallMode {
  if (env.standalone) return 'none';
  const platform = detectPlatform(env.userAgent, env.maxTouchPoints);
  // In an app's own browser (Instagram, Facebook…) on iOS, the way out is Safari.
  if (isInAppBrowser(env.userAgent)) return platform === 'ios' ? 'ios-other' : 'none';
  if (env.hasPrompt) return 'prompt';
  if (platform === 'ios') {
    // Only Safari can add a site to the home screen on iOS; other browsers are shells around it.
    return /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|GSA\//i.test(env.userAgent)
      ? 'ios-other'
      : 'ios';
  }
  if (platform === 'android' && /Firefox|Fennec/i.test(env.userAgent)) return 'firefox-android';
  return 'none';
}

export const INSTALL_STORAGE_KEY = 'inventaire.install';
/** « Plus tard » hides the invitation for 7 days. */
export const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export type Dismissal = { kind: 'never' } | { kind: 'until'; until: number } | null;

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function readDismissal(storage: KeyValueStorage): Dismissal {
  try {
    const raw = storage.getItem(INSTALL_STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'kind' in parsed) {
      if (parsed.kind === 'never') return { kind: 'never' };
      if (parsed.kind === 'until' && 'until' in parsed && typeof parsed.until === 'number') {
        return { kind: 'until', until: parsed.until };
      }
    }
  } catch {
    // unreadable storage or content: behave as if nothing was stored
  }
  return null;
}

function write(storage: KeyValueStorage, value: Dismissal): void {
  try {
    storage.setItem(INSTALL_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // private mode: the invitation will simply come back
  }
}

export const snooze = (storage: KeyValueStorage, now: number): void =>
  write(storage, { kind: 'until', until: now + SNOOZE_MS });

export const dismissForever = (storage: KeyValueStorage): void => write(storage, { kind: 'never' });

export function isDismissed(dismissal: Dismissal, now: number): boolean {
  if (dismissal === null) return false;
  return dismissal.kind === 'never' || now < dismissal.until;
}

/** The state machine: show the sheet when installable, not dismissed (or when asked from Plus). */
export function shouldShowInstall(input: {
  mode: InstallMode;
  dismissal: Dismissal;
  now: number;
  forced: boolean;
  installed: boolean;
}): boolean {
  if (input.mode === 'none' || input.installed) return false;
  return input.forced || !isDismissed(input.dismissal, input.now);
}

/* ---- Browser-side store: the deferred prompt, « installed », and the request from Plus. ---- */

interface InstallState {
  prompt: BeforeInstallPromptEvent | null;
  installed: boolean;
  forced: boolean;
}

let state: InstallState = { prompt: null, installed: false, forced: false };
const listeners = new Set<() => void>();
let listening = false;

function update(patch: Partial<InstallState>): void {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

/** Starts listening once; called from the root layout so that an early event is not lost. */
export function listenForInstallPrompt(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    update({ prompt: event as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => {
    dismissForever(window.localStorage);
    update({ prompt: null, installed: true, forced: false });
  });
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
}

/** « Installer l'application » in Plus: show the sheet whatever was dismissed. */
export const requestInstallSheet = (): void => update({ forced: true });
export const closeInstallSheet = (): void => update({ forced: false });

/** Opens the browser's own dialog; the kept event can only be used once. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = state.prompt;
  if (!event) return 'unavailable';
  update({ prompt: null });
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === 'accepted') update({ installed: true, forced: false });
  return outcome;
}

/** The environment of the running browser. */
export function currentEnv(hasPrompt: boolean): InstallEnv {
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone,
    hasPrompt,
  };
}

/** Test seam. */
export function resetInstallStateForTests(): void {
  state = { prompt: null, installed: false, forced: false };
  listeners.forEach((listener) => listener());
}
