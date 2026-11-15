'use client';

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@inventaire/shared';
import { useState, type FormEvent } from 'react';
import { changePassword, passwordErrorMessage } from '../../lib/auth';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';

const field = 'tap-target border-line rounded-xl border bg-white px-3 text-base text-ink w-full';

/** Changes the password of the signed-in user; the other devices are signed out by the API. */
export function PasswordForm({ change = changePassword }: { change?: typeof changePassword }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (current === '' || next === '') {
      setMessage({ kind: 'error', text: 'Saisissez votre mot de passe actuel et le nouveau' });
      return;
    }
    if (next.length < PASSWORD_MIN_LENGTH || next.length > PASSWORD_MAX_LENGTH) {
      setMessage({
        kind: 'error',
        text: `Le nouveau mot de passe doit faire de ${PASSWORD_MIN_LENGTH} à ${PASSWORD_MAX_LENGTH} caractères`,
      });
      return;
    }
    if (next !== confirmation) {
      setMessage({
        kind: 'error',
        text: 'La confirmation ne correspond pas au nouveau mot de passe',
      });
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      await change(current, next);
      setCurrent('');
      setNext('');
      setConfirmation('');
      setMessage({
        kind: 'ok',
        text: 'Mot de passe modifié. Les autres appareils devront se reconnecter.',
      });
    } catch (caught) {
      setMessage({ kind: 'error', text: passwordErrorMessage(caught) });
    }
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {message ? (
        <Callout role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</Callout>
      ) : null}
      <label className="flex flex-col gap-1">
        <span className="text-label">Mot de passe actuel</span>
        <input
          className={field}
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-label">Nouveau mot de passe</span>
        <input
          className={field}
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-label">Confirmer le nouveau mot de passe</span>
        <input
          className={field}
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? 'Enregistrement…' : 'Changer le mot de passe'}
      </Button>
    </form>
  );
}
