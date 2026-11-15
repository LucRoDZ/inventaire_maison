import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScanResult, Scanner } from '../../lib/scanner/types';
import { PermissionHelp } from './PermissionHelp';
import { ScannerView } from './ScannerView';

interface FakeTrack {
  stop: ReturnType<typeof vi.fn>;
  getCapabilities: () => Record<string, unknown>;
  getSettings: () => { deviceId: string };
  applyConstraints: ReturnType<typeof vi.fn>;
}

function makeTrack(capabilities: Record<string, unknown> = {}): FakeTrack {
  return {
    stop: vi.fn(),
    getCapabilities: () => capabilities,
    getSettings: () => ({ deviceId: 'cam-1' }),
    applyConstraints: vi.fn(async () => undefined),
  };
}

function makeStream(track: FakeTrack) {
  return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
}

function makeScanner() {
  let emit: (result: ScanResult) => void = () => undefined;
  const scanner: Scanner = {
    engine: 'zxing',
    start: vi.fn((_video, onResult) => {
      emit = onResult;
    }),
    stop: vi.fn(),
    decodeImage: vi.fn(async () => null),
  };
  return { scanner, emit: (result: ScanResult) => emit(result) };
}

const getUserMedia = vi.fn();
const enumerateDevices = vi.fn();

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  getUserMedia.mockReset();
  enumerateDevices.mockReset().mockResolvedValue([]);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia, enumerateDevices },
  });
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  HTMLMediaElement.prototype.play = vi.fn(async () => undefined);
});

afterEach(() => {
  setVisibility('visible');
});

function renderView(overrides: Partial<React.ComponentProps<typeof ScannerView>> = {}) {
  const { scanner, emit } = makeScanner();
  const onCode = vi.fn();
  const onModeChange = vi.fn();
  const utils = render(
    <ScannerView
      mode="add"
      onModeChange={onModeChange}
      onCode={onCode}
      makeScanner={async () => scanner}
      {...overrides}
    />,
  );
  return { scanner, emit, onCode, onModeChange, ...utils };
}

