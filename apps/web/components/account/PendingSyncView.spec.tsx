import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getQueue, queueOp } from '../../lib/offline/runtime';
import { PendingSyncView } from './PendingSyncView';

afterEach(async () => {
  vi.unstubAllGlobals();
  await getQueue().purge();
});

describe('PendingSyncView', () => {
  it('shows a conflict at once, although the number of waiting operations did not change', async () => {
    await getQueue().ensureScope('scope-test');
    await queueOp({ kind: 'remove', productId: 1, quantity: 2 });
    render(<PendingSyncView />);
    expect(await screen.findByText('En attente de synchronisation.')).toBeInTheDocument();

    const [waiting] = await getQueue().list();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          results: [{ key: waiting!.op.key, status: 'conflict', conflict: 'insufficient_stock' }],
        }),
      ),
    );
    await act(() => getQueue().flush());

    expect(
      await screen.findByText('Le stock est inférieur à la quantité retirée. Rien n’a été retiré.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Réessayer/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Abandonner/ })).toBeInTheDocument();
  });
});
