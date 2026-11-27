import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INSTALL_STORAGE_KEY,
  SNOOZE_MS,
  dismissForever,
  installMode,
  isDismissed,
  readDismissal,
  shouldShowInstall,
  snooze,
  type InstallEnv,
} from './install';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';
const FIREFOX_ANDROID = 'Mozilla/5.0 (Android 14; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0';
const DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
const FACEBOOK_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0]';
const INSTAGRAM = `${IPHONE} Instagram 300.0`;

const env = (over: Partial<InstallEnv>): InstallEnv => ({
  userAgent: DESKTOP,
  maxTouchPoints: 0,
  standalone: false,
  hasPrompt: false,
  ...over,
});

describe('installMode', () => {
  it.each([
    ['Chrome with the kept event', { userAgent: CHROME_ANDROID, hasPrompt: true }, 'prompt'],
    ['desktop Chrome with the kept event', { hasPrompt: true }, 'prompt'],
    ['Safari on iPhone', { userAgent: IPHONE, maxTouchPoints: 5 }, 'ios'],
    ['Chrome on iPhone', { userAgent: `${IPHONE} CriOS/120.0`, maxTouchPoints: 5 }, 'ios-other'],
    ['Firefox on iPhone', { userAgent: `${IPHONE} FxiOS/120.0`, maxTouchPoints: 5 }, 'ios-other'],
    ['Edge on iPhone', { userAgent: `${IPHONE} EdgiOS/120.0`, maxTouchPoints: 5 }, 'ios-other'],
    ['Firefox on Android', { userAgent: FIREFOX_ANDROID }, 'firefox-android'],
    ['Chrome on Android before the event', { userAgent: CHROME_ANDROID }, 'none'],
    ['a desktop browser without support', {}, 'none'],
    [
      'an app already launched from the home screen',
      { userAgent: IPHONE, standalone: true },
      'none',
    ],
    ['standalone, even with the event', { hasPrompt: true, standalone: true }, 'none'],
    ['an in-app browser on iOS: Safari is the way', { userAgent: INSTAGRAM }, 'ios-other'],
    ['an in-app browser on Android', { userAgent: FACEBOOK_ANDROID, hasPrompt: true }, 'none'],
  ] as const)('%s', (_label, over, expected) => {
    expect(installMode(env(over))).toBe(expected);
  });
});

describe('dismissals', () => {
  let store: Record<string, string>;
  const storage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
  };
  beforeEach(() => {
    store = {};
  });

  it('snoozes for 7 days with a simulated clock', () => {
    const t0 = Date.parse('2026-06-01T10:00:00Z');
    snooze(storage, t0);
    const dismissal = readDismissal(storage);
    expect(isDismissed(dismissal, t0 + SNOOZE_MS - 1)).toBe(true);
    expect(isDismissed(dismissal, t0 + SNOOZE_MS)).toBe(false);
  });

  it('never shows again after « Ne plus afficher »', () => {
    dismissForever(storage);
    expect(isDismissed(readDismissal(storage), Date.now() + 10 * 365 * 24 * 3600 * 1000)).toBe(
      true,
    );
  });

  it('ignores unreadable content and storage failures', () => {
    store[INSTALL_STORAGE_KEY] = 'not json';
    expect(readDismissal(storage)).toBeNull();
    store[INSTALL_STORAGE_KEY] = '{"kind":"until","until":"x"}';
    expect(readDismissal(storage)).toBeNull();
    const broken = {
      getItem: vi.fn(() => {
        throw new Error('denied');
      }),
      setItem: vi.fn(() => {
        throw new Error('denied');
      }),
    };
    expect(readDismissal(broken)).toBeNull();
    expect(() => snooze(broken, 1)).not.toThrow();
  });
});

describe('shouldShowInstall', () => {
  const base = {
    mode: 'ios',
    dismissal: null,
    now: 1000,
    forced: false,
    installed: false,
  } as const;

  it('shows when installable and not dismissed', () => {
    expect(shouldShowInstall(base)).toBe(true);
  });
  it('never shows without a way to install, or once installed', () => {
    expect(shouldShowInstall({ ...base, mode: 'none', forced: true })).toBe(false);
    expect(shouldShowInstall({ ...base, installed: true })).toBe(false);
  });
  it('is hidden while snoozed or dismissed, unless asked from Plus', () => {
    const snoozed = { kind: 'until', until: 5000 } as const;
    expect(shouldShowInstall({ ...base, dismissal: snoozed })).toBe(false);
    expect(shouldShowInstall({ ...base, dismissal: snoozed, forced: true })).toBe(true);
    expect(shouldShowInstall({ ...base, dismissal: { kind: 'never' } })).toBe(false);
    expect(shouldShowInstall({ ...base, dismissal: snoozed, now: 5000 })).toBe(true);
  });
});
