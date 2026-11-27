import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  const onClose = vi.fn();
  const utils = render(
    <ScannerView
      onClose={onClose}
      onCode={onCode}
      makeScanner={async () => scanner}
      {...overrides}
    />,
  );
  return { scanner, emit, onCode, onClose, ...utils };
}

describe('ScannerView', () => {
  it('starts the rear camera from the Scanner button and reads codes', async () => {
    const track = makeTrack();
    getUserMedia.mockResolvedValue(makeStream(track));
    const { scanner, emit, onCode } = renderView();

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
    await waitFor(() => expect(scanner.start).toHaveBeenCalled());

    act(() => setVisibility('hidden'));
    expect(track.stop).toHaveBeenCalled();
    expect(scanner.stop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Activer la caméra' })).toBeInTheDocument();
  });

  it('turns the camera off when leaving the screen', async () => {
    const track = makeTrack();
    getUserMedia.mockResolvedValue(makeStream(track));
    const { scanner, unmount } = renderView();
    await waitFor(() => expect(scanner.start).toHaveBeenCalled());
    unmount();
    expect(track.stop).toHaveBeenCalled();
  });

  it('hides the torch button when the camera does not expose it', async () => {
    getUserMedia.mockResolvedValue(makeStream(makeTrack({})));
    const { scanner } = renderView();
    await waitFor(() => expect(scanner.start).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /lampe/ })).toBeNull();
  });

  it('offers the torch when exposed and switches it', async () => {
    const track = makeTrack({ torch: true });
    getUserMedia.mockResolvedValue(makeStream(track));
    const { scanner } = renderView();
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
    await waitFor(() => expect(scanner.start).toHaveBeenCalled());

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Caméra' }), 'cam-2');
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    expect((getUserMedia.mock.calls[1]![0] as MediaStreamConstraints).video).toMatchObject({
      deviceId: { exact: 'cam-2' },
    });
  });

  it('explains how to allow the camera when permission is refused, with the fallbacks at hand', async () => {
    getUserMedia.mockRejectedValue(new DOMException('no', 'NotAllowedError'));
    const onManualCode = vi.fn();
    renderView({ onManualCode });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Accès à la caméra refusé');
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Saisir un code' }));
    expect(onManualCode).toHaveBeenCalledTimes(1);
  });

  it('reports a missing camera', async () => {
    getUserMedia.mockRejectedValue(new DOMException('none', 'NotFoundError'));
    renderView();
    expect(await screen.findByRole('alert')).toHaveTextContent('Aucune caméra disponible');
  });

  it('asks for HTTPS in an insecure context without calling the camera', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    renderView();
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTPS requis');
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});

