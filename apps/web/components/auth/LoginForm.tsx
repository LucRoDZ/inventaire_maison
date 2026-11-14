'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { login, loginErrorMessage } from '../../lib/auth';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (username.trim() === '' || password === '') {
      setError('Saisissez votre pseudo et votre mot de passe');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await login(username, password);
      router.replace('/');
      router.refresh();
    } catch (caught) {
      setError(loginErrorMessage(caught));
      setPending(false);
    }
  }

  const field = 'tap-target border-line rounded-xl border bg-white px-3 text-base text-ink w-full';

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {error ? <Callout role="alert">{error}</Callout> : null}
      <label className="flex flex-col gap-1">
        <span className="text-label">Pseudo</span>
        <input
          className={field}
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-label">Mot de passe</span>
        <input
          className={field}
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? 'Connexion…' : 'Se connecter'}
      </Button>
    </form>
  );
}
