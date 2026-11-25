'use client';

import { HOUSEHOLD_NAME_MAX_LENGTH, type HouseholdDto } from '@inventaire/shared';
import { Trash2 } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../../lib/api';
import * as householdsApi from '../../lib/households-api';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';

type Api = typeof householdsApi;
type Notify = (notice: { kind: 'ok' | 'error'; text: string }) => void;

const field = 'tap-target border-line rounded-xl border bg-white px-3 text-base text-ink w-full';

function messageOf(error: unknown): string {
  if (error instanceof ApiError && error.status !== 0) return error.message;
  return 'Action impossible : vérifiez la connexion.';
}

const nameProblem = (value: string): string | null =>
  value.trim() === '' || value.trim().length > HOUSEHOLD_NAME_MAX_LENGTH
    ? `Nom du foyer : 1 à ${HOUSEHOLD_NAME_MAX_LENGTH} caractères.`
    : null;

/**
 * Deleting a household erases all its data: the name must be typed again (type-to-confirm), and
 * the dialog says that only a backup brings it back. « Annuler » has the focus.
 */
function DeleteHouseholdDialog({
  household,
  api,
  onDeleted,
  onClose,
}: {
  household: HouseholdDto;
  api: Api;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const textId = useId();
  const inputId = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const matches = typed === household.name;

  async function confirm() {
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteHousehold(household.id, typed);
      onDeleted();
    } catch (caught) {
      setBusy(false);
      setError(messageOf(caught));
    }
  }

  return (
    <BottomSheet
      role="alertdialog"
      labelledBy={titleId}
      describedBy={textId}
      onClose={onClose}
      initialFocus={cancel}
      closeOnBackdrop={false}
    >
      <h2 id={titleId} className="text-card-title">
        Supprimer le foyer {household.name} ?
      </h2>
      <p id={textId} className="text-body">
        {household.locationCount === 0
          ? 'Ses produits'
          : household.locationCount === 1
            ? 'Son meuble, ses produits'
            : `Ses ${household.locationCount} meubles, ses produits`}
        , son stock, ses catégories et son historique seront effacés. Seule une sauvegarde de la
        base permet de revenir en arrière.
      </p>
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-label">
          Retapez « {household.name} » pour confirmer
        </label>
        <input
          id={inputId}
          className={field}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      </div>
      {error ? <Callout role="alert">{error}</Callout> : null}
      <div className="flex flex-col gap-2">
        <Button disabled={!matches || busy} onClick={() => void confirm()}>
          {busy ? 'Suppression…' : `Supprimer ${household.name}`}
        </Button>
        <Button ref={cancel} variant="secondary" onClick={onClose}>
          Annuler
        </Button>
      </div>
    </BottomSheet>
  );
}

