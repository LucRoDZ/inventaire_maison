import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHUNK_RELOAD_KEY, resetSilentUpdate, setBusy } from '../../lib/silent-update';
import { OfflineCallout } from './OfflineCallout';
import { RegisterSW } from './RegisterSW';

const navigation = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));

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

describe('RegisterSW (silent update)', () => {
  type Listener = (event: { isUpdate?: boolean }) => void;
  const listeners = new Map<string, Listener>();
  const register = vi.fn();
  const update = vi.fn();
  const messageSkipWaiting = vi.fn();
  const reload = vi.fn();
  const navigate = vi.fn();

  beforeEach(() => {
    listeners.clear();
    resetSilentUpdate();
    navigation.pathname = '/';
    window.sessionStorage.clear();
    vi.doMock('@serwist/window', () => ({
      Serwist: class {
        addEventListener(name: string, listener: Listener) {
          listeners.set(name, listener);
        }
        register = register;
        update = update;
        messageSkipWaiting = messageSkipWaiting;
      },
    }));
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
  });

  afterEach(() => {
    vi.doUnmock('@serwist/window');
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  /** Renders the component the way the root layout does, then moves to `next`. */
  async function mounted() {
    const view = render(<RegisterSW enabled reload={reload} navigate={navigate} />);
    await vi.waitFor(() => expect(register).toHaveBeenCalledOnce());
    return {
      ...view,
      goTo(next: string) {
        navigation.pathname = next;
        view.rerender(<RegisterSW enabled reload={reload} navigate={navigate} />);
      },
    };
  }
  const newVersionTakesOver = () => act(() => listeners.get('controlling')?.({ isUpdate: true }));

  it('does nothing when disabled', async () => {
    render(<RegisterSW enabled={false} />);
    await Promise.resolve();
    expect(register).not.toHaveBeenCalled();
  });

  it('shows nothing, ever: no message, no button, when a version waits or takes over', async () => {
    const { container } = await mounted();
    act(() => listeners.get('waiting')?.({}));
    newVersionTakesOver();
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.body).not.toHaveTextContent(/nouvelle version|actualiser/i);
    // An older worker left waiting is told to take over by itself.
    expect(messageSkipWaiting).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });

  it('looks for an update when the app comes back to the foreground', async () => {
    await mounted();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(update).toHaveBeenCalledOnce();
  });

  it('switches to the new version at the next navigation, not before', async () => {
    const view = await mounted();
    newVersionTakesOver();
    expect(reload).not.toHaveBeenCalled();
    view.goTo('/inventaire');
    expect(reload).toHaveBeenCalledOnce();
    // Once only.
    view.goTo('/plus');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does not reload at a navigation when the first version is installed (no update)', async () => {
    const view = await mounted();
    act(() => listeners.get('controlling')?.({ isUpdate: false }));
    view.goTo('/inventaire');
    expect(reload).not.toHaveBeenCalled();
  });

  it('turns a link click into a full navigation while a new version waits', async () => {
    await mounted();
    newVersionTakesOver();
    const link = document.createElement('a');
    link.href = '/inventaire';
    link.textContent = 'Inventaire';
    document.body.append(link);
    fireEvent.click(link);
    expect(navigate).toHaveBeenCalledWith('http://localhost:3000/inventaire');
  });

  it('never reloads while the camera of the scanner is on', async () => {
    const view = await mounted();
    newVersionTakesOver();
    setBusy('camera', true);
    view.goTo('/inventaire');
    expect(reload).not.toHaveBeenCalled();
    setBusy('camera', false);
    view.goTo('/plus');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('never reloads during a drag or with a sheet open', async () => {
    const view = await mounted();
    newVersionTakesOver();
    setBusy('drag', true);
    view.goTo('/inventaire/1');
    expect(reload).not.toHaveBeenCalled();
    setBusy('drag', false);

    const sheet = document.createElement('div');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    document.body.append(sheet);
    view.goTo('/inventaire/2');
    expect(reload).not.toHaveBeenCalled();
    sheet.remove();
    view.goTo('/inventaire');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('never turns a click into a reload over unsaved text; the next screen reloads instead', async () => {
    const view = await mounted();
    newVersionTakesOver();
    const field = document.createElement('input');
    const link = document.createElement('a');
    link.href = '/plus';
    document.body.append(field, link);
    fireEvent.input(field, { target: { value: 'Lait demi' } });
    fireEvent.click(link);
    expect(navigate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    // Leaving the screen leaves the text behind: the fresh screen switches version.
    view.goTo('/plus');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('reloads once, silently, when a chunk of an older deployment is missing', async () => {
    await mounted();
    const missing = Object.assign(new Error('Loading chunk 123 failed.'), {
      name: 'ChunkLoadError',
    });
    act(() => {
      window.dispatchEvent(new ErrorEvent('error', { error: missing }));
    });
    expect(reload).toHaveBeenCalledOnce();
    expect(window.sessionStorage.getItem(CHUNK_RELOAD_KEY)).toMatch(/^\d+$/);
    // The flag stops a second reload: no loop.
    act(() => {
      window.dispatchEvent(new ErrorEvent('error', { error: missing }));
    });
    expect(reload).toHaveBeenCalledOnce();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('never reloads for a script cut short because the page is being left', async () => {
    await mounted();
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
      const missing = Object.assign(new Error('Loading chunk 9 failed.'), {
        name: 'ChunkLoadError',
      });
      window.dispatchEvent(new ErrorEvent('error', { error: missing }));
      const script = document.createElement('script');
      document.body.append(script);
      script.dispatchEvent(new Event('error'));
    });
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads for a chunk missing in a dynamic import (unhandled rejection)', async () => {
    await mounted();
    const event = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.defineProperty(event, 'reason', {
      value: new TypeError('Failed to fetch dynamically imported module: /_next/static/x.js'),
    });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(reload).toHaveBeenCalledOnce();
  });

  it('ignores ordinary errors', async () => {
    await mounted();
    act(() => {
      window.dispatchEvent(new ErrorEvent('error', { error: new TypeError('x is undefined') }));
    });
    expect(reload).not.toHaveBeenCalled();
  });
});
