import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ScannerPage from './page';

let search = '';
const back = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ back, replace }),
}));
const flow = vi.fn<(props: { origin: unknown; onClose: () => void }) => null>(() => null);
vi.mock('../../../components/scanner/ScanFlow', () => ({
  ScanFlow: (props: { origin: unknown; onClose: () => void }) => flow(props),
}));

beforeEach(() => {
  flow.mockClear();
  back.mockClear();
  replace.mockClear();
  search = '';
});

const origin = () => flow.mock.lastCall?.[0].origin;

describe('Scanner page', () => {
  it('opens without origin', () => {
    render(<ScannerPage />);
    expect(origin()).toBeNull();
  });

  it('passes the furniture and shelf the scanner was opened from', () => {
    search = 'lieu=2&etagere=21';
    render(<ScannerPage />);
    expect(origin()).toEqual({ locationId: 2, shelfId: 21 });
  });

  it('ignores a shelf without furniture and anything that is not an identifier', () => {
    search = 'etagere=21';
    render(<ScannerPage />);
    expect(origin()).toBeNull();
    search = 'lieu=abc&etagere=-3';
    render(<ScannerPage />);
    expect(origin()).toBeNull();
  });

  it('closes to the last screen of the app (never the sign-in page), else to the inventory', async () => {
    sessionStorage.clear();
    render(<ScannerPage />);
    const onClose = flow.mock.lastCall![0].onClose;
    onClose();
    expect(replace).toHaveBeenLastCalledWith('/inventaire');
    const { rememberScreen } = await import('../../../lib/last-screen');
    rememberScreen('/courses');
    onClose();
    expect(replace).toHaveBeenLastCalledWith('/courses');
    expect(back).not.toHaveBeenCalled();
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
