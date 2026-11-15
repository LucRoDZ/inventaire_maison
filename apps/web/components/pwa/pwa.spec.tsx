import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineCallout } from './OfflineCallout';
import { RegisterSW } from './RegisterSW';
import { UpdateCallout } from './UpdateCallout';

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

describe('OfflineCallout', () => {
  afterEach(() => setOnline(true));

  it('is hidden while online', () => {
    setOnline(true);
    render(<OfflineCallout />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows « Pas de connexion » and says adding and removing are unavailable when offline', () => {
    setOnline(false);
    render(<OfflineCallout />);
    const callout = screen.getByRole('status');
    expect(callout).toHaveTextContent('Pas de connexion');
    expect(callout).toHaveTextContent('ajout et le retrait');
    expect(callout).toHaveTextContent('indisponibles');
  });

  it('follows the offline and online events', () => {
    setOnline(true);
    render(<OfflineCallout />);
    expect(screen.queryByRole('status')).toBeNull();

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Pas de connexion');

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('UpdateCallout', () => {
  it('announces the new version and calls back on Actualiser', async () => {
    const onRefresh = vi.fn();
    render(<UpdateCallout onRefresh={onRefresh} />);
    expect(screen.getByRole('status')).toHaveTextContent('Nouvelle version disponible');
    await userEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});

describe('RegisterSW', () => {
  type Listener = () => void;
  const listeners = new Map<string, Listener>();
  const register = vi.fn();
  const messageSkipWaiting = vi.fn();

  beforeEach(() => {
    listeners.clear();
    vi.doMock('@serwist/window', () => ({
      Serwist: class {
        addEventListener(name: string, listener: Listener) {
          listeners.set(name, listener);
        }
        register = register;
        messageSkipWaiting = messageSkipWaiting;
      },
    }));
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
  });

  afterEach(() => {
    vi.doUnmock('@serwist/window');
    vi.clearAllMocks();
  });

  it('does nothing when disabled', async () => {
    render(<RegisterSW enabled={false} />);
    await Promise.resolve();
    expect(register).not.toHaveBeenCalled();
  });

  it('registers the worker and shows the update message once a version is waiting', async () => {
    render(<RegisterSW enabled />);
    await vi.waitFor(() => expect(register).toHaveBeenCalledOnce());
    expect(screen.queryByRole('status')).toBeNull();

    act(() => listeners.get('waiting')?.());
    expect(screen.getByRole('status')).toHaveTextContent('Nouvelle version disponible');

    await userEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    expect(messageSkipWaiting).toHaveBeenCalledOnce();
  });
});
