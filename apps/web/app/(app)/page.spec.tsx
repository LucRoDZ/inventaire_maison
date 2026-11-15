import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ScannerPage from './page';

let search = '';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(search) }));
const flow = vi.fn<(props: { origin: unknown }) => null>(() => null);
vi.mock('../../components/scanner/ScanFlow', () => ({
  ScanFlow: (props: { origin: unknown }) => flow(props),
}));

beforeEach(() => {
  flow.mockClear();
  search = '';
});

describe('Scanner page', () => {
  it('opens without origin', () => {
    render(<ScannerPage />);
    expect(flow).toHaveBeenLastCalledWith({ origin: null });
  });

  it('passes the furniture and shelf the scanner was opened from', () => {
    search = 'lieu=2&etagere=21';
    render(<ScannerPage />);
    expect(flow).toHaveBeenLastCalledWith({ origin: { locationId: 2, shelfId: 21 } });
  });

  it('ignores a shelf without furniture and anything that is not an identifier', () => {
    search = 'etagere=21';
    render(<ScannerPage />);
    expect(flow).toHaveBeenLastCalledWith({ origin: null });
    search = 'lieu=abc&etagere=-3';
    render(<ScannerPage />);
    expect(flow).toHaveBeenLastCalledWith({ origin: null });
  });
});