describe('ScannerView', () => {
  it('starts the rear camera from the Scanner button and reads codes', async () => {
    const track = makeTrack();
    getUserMedia.mockResolvedValue(makeStream(track));
    const { scanner, emit, onCode } = renderView();

    await userEvent.click(screen.getByRole('button', { name: 'Scanner' }));
    await waitFor(() => expect(scanner.start).toHaveBeenCalled());

    const constraints = getUserMedia.mock.calls[0]![0] as MediaStreamConstraints;
    expect(constraints.audio).toBe(false);
    expect(constraints.video).toMatchObject({
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    });
    const video = screen.getByLabelText('Aperçu de la caméra') as HTMLVideoElement;
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);

    act(() => emit({ code: '3017620422003', format: 'ean_13' }));
    expect(onCode).toHaveBeenCalledWith({ code: '3017620422003', format: 'ean_13' }, 'add');
  });

  it('turns the camera off when the tab is hidden', async () => {
    const track = makeTrack();
    getUserMedia.mockResolvedValue(makeStream(track));
    const { scanner } = renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Scanner' }));
    await waitFor(() => expect(scanner.start).toHaveBeenCalled());

    act(() => setVisibility('hidden'));
    expect(track.stop).toHaveBeenCalled();
    expect(scanner.stop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Scanner' })).toBeInTheDocument();
  });

  it('turns the camera off when leaving the screen', async () => {
    const track = makeTrack();
    getUserMedia.mockResolvedValue(makeStream(track));
    const { scanner, unmount } = renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Scanner' }));
    await waitFor(() => expect(scanner.start).toHaveBeenCalled());
    unmount();
    expect(track.stop).toHaveBeenCalled();
  });

  it('hides the torch button when the camera does not expose it', async () => {
    getUserMedia.mockResolvedValue(makeStream(makeTrack({})));
    const { scanner } = renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Scanner' }));
    await waitFor(() => expect(scanner.start).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /lampe/ })).toBeNull();
  });

  it('offers the torch when exposed and switches it', async () => {
    const track = makeTrack({ torch: true });
    getUserMedia.mockResolvedValue(makeStream(track));
    const { scanner } = renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Scanner' }));
    await waitFor(() => expect(scanner.start).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: 'Allumer la lampe' }));
    expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] });
    expect(screen.getByRole('button', { name: 'Éteindre la lampe' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('asks for continuous focus only when the camera supports it', async () => {
    const track = makeTrack({ focusMode: ['manual', 'continuous'] });
    getUserMedia.mockResolvedValue(makeStream(track));
    const { scanner } = renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Scanner' }));
    await waitFor(() => expect(scanner.start).toHaveBeenCalled());
    expect(track.applyConstraints).toHaveBeenCalledWith({
      advanced: [{ focusMode: 'continuous' }],
    });
  });

  it('lets the user pick a camera when there are several', async () => {
    enumerateDevices.mockResolvedValue([
      { kind: 'videoinput', deviceId: 'cam-1', label: 'Arrière' },
      { kind: 'videoinput', deviceId: 'cam-2', label: 'Avant' },
      { kind: 'audioinput', deviceId: 'mic', label: 'Micro' },
    ]);
    getUserMedia.mockImplementation(async () => makeStream(makeTrack()));
    const { scanner } = renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Scanner' }));
    await waitFor(() => expect(scanner.start).toHaveBeenCalled());

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Caméra' }), 'cam-2');
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    expect((getUserMedia.mock.calls[1]![0] as MediaStreamConstraints).video).toMatchObject({
      deviceId: { exact: 'cam-2' },
    });
  });

  it('explains how to allow the camera when permission is refused, with the fallbacks at hand', async () => {
    getUserMedia.mockRejectedValue(new DOMException('no', 'NotAllowedError'));
    renderView({ fallbacks: <input aria-label="Code" /> });
    await userEvent.click(screen.getByRole('button', { name: 'Scanner' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Accès à la caméra refusé');
    await userEvent.click(screen.getByRole('button', { name: 'Saisir le code à la main' }));
    expect(screen.getByLabelText('Code')).toHaveFocus();
  });

  it('reports a missing camera', async () => {
    getUserMedia.mockRejectedValue(new DOMException('none', 'NotFoundError'));
    renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Scanner' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Aucune caméra disponible');
  });

  it('asks for HTTPS in an insecure context without calling the camera', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Scanner' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTPS requis');
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('switches mode and reports the mode current at the time of the scan', async () => {
    getUserMedia.mockResolvedValue(makeStream(makeTrack()));
    const { scanner, emit, onCode, onModeChange, rerender } = renderView();
    expect(screen.getByRole('button', { name: 'Ajouter' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Retirer' }));
    expect(onModeChange).toHaveBeenCalledWith('remove');

    await userEvent.click(screen.getByRole('button', { name: 'Scanner' }));
    await waitFor(() => expect(scanner.start).toHaveBeenCalled());
    rerender(
      <ScannerView
        mode="remove"
        onModeChange={onModeChange}
        onCode={onCode}
        makeScanner={async () => scanner}
      />,
    );
    act(() => emit({ code: '96385074', format: 'ean_8' }));
    expect(onCode).toHaveBeenCalledWith({ code: '96385074', format: 'ean_8' }, 'remove');
  });
});

describe('PermissionHelp', () => {
  it.each([
    ['ios', 'Réglages'],
    ['android', 'cadenas'],
    ['desktop', 'barre d’adresse'],
  ] as const)('gives the %s steps', (platform, text) => {
    render(
      <PermissionHelp
        reason="denied"
        platform={platform}
        onRetry={() => undefined}
        onUseFallback={() => undefined}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(text);
  });
});
