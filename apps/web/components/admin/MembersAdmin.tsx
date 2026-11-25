'use client';

import {
  HOUSEHOLD_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_PATTERN,
  type HouseholdDto,
  type UserDto,
  type UserRole,
} from '@inventaire/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../lib/api';
import { fetchHouseholds } from '../../lib/households-api';
import * as usersApi from '../../lib/users-api';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';

type Api = typeof usersApi;
type Household = Pick<HouseholdDto, 'id' | 'name'>;
/** Value of the household select that asks for a new household. */
const NEW_HOUSEHOLD = 'nouveau';

const field = 'tap-target border-line rounded-xl border bg-white px-3 text-base text-ink w-full';

function messageOf(error: unknown): string {
  if (error instanceof ApiError && error.status !== 0) return error.message;
  return 'Action impossible : vérifiez la connexion.';
}

const passwordProblem = (value: string): string | null =>
  value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH
    ? `Le mot de passe doit faire de ${PASSWORD_MIN_LENGTH} à ${PASSWORD_MAX_LENGTH} caractères.`
    : null;

function CreateForm({
  api,
  households,
  onCreated,
}: {
  api: Api;
  households: Household[];
  onCreated: (user: UserDto) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('member');
  const [household, setHousehold] = useState('');
  const [newName, setNewName] = useState('');
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
    if (household === '') {
      setError('Choisissez le foyer du compte, ou « Nouveau foyer ».');
      return;
    }
    const name = newName.trim();
    if (household === NEW_HOUSEHOLD && (name === '' || name.length > HOUSEHOLD_NAME_MAX_LENGTH)) {
      setError(`Nom du nouveau foyer : 1 à ${HOUSEHOLD_NAME_MAX_LENGTH} caractères.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onCreated(
        await api.createUser(
          household === NEW_HOUSEHOLD
            ? { username: pseudo, password, role, newHouseholdName: name }
            : { username: pseudo, password, role, householdId: Number(household) },
        ),
      );
      setUsername('');
      setPassword('');
      setRole('member');
      setHousehold('');
      setNewName('');
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
      <div className="flex flex-col gap-1">
        <label htmlFor="foyer-du-compte" className="text-label">
          Foyer
        </label>
        <select
          id="foyer-du-compte"
          className={field}
          value={household}
          onChange={(e) => setHousehold(e.target.value)}
        >
          <option value="">Choisir un foyer</option>
          {households.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
          <option value={NEW_HOUSEHOLD}>Nouveau foyer…</option>
        </select>
      </div>
      {household === NEW_HOUSEHOLD ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="nouveau-foyer" className="text-label">
            Nom du nouveau foyer
          </label>
          <input
            id="nouveau-foyer"
            className={field}
            autoComplete="off"
            maxLength={HOUSEHOLD_NAME_MAX_LENGTH}
            aria-describedby="nouveau-foyer-aide"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <p id="nouveau-foyer-aide" className="text-help">
            Le foyer est créé avec le compte, avec les meubles et les catégories du modèle.
          </p>
        </div>
      ) : null}
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
  households,
  onChanged,
}: {
  user: UserDto;
  isSelf: boolean;
  api: Api;
  households: Household[];
  onChanged: (user: UserDto) => void;
}) {
  const [mode, setMode] = useState<'idle' | 'confirm' | 'reset' | 'move'>('idle');
  const [password, setPassword] = useState('');
  const [target, setTarget] = useState('');
  const others = households.filter((h) => h.id !== user.household.id);
  const targetName = others.find((h) => String(h.id) === target)?.name;
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
      <p className="text-small">Foyer : {user.household.name}</p>
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
      {mode === 'move' ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={`deplacer-${user.id}`} className="text-label">
              Nouveau foyer de {user.username}
            </label>
            <select
              id={`deplacer-${user.id}`}
              className={field}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Choisir un foyer</option>
              {others.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
          {targetName ? (
            <p className="text-small">
              {user.username} verra alors l’inventaire de {targetName}, plus celui de{' '}
              {user.household.name}. Ses sessions ouvertes seront coupées.
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              disabled={busy || !targetName}
              onClick={() =>
                void run(
                  () => api.moveUser(user.id, Number(target)),
                  `Compte déplacé dans ${targetName ?? ''}, sessions coupées.`,
                )
              }
            >
              Déplacer {user.username}
            </Button>
            <Button variant="secondary" onClick={() => setMode('idle')}>
              Annuler
            </Button>
          </div>
        </div>
      ) : null}
      {mode === 'idle' ? (
        <div className="flex flex-wrap gap-2">
          {!isSelf && others.length > 0 ? (
            <Button variant="secondary" onClick={() => setMode('move')}>
              Changer de foyer
            </Button>
          ) : null}
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

/**
 * Every account of the instance with its household (admin console): list, creation in an existing
 * or a new household, change of household, password reset, deactivation, reactivation.
 */
export function MembersAdmin({
  currentUserId,
  api = usersApi,
  loadHouseholds = fetchHouseholds,
}: {
  currentUserId: number;
  api?: Api;
  /** Test seam. */
  loadHouseholds?: () => Promise<Household[]>;
}) {
  const [users, setUsers] = useState<UserDto[] | null>(null);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    api
      .fetchUsers()
      .then((list) => setUsers(list))
      .catch(() => setLoadError(true));
    loadHouseholds()
      .then((list) => setHouseholds(list.map(({ id, name }) => ({ id, name }))))
      .catch(() => setLoadError(true));
  }, [api, loadHouseholds]);
  useEffect(load, [load]);

  const replace = (user: UserDto) => {
    setUsers((list) =>
      (list ?? []).some((u) => u.id === user.id)
        ? (list ?? []).map((u) => (u.id === user.id ? user : u))
        : [...(list ?? []), user].sort((a, b) => a.username.localeCompare(b.username)),
    );
    // A new household may have been created with the account.
    setHouseholds((list) =>
      list.some((h) => h.id === user.household.id)
        ? list
        : [...list, user.household].sort((a, b) => a.name.localeCompare(b.name)),
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="membres" className="flex flex-col gap-2">
        <h2 id="membres" className="text-label">
          Comptes
        </h2>
        {loadError ? (
          <Callout role="alert">Impossible de charger les comptes : vérifiez la connexion.</Callout>
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
              households={households}
              onChanged={replace}
            />
          ))}
        </ul>
      </section>
      <section aria-labelledby="creer" className="flex flex-col gap-2">
        <h2 id="creer" className="text-label">
          Ajouter un compte
        </h2>
        <CreateForm api={api} households={households} onCreated={replace} />
      </section>
    </div>
  );
}
