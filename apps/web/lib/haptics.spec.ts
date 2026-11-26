import { afterEach, describe, expect, it, vi } from 'vitest';
import { HAPTICS_KEY, readHaptics, saveHaptics, vibrateOnRead } from './haptics';

afterEach(() => {
  window.localStorage.clear();
  Reflect.deleteProperty(navigator, 'vibrate');
});

describe('haptics', () => {
  it('is on by default and remembers the choice', () => {
    expect(readHaptics()).toBe(true);
    saveHaptics(false);
    expect(window.localStorage.getItem(HAPTICS_KEY)).toBe('off');
    expect(readHaptics()).toBe(false);
    saveHaptics(true);
    expect(readHaptics()).toBe(true);
  });

  it('vibrates only when supported and enabled', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    vibrateOnRead();
    expect(vibrate).toHaveBeenCalledTimes(1);
    saveHaptics(false);
    vibrateOnRead();
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('does nothing without navigator.vibrate', () => {
    expect(() => vibrateOnRead()).not.toThrow();
  });
});
