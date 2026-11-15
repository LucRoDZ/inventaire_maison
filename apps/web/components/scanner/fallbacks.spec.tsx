import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { isInAppBrowser } from '../../lib/platform';
import { InAppBrowserNotice } from './InAppBrowserNotice';
import { ManualCodeInput } from './ManualCodeInput';
import { PhotoCodeButton } from './PhotoCodeButton';

describe('ManualCodeInput', () => {
  it('uses the numeric keyboard', () => {
    render(<ManualCodeInput onCode={() => undefined} />);
    expect(screen.getByLabelText('Code-barres')).toHaveAttribute('inputmode', 'numeric');
  });

  it('accepts a valid code with Enter and normalises spaces', async () => {
    const onCode = vi.fn();
    render(<ManualCodeInput onCode={onCode} />);
    await userEvent.type(screen.getByLabelText('Code-barres'), '3 017620 422003{Enter}');
    expect(onCode).toHaveBeenCalledWith({ code: '3017620422003', format: 'ean_13' });
    expect(screen.getByLabelText('Code-barres')).toHaveValue('');
  });

  it('turns a UPC-A into its EAN-13 form', async () => {
    const onCode = vi.fn();
    render(<ManualCodeInput onCode={onCode} />);
    await userEvent.type(screen.getByLabelText('Code-barres'), '036000291452{Enter}');
    expect(onCode).toHaveBeenCalledWith({ code: '0036000291452', format: 'ean_13' });
  });

  it('refuses a wrong check digit with a message and keeps the input', async () => {
    const onCode = vi.fn();
    render(<ManualCodeInput onCode={onCode} />);
    await userEvent.type(screen.getByLabelText('Code-barres'), '3017620422004{Enter}');
    expect(onCode).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('incorrect');
    expect(screen.getByLabelText('Code-barres')).toHaveValue('3017620422004');
  });

  it.each([
    ['', 'Saisissez'],
    ['abc', 'chiffres'],
    ['12345', '8, 12 ou 13'],
  ])('refuses %j', async (typed, message) => {
    const onCode = vi.fn();
    render(<ManualCodeInput onCode={onCode} />);
    if (typed) await userEvent.type(screen.getByLabelText('Code-barres'), typed);
    await userEvent.type(screen.getByLabelText('Code-barres'), '{Enter}');
    expect(onCode).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(message);
  });

  it('handles a reader typing all digits at once, then Enter', async () => {
    const onCode = vi.fn();
    render(<ManualCodeInput onCode={onCode} />);
    const input = screen.getByLabelText('Code-barres');
    await userEvent.type(input, '96385074{Enter}', { delay: null });
    expect(onCode).toHaveBeenCalledTimes(1);
    expect(onCode).toHaveBeenCalledWith({ code: '96385074', format: 'ean_8' });
  });
});

describe('PhotoCodeButton', () => {
  const photo = () => new File(['x'], 'photo.jpg', { type: 'image/jpeg' });

  it('opens the rear camera app', () => {
    render(<PhotoCodeButton onCode={() => undefined} decode={async () => null} />);
    const input = screen.getByLabelText('Prendre une photo du code');
    expect(input).toHaveAttribute('capture', 'environment');
    expect(input).toHaveAttribute('accept', 'image/*');
  });

  it('reports the code of a readable photo', async () => {
    const onCode = vi.fn();
    const decode = vi.fn(async () => ({ code: '3017620422003', format: 'ean_13' as const }));
    render(<PhotoCodeButton onCode={onCode} decode={decode} />);
    await userEvent.upload(screen.getByLabelText('Prendre une photo du code'), photo());
    await waitFor(() =>
      expect(onCode).toHaveBeenCalledWith({ code: '3017620422003', format: 'ean_13' }),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says « Code illisible, réessayez » when nothing is read', async () => {
    const onCode = vi.fn();
    render(<PhotoCodeButton onCode={onCode} decode={async () => null} />);
    await userEvent.upload(screen.getByLabelText('Prendre une photo du code'), photo());
    expect(await screen.findByRole('alert')).toHaveTextContent('Code illisible, réessayez');
    expect(onCode).not.toHaveBeenCalled();
  });

  it('treats a decoder failure and an invalid code as unreadable', async () => {
    const onCode = vi.fn();
    const { rerender } = render(
      <PhotoCodeButton
        onCode={onCode}
        decode={async () => {
          throw new Error('wasm');
        }}
      />,
    );
    await userEvent.upload(screen.getByLabelText('Prendre une photo du code'), photo());
    expect(await screen.findByRole('alert')).toHaveTextContent('Code illisible');

    rerender(
      <PhotoCodeButton
        onCode={onCode}
        decode={async () => ({ code: '3017620422004', format: 'ean_13' as const })}
      />,
    );
    await userEvent.upload(screen.getByLabelText('Prendre une photo du code'), photo());
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Code illisible'));
    expect(onCode).not.toHaveBeenCalled();
  });
});

describe('in-app browsers', () => {
  it.each([
    ['Mozilla/5.0 (iPhone) AppleWebKit Mobile Instagram 300.0', true],
    ['Mozilla/5.0 (iPhone) AppleWebKit Mobile [FBAN/FBIOS;FBAV/450.0]', true],
    [
      'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0]',
      true,
    ],
    ['Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari WhatsApp/2.24', true],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Version/17.0 Mobile Safari/604.1',
      false,
    ],
    ['Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36', false],
  ])('detects %s', (ua, expected) => {
    expect(isInAppBrowser(ua)).toBe(expected);
  });

  it('shows « Ouvrez cette page dans Safari ou Chrome » only inside one', () => {
    const { unmount } = render(<InAppBrowserNotice userAgent="Mobile Instagram 300" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Ouvrez cette page dans Safari ou Chrome');
    unmount();
    render(<InAppBrowserNotice userAgent="Mobile Safari/604.1" />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