function HouseholdCard({
  household,
  api,
  onChanged,
  onDelete,
  notify,
}: {
  household: HouseholdDto;
  api: Api;
  onChanged: () => void;
  onDelete: () => void;
  notify: Notify;
}) {
  const [name, setName] = useState(household.name);
  const [busy, setBusy] = useState(false);
  // The card stays mounted across reloads (keyed by id): follow a new name from the server.
  useEffect(() => setName(household.name), [household.name]);
  const dirty = name.trim() !== household.name;
  const accounts = household.members.length;

  async function rename(event: FormEvent) {
    event.preventDefault();
    const problem = nameProblem(name);
    if (problem) {
      notify({ kind: 'error', text: problem });
      return;
    }
    setBusy(true);
    try {
      await api.renameHousehold(household.id, name.trim());
      notify({ kind: 'ok', text: 'Foyer renommé.' });
      onChanged();
    } catch (caught) {
      notify({ kind: 'error', text: messageOf(caught) });
    }
    setBusy(false);
  }

  return (
    <section
      aria-label={`Foyer ${household.name}`}
      className="border-line rounded-card shadow-card flex flex-col gap-3 border bg-white p-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-card-title">{household.name}</h2>
        <span className="text-small">
          {household.locationCount} {household.locationCount > 1 ? 'meubles' : 'meuble'}
        </span>
      </div>
      {accounts === 0 ? (
        <p className="text-small">Aucun compte.</p>
      ) : (
        <ul aria-label={`Comptes de ${household.name}`} className="text-small flex flex-col gap-1">
          {household.members.map((member) => (
            <li key={member.id}>
              {member.username} · {member.role === 'admin' ? 'Administrateur' : 'Membre'}
              {member.disabled ? ' · Désactivé' : ''}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void rename(e)} noValidate className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-label">Nom du foyer</span>
          <input
            className={field}
            value={name}
            maxLength={HOUSEHOLD_NAME_MAX_LENGTH}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={!dirty || busy}>
          Renommer le foyer
        </Button>
      </form>
      {accounts > 0 ? (
        <p className="text-help">
          Pour supprimer ce foyer, déplacez d’abord{' '}
          {accounts > 1 ? `ses ${accounts} comptes` : 'son compte'} dans un autre foyer (écran
          Comptes).
        </p>
      ) : (
        <Button variant="secondary" aria-haspopup="dialog" onClick={onDelete}>
          <Trash2 size={18} aria-hidden="true" />
          Supprimer le foyer
        </Button>
      )}
    </section>
  );
}

function CreateHouseholdForm({
  api,
  onCreated,
  notify,
}: {
  api: Api;
  onCreated: () => void;
  notify: Notify;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = nameProblem(name);
    if (problem) {
      notify({ kind: 'error', text: problem });
      return;
    }
    setBusy(true);
    try {
      await api.createHousehold(name.trim());
      notify({
        kind: 'ok',
        text: `Foyer « ${name.trim()} » créé avec les meubles et catégories du modèle.`,
      });
      setName('');
      onCreated();
    } catch (caught) {
      notify({ kind: 'error', text: messageOf(caught) });
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-label">Nom du nouveau foyer</span>
        <input
          className={field}
          autoComplete="off"
          maxLength={HOUSEHOLD_NAME_MAX_LENGTH}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <Button type="submit" variant="add" disabled={busy}>
        {busy ? 'Création…' : 'Créer le foyer'}
      </Button>
    </form>
  );
}

/**
 * Admin console: the households of the instance, their accounts and number of pieces of
 * furniture (never their inventory). Create, rename, delete an empty one.
 */
export function HouseholdsAdmin({ api = householdsApi }: { api?: Api }) {
  const [households, setHouseholds] = useState<HouseholdDto[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [deleting, setDeleting] = useState<HouseholdDto | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const load = useCallback(() => {
    api
      .fetchHouseholds()
      .then((list) => {
        setHouseholds(list);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, [api]);
  useEffect(load, [load]);

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <Callout role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</Callout>
      ) : null}
      {loadError ? (
        <Callout role="alert">Impossible de charger les foyers : vérifiez la connexion.</Callout>
      ) : null}
      <CreateHouseholdForm api={api} onCreated={load} notify={setNotice} />
      {households ? (
        <h2 ref={heading} tabIndex={-1} className="text-label outline-none">
          {households.length} {households.length > 1 ? 'foyers' : 'foyer'}
        </h2>
      ) : null}
      {households === null && !loadError ? (
        <p role="status" className="text-small">
          Chargement…
        </p>
      ) : null}
      {(households ?? []).map((household) => (
        <HouseholdCard
          key={household.id}
          household={household}
          api={api}
          onChanged={load}
          onDelete={() => setDeleting(household)}
          notify={setNotice}
        />
      ))}
      {deleting ? (
        <DeleteHouseholdDialog
          household={deleting}
          api={api}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setNotice({ kind: 'ok', text: `Foyer « ${deleting.name} » supprimé.` });
            setDeleting(null);
            load();
            // The card is gone: the focus goes to the top of the list.
            requestAnimationFrame(() => heading.current?.focus());
          }}
        />
      ) : null}
    </div>
  );
}