describe('ScannerView, full screen', () => {
  const READ = { code: '3017620422003', format: 'ean_13' } as const;

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
    Reflect.deleteProperty(navigator, 'vibrate');
  });

  it('opens the camera by itself and offers a close button of 44 px or more', async () => {
    getUserMedia.mockResolvedValue(makeStream(makeTrack()));
    const { scanner, onClose } = renderView();
    await waitFor(() => expect(scanner.start).toHaveBeenCalled());
    expect(screen.getByRole('heading', { level: 1, name: 'Scanner' })).toBeInTheDocument();
    const close = screen.getByRole('button', { name: 'Fermer le scanner' });
    expect(close).toHaveClass('tap-target');
    await userEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('locks the page scroll while scanning and restores it on leaving', async () => {
    getUserMedia.mockResolvedValue(makeStream(makeTrack()));
    document.body.style.overflow = 'auto';
    const { scanner, unmount } = renderView();
    await waitFor(() => expect(scanner.start).toHaveBeenCalled());
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.overscrollBehavior).toBe('none');
    expect(screen.getByText('Placez le code-barres dans le cadre')).toBeInTheDocument();
    unmount();
    expect(document.body.style.overflow).toBe('auto');
    expect(document.body.style.overscrollBehavior).toBe('');
    document.body.style.overflow = '';
  });

  it('locks the corners with a check mark and announces what was read', async () => {
    getUserMedia.mockResolvedValue(makeStream(makeTrack()));
    const { scanner, emit, rerender, onCode } = renderView({ readLabel: null });
    await waitFor(() => expect(scanner.start).toHaveBeenCalled());
    expect(document.querySelector('.lucide-check')).toBeNull();

    act(() => emit(READ));
    expect(document.querySelector('.lucide-check')).not.toBeNull();
    rerender(
      <ScannerView
        onClose={() => undefined}
        onCode={onCode}
        readLabel="Pâte à tartiner"
        makeScanner={async () => scanner}
      />,
    );
    expect(
      screen.getByText('Lu : Pâte à tartiner', { selector: '[aria-live]' }),
    ).toBeInTheDocument();
  });

  it('vibrates on a read only when supported and the setting is on', async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    getUserMedia.mockResolvedValue(makeStream(makeTrack()));
    const { scanner, emit } = renderView();
    await waitFor(() => expect(scanner.start).toHaveBeenCalled());
    act(() => emit(READ));
    expect(vibrate).toHaveBeenCalledTimes(1);

    window.localStorage.setItem('inv_haptics', 'off');
    act(() => emit({ code: '96385074', format: 'ean_8' }));
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('ignores the same code for 1.5 s, then reads it again', async () => {
    getUserMedia.mockResolvedValue(makeStream(makeTrack()));
    const { scanner, emit, onCode } = renderView();
    await waitFor(() => expect(scanner.start).toHaveBeenCalled());
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(10_000);
    act(() => emit(READ));
    now.mockReturnValue(11_000);
    act(() => emit(READ));
    expect(onCode).toHaveBeenCalledTimes(1);
    act(() => emit({ code: '96385074', format: 'ean_8' }));
    expect(onCode).toHaveBeenCalledTimes(2);
    now.mockReturnValue(12_600);
    act(() => emit({ code: '96385074', format: 'ean_8' }));
    expect(onCode).toHaveBeenCalledTimes(3);
    now.mockRestore();
  });

  it('offers zoom only when the track announces it, and applies it', async () => {
    const track = makeTrack({ zoom: { min: 1, max: 4, step: 0.5 } });
    getUserMedia.mockResolvedValue(makeStream(track));
    const { scanner } = renderView();
    await waitFor(() => expect(scanner.start).toHaveBeenCalled());
    const slider = await screen.findByLabelText('Zoom');
    fireEvent.change(slider, { target: { value: '2.5' } });
    await waitFor(() =>
      expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 2.5 }] }),
    );
  });

  it('shows neither torch nor zoom without capabilities, and keeps the bottom panel', async () => {
    getUserMedia.mockResolvedValue(makeStream(makeTrack({})));
    const { scanner } = renderView({ fallbacks: <input aria-label="Code-barres" /> });
    await waitFor(() => expect(scanner.start).toHaveBeenCalled());
    expect(screen.queryByLabelText('Zoom')).toBeNull();
    expect(screen.queryByRole('button', { name: /lampe/ })).toBeNull();
    expect(screen.getByLabelText('Code-barres')).toBeInTheDocument();
  });

  it('renders the offline slot at the top', async () => {
    getUserMedia.mockResolvedValue(makeStream(makeTrack()));
    renderView({ topSlot: <p>À synchroniser (2)</p> });
    expect(await screen.findByText('À synchroniser (2)')).toBeInTheDocument();
  });

  it('comes back with the tab after being hidden', async () => {
    const track = makeTrack();
    getUserMedia.mockResolvedValue(makeStream(track));
    const { scanner } = renderView();
    await waitFor(() => expect(scanner.start).toHaveBeenCalled());
    act(() => setVisibility('hidden'));
    expect(track.stop).toHaveBeenCalled();
    act(() => setVisibility('visible'));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
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
