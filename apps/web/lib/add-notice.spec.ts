import { afterEach, describe, expect, it, vi } from 'vitest';
import { addNotice } from './add-notice';

afterEach(() => addNotice.clear());

describe('addNotice', () => {
  it('holds the announcement and tells the subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = addNotice.subscribe(listener);
    const next = { message: '2 produits ajoutés', undo: async () => undefined, commit: vi.fn() };
    addNotice.show(next);
    expect(addNotice.get()).toBe(next);
    addNotice.clear();
    expect(addNotice.get()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    addNotice.show(next);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
