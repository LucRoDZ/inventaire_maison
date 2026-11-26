'use client';

import {
  MAX_LOCATIONS_PER_HOUSEHOLD,
  MAX_SHELVES_PER_LOCATION,
  PLACE_NAME_MAX_LENGTH,
  type LocationDto,
  type ShelfDto,
  type ShelfKind,
} from '@inventaire/shared';
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { ApiError } from '../../lib/api';
import { furnitureNameError, reorder } from '../../lib/furniture-edit';
import * as placesApi from '../../lib/places-api';
import { CreateFurnitureSheet } from '../furniture/CreateFurnitureSheet';
import { DeleteFurnitureDialog } from '../furniture/DeleteFurnitureDialog';
import { IconPickerSheet } from '../furniture/IconPickerSheet';
import { NEW_FURNITURE_PARAM } from '../home/HomeView';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';
import { placeIcon } from '../ui/CategoryIcon';
import { iconLabel } from '../ui/icon-labels';

type Api = typeof placesApi;
type Notice = { kind: 'ok' | 'error'; text: string };
type Notify = (notice: Notice) => void;

const field = 'tap-target border-line rounded-xl border bg-white px-3 text-base text-ink w-full';
const KIND_LABELS: Record<ShelfKind, string> = { rack: 'Rangée', plain: 'Étagère simple' };
const iconButton =
  'tap-target text-indigo-mid inline-flex shrink-0 items-center justify-center rounded-full aria-disabled:opacity-40';

function messageOf(error: unknown): string {
  if (error instanceof ApiError && error.status !== 0) return error.message;
  return 'Action impossible : vérifiez la connexion.';
}

const products = (n: number) => (n === 0 ? 'Vide' : `${n} ${n > 1 ? 'produits' : 'produit'}`);

/** Draft of a shelf in the open form. */
interface ShelfDraft {
  name: string;
  kind: ShelfKind;
}

/** Confirmation before a shelf goes: its stock returns to the « Non rangé » tray. */
function DeleteShelfDialog({
  shelf,
  location,
  onConfirm,
  onClose,
}: {
  shelf: ShelfDto;
  location: LocationDto;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const titleId = useId();
  const textId = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <BottomSheet
      role="alertdialog"
      labelledBy={titleId}
      describedBy={textId}
      onClose={onClose}
      initialFocus={cancel}
      closeOnBackdrop={false}
      layer="top"
    >
      <h2 id={titleId} className="text-card-title">
        Supprimer {shelf.name} ?
      </h2>
      <p id={textId} className="text-body">
        Ses produits restent dans {location.name}, sur le plateau « Non rangé ».
      </p>
      <div className="flex flex-col gap-2">
        <Button
          aria-disabled={busy}
          onClick={() => {
            if (busy) return;
            setBusy(true);
            void onConfirm().finally(() => setBusy(false));
          }}
        >
          {busy ? 'Suppression…' : `Supprimer ${shelf.name}`}
        </Button>
        <Button ref={cancel} variant="secondary" onClick={onClose}>
          Annuler
        </Button>
      </div>
    </BottomSheet>
  );
}

