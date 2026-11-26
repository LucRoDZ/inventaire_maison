import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareText, shoppingShareText } from './share';

afterEach(() => vi.unstubAllGlobals());

const item = (id: number, label: string, quantity: number, checked: boolean) => ({
  id,
  product: null,
  label,
  quantity,
  amount: null,
  unit: null,
  checked,
  origin: 'manual' as const,
  createdAt: '2026-06-01T10:00:00.000Z',
});

describe('share', () => {
  it('writes the open lines only', () => {
    const text = shoppingShareText([item(1, 'Pommes', 3, false), item(2, 'Pain', 1, true)]);
    expect(text).toBe('Liste de courses\n- Pommes × 3');
  });

  it('uses Web Share when it exists', async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { share });
    expect(await shareText('Titre', 'texte')).toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'Titre', text: 'texte' });
  });

  it('falls back to the clipboard', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await shareText('Titre', 'texte')).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('texte');
  });

  it('is not an error when the person closes the sheet', async () => {
    vi.stubGlobal('navigator', {
      share: () => Promise.reject(new DOMException('closed', 'AbortError')),
    });
    expect(await shareText('Titre', 'texte')).toBe('cancelled');
  });
});
