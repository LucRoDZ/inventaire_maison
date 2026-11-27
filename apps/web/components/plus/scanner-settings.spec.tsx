import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readScannerSettings } from '../../lib/scanner-settings';
import { ScannerSettings } from './ScannerSettings';

const enumerateDevices = vi.fn();

beforeEach(() => {
  window.localStorage.clear();
  enumerateDevices.mockReset().mockResolvedValue([]);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { enumerateDevices },
  });
});

describe('ScannerSettings', () => {
  it('shows burst on by default and saves the switch', async () => {
    render(<ScannerSettings />);
    const toggle = screen.getByRole('switch', { name: 'Scan en rafale' });
    expect(toggle).toBeChecked();
    expect(
      screen.getByText(
        'Garde la caméra ouverte et ajoute chaque produit scanné à la suite, sans fermer la fiche. Pratique pour ranger tout un sac de courses.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(readScannerSettings().burst).toBe(false);
  });

  it('explains the empty camera list and keeps the automatic option', async () => {
    render(<ScannerSettings />);
    expect(await screen.findByText(/Aucune caméra à proposer/)).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Caméra arrière (automatique)' }),
    ).toBeInTheDocument();
  });

  it('lists the cameras and saves the choice', async () => {
    enumerateDevices.mockResolvedValue([
      { kind: 'videoinput', deviceId: 'cam-1', label: 'Arrière' },
      { kind: 'videoinput', deviceId: 'cam-2', label: 'Avant' },
    ]);
    render(<ScannerSettings />);
    await screen.findByRole('option', { name: 'Avant' });
    await userEvent.selectOptions(screen.getByLabelText('Caméra par défaut'), 'cam-2');
    expect(readScannerSettings().cameraId).toBe('cam-2');
    await userEvent.selectOptions(screen.getByLabelText('Caméra par défaut'), '');
    await waitFor(() => expect(readScannerSettings().cameraId).toBeNull());
  });
});
