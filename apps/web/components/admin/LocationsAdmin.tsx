'use client';

import {
  CATEGORY_ICONS,
  PLACE_NAME_MAX_LENGTH,
  type LocationDto,
  type ShelfDto,
  type ShelfKind,
} from '@inventaire/shared';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../lib/api';
import * as placesApi from '../../lib/places-api';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';

type Api = typeof placesApi;
type Notify = (notice: { kind: 'ok' | 'error'; text: string }) => void;

const field = 'tap-target border-line rounded-xl border bg-white px-3 text-base text-ink w-full';
const KIND_LABELS: Record<ShelfKind, string> = { rack: 'Rangée', plain: 'Étagère simple' };

function messageOf(error: unknown): string {
  if (error instanceof ApiError && error.status !== 0) return error.message;
  return 'Action impossible : vérifiez la connexion.';
}

/** Renumbers a list after moving one item, and returns only what changed. */
function reorder<T extends { id: number; sortOrder: number }>(
  items: T[],
  index: number,
  direction: -1 | 1,
): { id: number; sortOrder: number }[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return [];
  const ids = items.map((item) => item.id);
  [ids[index], ids[target]] = [ids[target]!, ids[index]!];
  return ids.flatMap((id, position) =>
    items.find((item) => item.id === id)!.sortOrder === position
      ? []
      : [{ id, sortOrder: position }],
  );
}

function MoveButtons({
  label,
  index,
  count,
  onMove,
}: {
  label: string;
  index: number;
  count: number;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div className="flex gap-1">
      <Button
        variant="secondary"
        aria-label={`Monter ${label}`}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <ArrowUp size={18} aria-hidden="true" />
      </Button>
      <Button
        variant="secondary"
        aria-label={`Descendre ${label}`}
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      >
        <ArrowDown size={18} aria-hidden="true" />
      </Button>
    </div>
  );
}

