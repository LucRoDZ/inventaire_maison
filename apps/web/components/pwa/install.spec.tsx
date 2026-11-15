import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INSTALL_STORAGE_KEY,
  listenForInstallPrompt,
  requestInstallSheet,
  resetInstallStateForTests,
} from '../../lib/install';
import { InstallEntry } from '../plus/InstallEntry';
import { InstallSheet } from './InstallSheet';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const FIREFOX_ANDROID = 'Mozilla/5.0 (Android 14; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0';

function setBrowser(userAgent: string, standalone = false) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
  window.matchMedia = vi.fn().mockReturnValue({ matches: standalone }) as never;
}

function fireInstallPrompt() {
  const event = new Event('beforeinstallprompt') as Event & Record<string, unknown>;
  event['prompt'] = vi.fn().mockResolvedValue(undefined);
  event['userChoice'] = Promise.resolve({ outcome: 'accepted' });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

beforeEach(() => {
  window.localStorage.clear();
  resetInstallStateForTests();
  listenForInstallPrompt();
});
afterEach(() => vi.restoreAllMocks());

describe('InstallSheet', () => {
  it('shows the three iOS steps, then « Plus tard » hides it and remembers', async () => {
    setBrowser(IPHONE);
    render(<InstallSheet />);
    const dialog = await screen.findByRole('dialog', { name: 'Installer l’application' });
    expect(dialog).toHaveTextContent('Étape 1');
    expect(dialog).toHaveTextContent('Étape 3');
    await userEvent.click(screen.getByRole('button', { name: 'Plus tard' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(INSTALL_STORAGE_KEY)!)).toMatchObject({
      kind: 'until',
    });
  });

  it('stays hidden after « Ne plus afficher », even on a new visit', async () => {
    setBrowser(IPHONE);
    const { unmount } = render(<InstallSheet />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ne plus afficher' }));
    unmount();
    render(<InstallSheet />);
    await act(async () => undefined);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('never shows in standalone mode', async () => {
    setBrowser(IPHONE, true);
    render(<InstallSheet />);
    await act(async () => undefined);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows nothing without support', async () => {
    setBrowser('Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0 Safari/537.36');
    render(<InstallSheet />);
    await act(async () => undefined);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the menu instructions on Firefox for Android', async () => {
    setBrowser(FIREFOX_ANDROID);
    render(<InstallSheet />);
    expect(await screen.findByRole('dialog')).toHaveTextContent('trois points');
  });

  it('keeps the browser event and prompts on « Installer », then closes', async () => {
    setBrowser('Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile Safari/537.36');
    render(<InstallSheet />);
    const event = fireInstallPrompt();
    const install = await screen.findByRole('button', { name: 'Installer' });
    await userEvent.click(install);
    expect(event['prompt']).toHaveBeenCalledOnce();
    await act(async () => undefined);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on appinstalled', async () => {
    setBrowser(IPHONE);
    render(<InstallSheet />);
    await screen.findByRole('dialog');
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('InstallEntry in Plus', () => {
  it('reopens a snoozed sheet', async () => {
    setBrowser(IPHONE);
    window.localStorage.setItem(
      INSTALL_STORAGE_KEY,
      JSON.stringify({ kind: 'until', until: Date.now() + 1e9 }),
    );
    render(
      <>
        <ul>
          <InstallEntry />
        </ul>
        <InstallSheet />
      </>,
    );
    await act(async () => undefined);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Installer l’application' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('is hidden in standalone mode', async () => {
    setBrowser(IPHONE, true);
    render(
      <ul>
        <InstallEntry />
      </ul>,
    );
    await act(async () => undefined);
    expect(
      screen.queryByRole('button', { name: 'Installer l’application' }),
    ).not.toBeInTheDocument();
    requestInstallSheet();
  });
});
