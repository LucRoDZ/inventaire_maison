'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/api';
import {
  currentSubscription,
  fetchPushPublicKey,
  pushSupport,
  subscribeThisDevice,
  unsubscribeThisDevice,
  type PushSupport,
  type SubscribeResult,
} from '../../lib/push';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';

interface PushSettingProps {
  /** Test seams. */
  api?: {
    support?: () => PushSupport;
    publicKey?: () => Promise<{ publicKey: string | null }>;
    isSubscribed?: () => Promise<boolean>;
    subscribe?: () => Promise<SubscribeResult>;
    unsubscribe?: () => Promise<void>;
  };
}

type State =
  | { name: 'loading' }
  /** No keys on the server: the option does not exist. */
  | { name: 'hidden' }
  | { name: 'unsupported'; reason: 'ios-not-installed' | 'unsupported' }
  | { name: 'ready'; subscribed: boolean };

const failure = (error: unknown) =>
  error instanceof ApiError && error.status !== 0
    ? error.message
    : 'Impossible de modifier le réglage : vérifiez la connexion.';

/**
 * The daily summary of what is about to expire, on this device. Subscribes or unsubscribes this
 * device only. Without support (iOS outside the installed app) a help text explains what to do;
 * without a server key the option is not shown at all.
 */
export function PushSetting({ api = {} }: PushSettingProps) {
  const seams = useRef(api);
  const [state, setState] = useState<State>({ name: 'loading' });
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const support = (seams.current.support ?? pushSupport)();
    if (!support.supported) {
      setState({ name: 'unsupported', reason: support.reason });
      return;
    }
    (async () => {
      try {
        const { publicKey } = await (seams.current.publicKey ?? fetchPushPublicKey)();
        if (!publicKey) return setState({ name: 'hidden' });
        const subscribed = await (
          seams.current.isSubscribed ?? (async () => (await currentSubscription()) !== null)
        )();
        setState({ name: 'ready', subscribed });
      } catch {
        setState({ name: 'hidden' }); // Cannot tell: better no option than a broken one.
      }
    })();
  }, []);

  if (state.name === 'loading' || state.name === 'hidden') return null;

  if (state.name === 'unsupported') {
    return (
      <section aria-labelledby="notifications" className="flex flex-col gap-1">
        <h2 id="notifications" className="text-card-title">
          Notifications
        </h2>
        <p className="text-small">
          {state.reason === 'ios-not-installed'
            ? 'Sur iPhone et iPad, les notifications ne marchent que depuis l’application installée : ajoutez-la à l’écran d’accueil (Partager, puis Sur l’écran d’accueil), ouvrez-la depuis l’icône, puis revenez ici.'
            : 'Ce navigateur ne permet pas les notifications.'}
        </p>
      </section>
    );
  }

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      if (state.subscribed) {
        await (seams.current.unsubscribe ?? unsubscribeThisDevice)();
        setState({ name: 'ready', subscribed: false });
        setMessage({ kind: 'ok', text: 'Notifications désactivées sur cet appareil.' });
      } else {
        const result = await (seams.current.subscribe ?? subscribeThisDevice)();
        if (result === 'subscribed') {
          setState({ name: 'ready', subscribed: true });
          setMessage({ kind: 'ok', text: 'Notifications activées sur cet appareil.' });
        } else if (result === 'denied') {
          setMessage({
            kind: 'error',
            text: 'Notifications refusées. Autorisez-les dans les réglages du navigateur, puis réessayez.',
          });
        } else {
          setState({ name: 'hidden' });
        }
      }
    } catch (error) {
      setMessage({ kind: 'error', text: failure(error) });
    }
    setBusy(false);
  };

  return (
    <section aria-labelledby="notifications" className="flex flex-col gap-2">
      <h2 id="notifications" className="text-card-title">
        Notifications
      </h2>
      <p className="text-small">
        Chaque matin à 8 h, un résumé de ce qui se périme aujourd’hui ou bientôt. Ce réglage ne
        concerne que cet appareil.
      </p>
      {message ? (
        <Callout role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</Callout>
      ) : null}
      <Button
        variant={state.subscribed ? 'outline' : 'primary'}
        className="self-start"
        disabled={busy}
        onClick={() => void toggle()}
      >
        {state.subscribed ? 'Désactiver les notifications' : 'Activer les notifications'}
      </Button>
    </section>
  );
}