/** One compact line per shelf: its name and type (saved with the form), up, down, delete. */
function ShelfLine({
  shelf,
  draft,
  index,
  count,
  onDraft,
  onMove,
  onDelete,
}: {
  shelf: ShelfDto;
  draft: ShelfDraft;
  index: number;
  count: number;
  onDraft: (draft: ShelfDraft) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  return (
    <li
      aria-label={shelf.name}
      className="border-line grid grid-cols-[1fr_auto] items-center gap-x-1 gap-y-1 rounded-xl border p-2"
    >
      <input
        id={`etagere-${shelf.id}`}
        aria-label={`Nom de ${shelf.name}`}
        className={`${field} min-w-0`}
        value={draft.name}
        maxLength={PLACE_NAME_MAX_LENGTH}
        autoComplete="off"
        onChange={(e) => onDraft({ ...draft, name: e.target.value })}
      />
      <button
        type="button"
        aria-label={`Supprimer ${shelf.name}`}
        aria-haspopup="dialog"
        onClick={onDelete}
        className={iconButton}
      >
        <Trash2 size={18} aria-hidden="true" />
      </button>
      <div className="col-span-2 flex items-center gap-1">
        <select
          aria-label={`Type de ${shelf.name}`}
          className={`${field} min-w-0 flex-1`}
          value={draft.kind}
          onChange={(e) => onDraft({ ...draft, kind: e.target.value as ShelfKind })}
        >
          {(Object.keys(KIND_LABELS) as ShelfKind[]).map((value) => (
            <option key={value} value={value}>
              {KIND_LABELS[value]}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label={`Monter ${shelf.name}`}
          aria-disabled={index === 0 || undefined}
          onClick={() => index > 0 && onMove(-1)}
          className={iconButton}
        >
          <ArrowUp size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`Descendre ${shelf.name}`}
          aria-disabled={index === count - 1 || undefined}
          onClick={() => index < count - 1 && onMove(1)}
          className={iconButton}
        >
          <ArrowDown size={18} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

/** The open piece of furniture: name and icon, its shelves, one « Enregistrer ». */
function FurnitureForm({
  location,
  locations,
  index,
  api,
  onChanged,
  onMove,
  onDelete,
  notify,
}: {
  location: LocationDto;
  locations: LocationDto[];
  index: number;
  api: Api;
  onChanged: () => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: (opener: HTMLButtonElement | null) => void;
  notify: Notify;
}) {
  const nameId = useId();
  const nameErrorId = useId();
  const deleteButton = useRef<HTMLButtonElement>(null);
  const shelvesHeading = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState(location.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [icon, setIcon] = useState(location.icon);
  const [picking, setPicking] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, ShelfDraft>>({});
  const [deletingShelf, setDeletingShelf] = useState<ShelfDto | null>(null);
  const [busy, setBusy] = useState(false);
  /** Shelf to focus once it is drawn (just added). */
  const [focusShelf, setFocusShelf] = useState<number | null>(null);
  const Icon = placeIcon(icon);

  const draftOf = (shelf: ShelfDto): ShelfDraft =>
    drafts[shelf.id] ?? { name: shelf.name, kind: shelf.kind };
  const dirtyShelves = location.shelves.filter((shelf) => {
    const draft = draftOf(shelf);
    return draft.name.trim() !== shelf.name || draft.kind !== shelf.kind;
  });
  const dirty = name.trim() !== location.name || icon !== location.icon || dirtyShelves.length > 0;

  useEffect(() => {
    if (focusShelf === null) return;
    const input = document.getElementById(`etagere-${focusShelf}`) as HTMLInputElement | null;
    if (!input) return;
    input.focus();
    input.select();
    setFocusShelf(null);
  }, [focusShelf, location.shelves]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !dirty) return;
    const others = locations.filter((l) => l.id !== location.id).map((l) => l.name);
    const problem = furnitureNameError(name, others);
    if (problem) {
      setNameError(problem);
      document.getElementById(nameId)?.focus();
      return;
    }
    const emptyShelf = dirtyShelves.find((shelf) => draftOf(shelf).name.trim() === '');
    if (emptyShelf) {
      notify({ kind: 'error', text: `Le nom de l’étagère est obligatoire (${emptyShelf.name}).` });
      document.getElementById(`etagere-${emptyShelf.id}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      if (name.trim() !== location.name || icon !== location.icon) {
        await api.updateLocation(location.id, { name: name.trim(), icon });
      }
      await Promise.all(
        dirtyShelves.map((shelf) => {
          const draft = draftOf(shelf);
          return api.updateShelf(shelf.id, { name: draft.name.trim(), kind: draft.kind });
        }),
      );
      setDrafts({});
      notify({ kind: 'ok', text: `${name.trim()} enregistré.` });
      onChanged();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        setNameError('Un meuble porte déjà ce nom : choisissez-en un autre.');
      } else {
        notify({ kind: 'error', text: messageOf(caught) });
      }
    }
    setBusy(false);
  }

  async function addShelf() {
    const taken = new Set(location.shelves.map((s) => s.name.toLowerCase()));
    let n = location.shelves.length + 1;
    while (taken.has(`étagère ${n}`)) n += 1;
    try {
      const created = await api.createShelf({
        locationId: location.id,
        name: `Étagère ${n}`,
        kind: 'plain',
      });
      notify({ kind: 'ok', text: `Étagère ${n} ajoutée : donnez-lui un nom si besoin.` });
      setFocusShelf(created.id);
      onChanged();
    } catch (caught) {
      notify({ kind: 'error', text: messageOf(caught) });
    }
  }

  function moveShelf(shelfIndex: number, direction: -1 | 1) {
    const changes = reorder(location.shelves, shelfIndex, direction);
    void Promise.all(changes.map((c) => api.updateShelf(c.id, { sortOrder: c.sortOrder })))
      .then(onChanged)
      .catch((caught) => notify({ kind: 'error', text: messageOf(caught) }));
  }

  const full = location.shelves.length >= MAX_SHELVES_PER_LOCATION;

  return (
    <form onSubmit={(e) => void save(e)} noValidate className="flex flex-col gap-4 pt-2">
      <div className="flex flex-col gap-1">
        <label htmlFor={nameId} className="text-label">
          Nom du meuble
        </label>
        <div className="flex items-center gap-2">
          <input
            id={nameId}
            className={`${field} min-w-0 flex-1 ${nameError ? 'border-alert' : ''}`}
            value={name}
            maxLength={PLACE_NAME_MAX_LENGTH + 1}
            autoComplete="off"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? nameErrorId : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
          />
          <button
            type="button"
            aria-label={`Icône : ${iconLabel(icon)}. Changer l’icône`}
            aria-haspopup="dialog"
            onClick={() => setPicking(true)}
            className="tap-target border-line bg-lavender text-indigo inline-flex shrink-0 items-center justify-center rounded-xl border"
          >
            <Icon size={22} aria-hidden="true" />
          </button>
        </div>
        {nameError ? (
          <p id={nameErrorId} role="alert" className="text-small text-alert">
            {nameError}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-small">Position dans la maison</span>
        <div className="flex">
          <button
            type="button"
            aria-label={`Monter ${location.name}`}
            aria-disabled={index === 0 || undefined}
            onClick={() => index > 0 && onMove(-1)}
            className={iconButton}
          >
            <ArrowUp size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Descendre ${location.name}`}
            aria-disabled={index === locations.length - 1 || undefined}
            onClick={() => index < locations.length - 1 && onMove(1)}
            className={iconButton}
          >
            <ArrowDown size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <section aria-label={`Étagères de ${location.name}`} className="flex flex-col gap-2">
        <h3 ref={shelvesHeading} tabIndex={-1} className="text-label outline-none">
          Étagères
        </h3>
        {location.shelves.length === 0 ? (
          <p className="text-small">Aucune étagère : tout est sur le plateau « Non rangé ».</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {location.shelves.map((shelf, shelfIndex) => (
              <ShelfLine
                key={shelf.id}
                shelf={shelf}
                draft={draftOf(shelf)}
                index={shelfIndex}
                count={location.shelves.length}
                onDraft={(draft) => setDrafts((current) => ({ ...current, [shelf.id]: draft }))}
                onMove={(direction) => moveShelf(shelfIndex, direction)}
                onDelete={() => setDeletingShelf(shelf)}
              />
            ))}
          </ul>
        )}
        {full ? (
          <p className="text-small">
            {MAX_SHELVES_PER_LOCATION} étagères ou tiroirs au plus : ce meuble est complet.
          </p>
        ) : (
          <Button variant="secondary" className="self-start" onClick={() => void addShelf()}>
            <Plus size={18} aria-hidden="true" />
            Ajouter une étagère
          </Button>
        )}
      </section>

      <Button type="submit" aria-disabled={!dirty || busy}>
        {busy ? 'Enregistrement…' : 'Enregistrer'}
      </Button>

      <div className="border-line border-t pt-2">
        <Button
          ref={deleteButton}
          variant="secondary"
          aria-haspopup="dialog"
          onClick={() => onDelete(deleteButton.current)}
        >
          <Trash2 size={18} aria-hidden="true" />
          Supprimer ce meuble
        </Button>
      </div>

      {picking ? (
        <IconPickerSheet
          name={location.name}
          icon={icon}
          onClose={() => setPicking(false)}
          onSaved={(chosen) => {
            setIcon(chosen);
            setPicking(false);
          }}
        />
      ) : null}
      {deletingShelf ? (
        <DeleteShelfDialog
          shelf={deletingShelf}
          location={location}
          onClose={() => setDeletingShelf(null)}
          onConfirm={async () => {
            try {
              await api.deleteShelf(deletingShelf.id);
              notify({
                kind: 'ok',
                text: `${deletingShelf.name} supprimée : ses produits sont sur le plateau « Non rangé ».`,
              });
              setDeletingShelf(null);
              onChanged();
              // Its line is gone: the focus goes to the title of the shelves.
              requestAnimationFrame(() => shelvesHeading.current?.focus());
            } catch (caught) {
              notify({ kind: 'error', text: messageOf(caught) });
              setDeletingShelf(null);
            }
          }}
        />
      ) : null}
    </form>
  );
}

/** One line per piece of furniture; opened, its form. */
function FurnitureRow({
  location,
  open,
  onToggle,
  children,
}: {
  location: LocationDto;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = useId();
  const Icon = placeIcon(location.icon);
  return (
    <li
      aria-label={`Meuble ${location.name}`}
      className="border-line rounded-card shadow-card border bg-white"
    >
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="tap-target flex w-full items-center gap-3 rounded-[inherit] px-4 py-2 text-left"
        >
          <span
            aria-hidden="true"
            className="bg-lavender text-indigo inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          >
            <Icon size={18} />
          </span>
          <span className="text-card-title min-w-0 flex-1 truncate">{location.name}</span>
          <span className="text-small shrink-0">{products(location.productCount)}</span>
          <ChevronDown
            size={20}
            aria-hidden="true"
            className={`text-indigo-mid shrink-0 transition-transform duration-200 ease-out ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </h2>
      {open ? (
        <div id={panelId} className="px-4 pb-4">
          {children}
        </div>
      ) : null}
    </li>
  );
}

/**
 * The furniture of the house, for every account: one line per piece of furniture, one open at a
 * time (name, icon, order, shelves, one « Enregistrer », then « Supprimer ce meuble »).
 */
export function LocationsAdmin({ api = placesApi }: { api?: Api }) {
  const router = useRouter();
  const [locations, setLocations] = useState<LocationDto[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<LocationDto | null>(null);
  const heading = useRef<HTMLParagraphElement>(null);

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
    const before = locations ?? [];
    const changes = reorder(before, index, direction);
    if (changes.length === 0) return;
    // Optimistic: the new order shows at once, and comes back if the server refuses.
    const order = new Map(changes.map((c) => [c.id, c.sortOrder]));
    setLocations(
      before
        .map((l) => ({ ...l, sortOrder: order.get(l.id) ?? l.sortOrder }))
        .sort((x, y) => x.sortOrder - y.sortOrder || x.id - y.id),
    );
    void Promise.all(changes.map((c) => api.updateLocation(c.id, { sortOrder: c.sortOrder })))
      .then(load)
      .catch((caught) => {
        setLocations(before);
        setNotice({ kind: 'error', text: messageOf(caught) });
      });
  }

  const list = locations ?? [];
  const count = list.length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p ref={heading} tabIndex={-1} className="text-small outline-none">
          {count} {count > 1 ? 'meubles' : 'meuble'} sur {MAX_LOCATIONS_PER_HOUSEHOLD} possibles
        </p>
        {locations !== null && count < MAX_LOCATIONS_PER_HOUSEHOLD ? (
          <Button variant="add" aria-haspopup="dialog" onClick={() => setCreating(true)}>
            <Plus size={20} aria-hidden="true" />
            Ajouter un meuble
          </Button>
        ) : null}
      </div>
      {notice ? (
        <Callout role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</Callout>
      ) : null}
      {loadError ? (
        <Callout role="alert">Impossible de charger les meubles : vérifiez la connexion.</Callout>
      ) : null}
      {locations === null && !loadError ? (
        <p role="status" className="text-small">
          Chargement…
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {list.map((location, index) => (
          <FurnitureRow
            key={location.id}
            location={location}
            open={openId === location.id}
            onToggle={() => setOpenId(openId === location.id ? null : location.id)}
          >
            <FurnitureForm
              location={location}
              locations={list}
              index={index}
              api={api}
              onChanged={load}
              onMove={(direction) => moveLocation(index, direction)}
              onDelete={() => setDeleting(location)}
              notify={setNotice}
            />
          </FurnitureRow>
        ))}
      </ul>
      {creating ? (
        <CreateFurnitureSheet
          existingNames={list.map((l) => l.name)}
          create={api.createLocation}
          onClose={() => setCreating(false)}
          // Back to the house: the new card gets the focus there, and it is announced.
          onCreated={(created) => router.push(`/inventaire?${NEW_FURNITURE_PARAM}=${created.id}`)}
        />
      ) : null}
      {deleting ? (
        <DeleteFurnitureDialog
          location={deleting}
          locations={list}
          remove={api.deleteLocation}
          onClose={() => setDeleting(null)}
          onDeleted={(message) => {
            setDeleting(null);
            setOpenId(null);
            setNotice({ kind: 'ok', text: message });
            load();
            // The line is gone: the focus goes to the top of the list.
            requestAnimationFrame(() => heading.current?.focus());
          }}
        />
      ) : null}
    </div>
  );
}
