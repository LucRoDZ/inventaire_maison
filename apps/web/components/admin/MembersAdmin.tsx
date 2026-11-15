'use client';

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_PATTERN,
  type UserDto,
  type UserRole,
} from '@inventaire/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../lib/api';
import * as usersApi from '../../lib/users-api';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';

type Api = typeof usersApi;

const field = 'tap-target border-line rounded-xl border bg-white px-3 text-base text-ink w-full';

function messageOf(error: unknown): string {
  if (error instanceof ApiError && error.status !== 0) return error.message;
  return 'Action impossible : vérifiez la connexion.';
}

const passwordProblem = (value: string): string | null =>
  value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH
    ? `Le mot de passe doit faire de ${PASSWORD_MIN_LENGTH} à ${PASSWORD_MAX_LENGTH} caractères.`
    : null;

function CreateForm({ api, onCreated }: { api: Api; onCreated: (user: UserDto) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('member');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const pseudo = username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(pseudo)) {
      setError('Pseudo de 3 à 30 caractères : lettres minuscules, chiffres, _ . -');
      return;
    }
    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onCreated(await api.createUser({ username: pseudo, password, role }));
      setUsername('');
      setPassword('');
      setRole('member');
    } catch (caught) {
      setError(messageOf(caught));
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
      {error ? <Callout role="alert">{error}</Callout> : null}
      <label className="flex flex-col gap-1">
        <span className="text-label">Pseudo du nouveau membre</span>
        <input
          className={field}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-label">Mot de passe temporaire</span>
        <input
          className={field}
          type="text"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-label">Rôle</span>
        <select
          className={field}
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
        >
          <option value="member">Membre</option>
          <option value="admin">Administrateur</option>
        </select>
      </label>
      <Button type="submit" variant="add" disabled={busy}>
        {busy ? 'Création…' : 'Créer le membre'}
      </Button>
    </form>
  );
}

function MemberRow({
  user,
  isSelf,
  api,
  onChanged,
}: {
  user: UserDto;
  isSelf: boolean;
  api: Api;
  onChanged: (user: UserDto) => void;
}) {
  const [mode, setMode] = useState<'idle' | 'confirm' | 'reset'>('idle');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<UserDto | void>, success: string) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await action();
      if (result) onChanged(result);
      setMode('idle');
      setPassword('');
      setNotice({ kind: 'ok', text: success });
    } catch (caught) {
      setNotice({ kind: 'error', text: messageOf(caught) });
    }
    setBusy(false);
  }

  function reset(event: FormEvent) {
    event.preventDefault();
    const problem = passwordProblem(password);
    if (problem) {
      setNotice({ kind: 'error', text: problem });
      return;
    }
    void run(
      () => api.resetUserPassword(user.id, password),
      'Mot de passe remplacé, sessions coupées.',
    );
  }

  return (
    <li
      aria-label={user.username}
      className="border-line flex flex-col gap-2 rounded-xl border bg-white p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold">
          {user.username}
          {isSelf ? ' (vous)' : ''}
        </span>
        <span className="text-small">
          {user.role === 'admin' ? 'Administrateur' : 'Membre'} ·{' '}
          {user.disabled ? 'Désactivé' : 'Actif'}
        </span>
      </div>
      {notice ? (
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className="text-small">
          {notice.text}
        </p>
      ) : null}
      {mode === 'confirm' ? (
        <div className="flex flex-col gap-2">
          <p className="text-small">
            Désactiver {user.username} ? Ses sessions seront coupées, son historique est gardé.
          </p>
          <div className="flex gap-2">
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api.deactivateUser(user.id);
                  return { ...user, disabled: true };
                }, 'Compte désactivé.')
              }
            >
              Confirmer la désactivation
            </Button>
            <Button variant="secondary" onClick={() => setMode('idle')}>
              Annuler
            </Button>
          </div>
        </div>
      ) : null}
      {mode === 'reset' ? (
        <form onSubmit={reset} noValidate className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-label">Nouveau mot de passe temporaire de {user.username}</span>
            <input
              className={field}
              type="text"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              Enregistrer le mot de passe
            </Button>
            <Button variant="secondary" onClick={() => setMode('idle')}>
              Annuler
            </Button>
          </div>
        </form>
      ) : null}
      {mode === 'idle' ? (
        <div className="flex flex-wrap gap-2">
          {!isSelf ? (
            <Button variant="secondary" onClick={() => setMode('reset')}>
              Nouveau mot de passe
            </Button>
          ) : null}
          {user.disabled ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void run(() => api.reactivateUser(user.id), 'Compte réactivé.')}
            >
              Réactiver
            </Button>
          ) : !isSelf ? (
            <Button variant="secondary" onClick={() => setMode('confirm')}>
              Désactiver
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** Accounts of the household: list, creation, password reset, deactivation, reactivation. */
export function MembersAdmin({
  currentUserId,
  api = usersApi,
}: {
  currentUserId: number;
  api?: Api;
}) {
  const [users, setUsers] = useState<UserDto[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    api
      .fetchUsers()
      .then((list) => setUsers(list))
      .catch(() => setLoadError(true));
  }, [api]);
  useEffect(load, [load]);

  const replace = (user: UserDto) =>
    setUsers((list) =>
      (list ?? []).some((u) => u.id === user.id)
        ? (list ?? []).map((u) => (u.id === user.id ? user : u))
        : [...(list ?? []), user].sort((a, b) => a.username.localeCompare(b.username)),
    );

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="membres" className="flex flex-col gap-2">
        <h2 id="membres" className="text-label">
          Membres
        </h2>
        {loadError ? (
          <Callout role="alert">Impossible de charger les membres : vérifiez la connexion.</Callout>
        ) : null}
        {users === null && !loadError ? (
          <p role="status" className="text-small">
            Chargement…
          </p>
        ) : null}
        <ul className="flex flex-col gap-2">
          {(users ?? []).map((user) => (
            <MemberRow
              key={user.id}
              user={user}
              isSelf={user.id === currentUserId}
              api={api}
              onChanged={replace}
            />
          ))}
        </ul>
      </section>
      <section aria-labelledby="creer" className="flex flex-col gap-2">
        <h2 id="creer" className="text-label">
          Ajouter un membre
        </h2>
        <CreateForm api={api} onCreated={replace} />
      </section>
    </div>
  );
}
