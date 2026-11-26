export const HAPTICS_KEY = 'inv_haptics';

/** « Retour tactile » (Compte): on by default, kept on this device only. */
export function readHaptics(): boolean {
  try {
    return window.localStorage.getItem(HAPTICS_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveHaptics(on: boolean): void {
  try {
    window.localStorage.setItem(HAPTICS_KEY, on ? 'on' : 'off');
  } catch {
    // Private mode: the setting then lasts until the page is closed, at most.
  }
}

/** Short vibration on a read, only when the device supports it and the setting is on. */
export function vibrateOnRead(): void {
  if (!readHaptics()) return;
  try {
    navigator.vibrate?.(60);
  } catch {
    // Vibration is a bonus.
  }
}
