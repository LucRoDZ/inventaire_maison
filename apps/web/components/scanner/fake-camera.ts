import { vi } from 'vitest';

/** A camera that always answers, for tests of screens that open it by themselves. */
export function installFakeCamera(): void {
  const track = {
    stop: vi.fn(),
    getCapabilities: () => ({}),
    getSettings: () => ({}),
    applyConstraints: vi.fn(),
  };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => stream), enumerateDevices: async () => [] },
  });
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  HTMLMediaElement.prototype.play = vi.fn(async () => undefined);
}

/** Replaces the engine factory: a scanner that never reads anything. */
export const idleScanner = async () => ({
  engine: 'zxing' as const,
  start: vi.fn(),
  stop: vi.fn(),
  decodeImage: async () => null,
});
