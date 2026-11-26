import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { notificationFor, parsePushPayload, safePushUrl } from '../../lib/push-payload';
import { pushSupport, urlBase64ToBytes } from '../../lib/push';
import { PushSetting } from './PushSetting';

const supported = () => ({ supported: true }) as const;
const withKey = async () => ({ publicKey: 'BKey' });

describe('PushSetting', () => {
  it('offers to enable the notifications of this device, and does it', async () => {
    const subscribe = vi.fn(async () => 'subscribed' as const);
    render(
      <PushSetting
        dataScope="scope-1"
        api={{ support: supported, publicKey: withKey, isSubscribed: async () => false, subscribe }}
      />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Activer les notifications' }));
    expect(subscribe).toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent('activées sur cet appareil');
    expect(
      screen.getByRole('button', { name: 'Désactiver les notifications' }),
    ).toBeInTheDocument();
  });

  it('disables them for this device only', async () => {
    const unsubscribe = vi.fn(async () => undefined);
    render(
      <PushSetting
        dataScope="scope-1"
        api={{
          support: supported,
          publicKey: withKey,
          isSubscribed: async () => true,
          unsubscribe,
        }}
      />,
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Désactiver les notifications' }),
    );
    expect(unsubscribe).toHaveBeenCalled();
    expect(
      await screen.findByRole('button', { name: 'Activer les notifications' }),
    ).toBeInTheDocument();
  });

  it('explains a refused permission', async () => {
    render(
      <PushSetting
        dataScope="scope-1"
        api={{
          support: supported,
          publicKey: withKey,
          isSubscribed: async () => false,
          subscribe: async () => 'denied',
        }}
      />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Activer les notifications' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Notifications refusées');
  });

  it('shows the error of the server', async () => {
    render(
      <PushSetting
        dataScope="scope-1"
        api={{
          support: supported,
          publicKey: withKey,
          isSubscribed: async () => false,
          subscribe: async () => {
            throw new ApiError(500, 'Erreur du serveur');
          },
        }}
      />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Activer les notifications' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Erreur du serveur');
  });

  it('explains how to install the app on iOS, without any button', async () => {
    render(
      <PushSetting
        dataScope="scope-1"
        api={{ support: () => ({ supported: false, reason: 'ios-not-installed' }) }}
      />,
    );
    expect(await screen.findByText(/l’application installée/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('hides everything without a server key', async () => {
    const publicKey = vi.fn(async () => ({ publicKey: null }));
    const { container } = render(
      <PushSetting dataScope="scope-1" api={{ support: supported, publicKey }} />,
    );
    await waitFor(() => expect(publicKey).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('pushSupport', () => {
  it('is unsupported in a browser without push (jsdom)', () => {
    expect(pushSupport().supported).toBe(false);
  });

  it('turns the key of the server into bytes', () => {
    expect(Array.from(urlBase64ToBytes('AQID'))).toEqual([1, 2, 3]);
    expect(Array.from(urlBase64ToBytes('_-8'))).toEqual([255, 239]);
  });
});

describe('push payload of the service worker', () => {
  it('reads a summary and keeps its path', () => {
    const payload = parsePushPayload({
      title: '2 produits à consommer',
      body: 'Lait, yaourt',
      tone: 'urgent',
      url: '/inventaire?vue=liste&echeance=aujourdhui',
    });
    expect(payload).toEqual({
      title: '2 produits à consommer',
      body: 'Lait, yaourt',
      tone: 'urgent',
      url: '/inventaire?vue=liste&echeance=aujourdhui',
    });
    expect(notificationFor(payload!)).toEqual({
      title: '2 produits à consommer',
      options: {
        body: 'Lait, yaourt',
        tag: 'daily-summary',
        data: { url: '/inventaire?vue=liste&echeance=aujourdhui' },
      },
    });
  });

  it('ignores a message that is not a summary', () => {
    expect(parsePushPayload(null)).toBeNull();
    expect(parsePushPayload({ body: 'x' })).toBeNull();
    expect(parsePushPayload('texte')).toBeNull();
  });

  it('never opens another site', () => {
    expect(safePushUrl('https://evil.example')).toBe('/inventaire?vue=liste');
    expect(safePushUrl('//evil.example')).toBe('/inventaire?vue=liste');
    expect(safePushUrl('/courses')).toBe('/courses');
    expect(parsePushPayload({ title: 't', body: 'b', url: 'javascript:1' })?.url).toBe(
      '/inventaire?vue=liste',
    );
  });
});