function ShelfRow({
  shelf,
  index,
  count,
  api,
  onChanged,
  onMove,
  notify,
}: {
  shelf: ShelfDto;
  index: number;
  count: number;
  api: Api;
  onChanged: () => void;
  onMove: (direction: -1 | 1) => void;
  notify: Notify;
}) {
  const [name, setName] = useState(shelf.name);
  const [kind, setKind] = useState<ShelfKind>(shelf.kind);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = name.trim() !== shelf.name || kind !== shelf.kind;

  async function run(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      notify({ kind: 'ok', text: success });
      setConfirming(false);
      onChanged();
    } catch (caught) {
      notify({ kind: 'error', text: messageOf(caught) });
    }
    setBusy(false);
  }

  return (
    <li aria-label={shelf.name} className="border-line flex flex-col gap-2 rounded-xl border p-3">
      <label className="flex flex-col gap-1">
        <span className="text-label">Nom de l’étagère</span>
        <input
          className={field}
          value={name}
          maxLength={PLACE_NAME_MAX_LENGTH}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-label">Type de l’étagère</span>
        <select
          className={field}
          value={kind}
          onChange={(e) => setKind(e.target.value as ShelfKind)}
        >
          {(Object.keys(KIND_LABELS) as ShelfKind[]).map((value) => (
            <option key={value} value={value}>
              {KIND_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={!dirty || busy || name.trim() === ''}
          onClick={() =>
            void run(
              () => api.updateShelf(shelf.id, { name: name.trim(), kind }),
              'Étagère enregistrée.',
            )
          }
        >
          Enregistrer l’étagère
        </Button>
        <MoveButtons label={shelf.name} index={index} count={count} onMove={onMove} />
        <Button variant="secondary" onClick={() => setConfirming(true)}>
          Supprimer
        </Button>
      </div>
      {confirming ? (
        <div className="flex flex-col gap-2">
          <p className="text-small">
            Supprimer « {shelf.name} » ? Les produits iront dans Non rangé.
          </p>
          <div className="flex gap-2">
            <Button
              disabled={busy}
              onClick={() => void run(() => api.deleteShelf(shelf.id), 'Étagère supprimée.')}
            >
              Confirmer la suppression
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function AddShelfForm({
  locationId,
  locationName,
  api,
  onChanged,
  notify,
}: {
  locationId: number;
  locationName: string;
  api: Api;
  onChanged: () => void;
  notify: Notify;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ShelfKind>('plain');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (name.trim() === '') {
      notify({ kind: 'error', text: 'Le nom de l’étagère est obligatoire.' });
      return;
    }
    setBusy(true);
    try {
      await api.createShelf({ locationId, name: name.trim(), kind });
      setName('');
      notify({ kind: 'ok', text: 'Étagère ajoutée.' });
      onChanged();
    } catch (caught) {
      notify({ kind: 'error', text: messageOf(caught) });
    }
    setBusy(false);
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      aria-label={`Ajouter une étagère à ${locationName}`}
      className="flex flex-col gap-2"
    >
      <label className="flex flex-col gap-1">
        <span className="text-label">Nom de la nouvelle étagère</span>
        <input
          className={field}
          value={name}
          maxLength={PLACE_NAME_MAX_LENGTH}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-label">Type de la nouvelle étagère</span>
        <select
          className={field}
          value={kind}
          onChange={(e) => setKind(e.target.value as ShelfKind)}
        >
          {(Object.keys(KIND_LABELS) as ShelfKind[]).map((value) => (
            <option key={value} value={value}>
              {KIND_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="add" disabled={busy}>
        Ajouter l’étagère
      </Button>
    </form>
  );
}

function LocationCard({
  location,
  index,
  count,
  api,
  onChanged,
  onMove,
  notify,
}: {
  location: LocationDto;
  index: number;
  count: number;
  api: Api;
  onChanged: () => void;
  onMove: (direction: -1 | 1) => void;
  notify: Notify;
}) {
  const [name, setName] = useState(location.name);
  const [icon, setIcon] = useState(location.icon);
  const [busy, setBusy] = useState(false);
  const dirty = name.trim() !== location.name || icon !== location.icon;
  const icons = (CATEGORY_ICONS as readonly string[]).includes(icon)
    ? CATEGORY_ICONS
    : [icon, ...CATEGORY_ICONS];

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await api.updateLocation(location.id, { name: name.trim(), icon });
      notify({ kind: 'ok', text: 'Lieu enregistré.' });
      onChanged();
    } catch (caught) {
      notify({ kind: 'error', text: messageOf(caught) });
    }
    setBusy(false);
  }

  function moveShelf(shelfIndex: number, direction: -1 | 1) {
    const changes = reorder(location.shelves, shelfIndex, direction);
    void Promise.all(changes.map((c) => api.updateShelf(c.id, { sortOrder: c.sortOrder })))
      .then(onChanged)
      .catch((caught) => notify({ kind: 'error', text: messageOf(caught) }));
  }

  return (
    <section
      aria-label={`Lieu ${location.name}`}
      className="border-line rounded-card shadow-card flex flex-col gap-3 border bg-white p-4"
    >
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-label">Nom du lieu</span>
          <input
            className={field}
            value={name}
            maxLength={PLACE_NAME_MAX_LENGTH}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-label">Icône du lieu</span>
          <select className={field} value={icon} onChange={(e) => setIcon(e.target.value)}>
            {icons.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={!dirty || busy || name.trim() === ''} onClick={() => void save()}>
            Enregistrer le lieu
          </Button>
          <MoveButtons label={location.name} index={index} count={count} onMove={onMove} />
        </div>
      </div>
      <h3 className="text-label">Étagères</h3>
      <ul className="flex flex-col gap-2">
        {location.shelves.map((shelf, shelfIndex) => (
          <ShelfRow
            key={shelf.id}
            shelf={shelf}
            index={shelfIndex}
            count={location.shelves.length}
            api={api}
            onChanged={onChanged}
            onMove={(direction) => moveShelf(shelfIndex, direction)}
            notify={notify}
          />
        ))}
      </ul>
      <AddShelfForm
        locationId={location.id}
        locationName={location.name}
        api={api}
        onChanged={onChanged}
        notify={notify}
      />
    </section>
  );
}

/** Rename and reorder the locations, manage their shelves. */
export function LocationsAdmin({ api = placesApi }: { api?: Api }) {
  const [locations, setLocations] = useState<LocationDto[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(() => {
    api
      .fetchLocations()
      .then((list) => {
        setLocations(list);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, [api]);
  useEffect(load, [load]);

  function moveLocation(index: number, direction: -1 | 1) {
    const changes = reorder(locations ?? [], index, direction);
    void Promise.all(changes.map((c) => api.updateLocation(c.id, { sortOrder: c.sortOrder })))
      .then(load)
      .catch((caught) => setNotice({ kind: 'error', text: messageOf(caught) }));
  }

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <Callout role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</Callout>
      ) : null}
      {loadError ? (
        <Callout role="alert">Impossible de charger les lieux : vérifiez la connexion.</Callout>
      ) : null}
      {locations === null && !loadError ? (
        <p role="status" className="text-small">
          Chargement…
        </p>
      ) : null}
      {(locations ?? []).map((location, index) => (
        <LocationCard
          key={location.id}
          location={location}
          index={index}
          count={(locations ?? []).length}
          api={api}
          onChanged={load}
          onMove={(direction) => moveLocation(index, direction)}
          notify={setNotice}
        />
      ))}
    </div>
  );
}
