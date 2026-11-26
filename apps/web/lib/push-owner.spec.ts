import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dropForeignSubscription } from './push';

const unsubscribe = vi.fn(async () => true);

beforeEach(() => {
  unsubscribe.mockClear();
  localStorage.clear();
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: async () => ({
        pushManager: { getSubscription: async () => ({ endpoint: 'https://push/x', unsubscribe }) },
      }),
    },
  });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('dropForeignSubscription', () => {
  it('drops a subscription left by another account', async () => {
    localStorage.setItem('inventaire-push-owner', 'scope-1');
    await dropForeignSubscription('scope-2');
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(localStorage.getItem('inventaire-push-owner')).toBeNull();
  });

  it('drops a subscription whose owner is unknown', async () => {
    await dropForeignSubscription('scope-2');
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('keeps the subscription of the same account', async () => {
    localStorage.setItem('inventaire-push-owner', 'scope-2');
    await dropForeignSubscription('scope-2');
    expect(unsubscribe).not.toHaveBeenCalled();
  });
});
