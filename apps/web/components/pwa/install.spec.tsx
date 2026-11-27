import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INSTALL_STORAGE_KEY,
  listenForInstallPrompt,
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
  const CHROME_IOS = `${IPHONE} CriOS/120.0`;
  const CHROME_DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0 Safari/537.36';
  const renderEntry = () =>
    render(
      <ul>
        <InstallEntry />
      </ul>,
    );
  const row = () => screen.findByRole('button', { name: /Installer l’application/ });

  it('shows a non clickable installed line in standalone mode', async () => {
    setBrowser(IPHONE, true);
    renderEntry();
    expect(await screen.findByText('Application installée')).toBeInTheDocument();
    expect(screen.getByText('Ouverte depuis l’écran d’accueil')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('calls the native prompt once, then falls back to the help sheet', async () => {
    setBrowser(CHROME_DESKTOP);
    renderEntry();
    const event = fireInstallPrompt();
    (event['userChoice'] as unknown) = Promise.resolve({ outcome: 'dismissed' });
    await userEvent.click(await row());
    expect(event['prompt']).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(await row());
    expect(event['prompt']).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('dialog', { name: 'Installer l’application' })).toBeVisible();
  });

  it('turns into the installed line after an accepted prompt', async () => {
    setBrowser(CHROME_DESKTOP);
    renderEntry();
    fireInstallPrompt();
    await userEvent.click(await row());
    expect(await screen.findByText('Application installée')).toBeInTheDocument();
  });

  it('explains the three steps on Safari for iOS', async () => {
    setBrowser(IPHONE);
    renderEntry();
    await userEvent.click(await row());
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(3);
  });

  it('asks to open Safari on another iOS browser', async () => {
    setBrowser(CHROME_IOS);
    renderEntry();
    await userEvent.click(await row());
    expect(
      await screen.findByText('Ouvrez l’application dans Safari pour l’installer.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Copier le lien' })).toBeInTheDocument();
  });

  it('gives the menu instruction without any event, and copies the link', async () => {
    setBrowser(FIREFOX_ANDROID);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderEntry();
    await userEvent.click(await row());
    expect(await screen.findByText(/Ouvrez le menu ⋮ du navigateur/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Copier le lien' }));
    expect(writeText).toHaveBeenCalledWith(window.location.origin);
    expect(await screen.findByRole('status')).toHaveTextContent('Lien copié');
  });

  it('stays silent when copying fails', async () => {
    setBrowser(FIREFOX_ANDROID);
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderEntry();
    await userEvent.click(await row());
    await userEvent.click(screen.getByRole('button', { name: 'Copier le lien' }));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
