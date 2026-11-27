import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useKeyboardOpen } from './use-keyboard-open';

function mockViewport(height: number) {
  const target = new EventTarget() as EventTarget & { height: number };
  target.height = height;
  Object.defineProperty(window, 'visualViewport', { value: target, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  return (next: number) => {
    target.height = next;
    target.dispatchEvent(new Event('resize'));
  };
}

afterEach(() =>
  Object.defineProperty(window, 'visualViewport', { value: null, configurable: true }),
);

describe('useKeyboardOpen', () => {
  it('is false without visualViewport', () => {
    const { result } = renderHook(() => useKeyboardOpen());
    expect(result.current).toBe(false);
  });

  it('follows the visual viewport height', () => {
    const resize = mockViewport(800);
    const { result } = renderHook(() => useKeyboardOpen());
    expect(result.current).toBe(false);
    act(() => resize(400));
    expect(result.current).toBe(true);
    act(() => resize(700));
    expect(result.current).toBe(false);
  });
});
