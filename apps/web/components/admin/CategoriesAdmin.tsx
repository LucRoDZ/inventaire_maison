'use client';

import {
  CATEGORY_ICONS,
  CATEGORY_NAME_MAX_LENGTH,
  SHELF_LIFE_DAYS_MAX,
  type CategoryDto,
  type CategoryIcon,
} from '@inventaire/shared';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../lib/api';
import type { CategoriesApi } from '../../lib/categories-api';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';
import { categoryIcon } from '../ui/CategoryIcon';
import { IconPicker } from './IconPicker';

type Api = CategoriesApi;
type Notify = (notice: { kind: 'ok' | 'error'; text: string }) => void;

const field = 'tap-target border-line rounded-xl border bg-white px-3 text-base text-ink w-full';

function messageOf(error: unknown): string {
  if (error instanceof ApiError && error.status !== 0) return error.message;
  return 'Action impossible : vérifiez la connexion.';
}

const asIcon = (value: string): CategoryIcon =>
  (CATEGORY_ICONS as readonly string[]).includes(value) ? (value as CategoryIcon) : 'package';

function CategoryRow({
  category,
  index,
  count,
  api,
  onChanged,
  onMove,
  notify,
}: {
  category: CategoryDto;
  index: number;
  count: number;
  api: Api;
  onChanged: () => void;
  onMove: (direction: -1 | 1) => void;
  notify: Notify;
}) {
  const [mode, setMode] = useState<'idle' | 'edit' | 'confirm'>('idle');
  const [name, setName] = useState(category.name);
  const [icon, setIcon] = useState<CategoryIcon>(asIcon(category.icon));
  const [shelfLife, setShelfLife] = useState(category.shelfLifeDays?.toString() ?? '');
  const [shelfLifeError, setShelfLifeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const Icon = categoryIcon(category.icon);

  /** Reads the field: empty means none; otherwise a whole number of days. */
  function readShelfLife(): { ok: true; value: number | null } | { ok: false } {
    const text = shelfLife.trim();
    if (text === '') return { ok: true, value: null };
    const days = Number(text);
    if (!Number.isInteger(days) || days < 1 || days > SHELF_LIFE_DAYS_MAX) {
      setShelfLifeError(
        `Entrez un nombre de jours entre 1 et ${SHELF_LIFE_DAYS_MAX}, ou laissez vide.`,
      );
      return { ok: false };
    }
    return { ok: true, value: days };
  }

  async function run(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      notify({ kind: 'ok', text: success });
      setMode('idle');
      onChanged();
    } catch (caught) {
      notify({ kind: 'error', text: messageOf(caught) });
    }
    setBusy(false);
  }

  return (
    <li
      aria-label={category.name}
      className="border-line flex flex-col gap-2 rounded-xl border bg-white p-3"
    >
      <div className="flex items-center gap-2">
        <Icon size={20} aria-hidden="true" className="text-indigo-mid" />
        <span className="min-w-0 flex-1">
          <span className="text-ink block leading-5 font-semibold">{category.name}</span>
          {category.shelfLifeDays !== null ? (
            <span className="text-help block">
              Durée suggérée : {category.shelfLifeDays}{' '}
              {category.shelfLifeDays > 1 ? 'jours' : 'jour'}
            </span>
          ) : null}
        </span>
        <Button
          variant="secondary"
          className="px-0!"
          aria-label={`Monter ${category.name}`}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          <ArrowUp size={18} aria-hidden="true" />
        </Button>
        <Button
          variant="secondary"
          className="px-0!"
          aria-label={`Descendre ${category.name}`}
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown size={18} aria-hidden="true" />
        </Button>
        {mode === 'idle' ? (
          <Button variant="secondary" className="px-2!" onClick={() => setMode('edit')}>
            Modifier
          </Button>
        ) : null}
      </div>
      {mode === 'edit' ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-label">Nom de la catégorie</span>
            <input
              className={field}
              value={name}
              maxLength={CATEGORY_NAME_MAX_LENGTH}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <IconPicker value={icon} onChange={setIcon} label="Icône de la catégorie" />
          <div className="flex flex-col gap-1">
            <label htmlFor={`shelf-life-${category.id}`} className="text-label">
              Durée de conservation suggérée (jours)
            </label>
            <input
              id={`shelf-life-${category.id}`}
              className={field}
              inputMode="numeric"
              value={shelfLife}
              aria-invalid={shelfLifeError !== null}
              aria-describedby={`shelf-life-help-${category.id}`}
              onChange={(e) => {
                setShelfLife(e.target.value);
                setShelfLifeError(null);
              }}
            />
            <span id={`shelf-life-help-${category.id}`} className="text-help">
              Proposée comme date limite quand on ajoute un produit sans date. Vide : aucune
              suggestion.
            </span>
            {shelfLifeError ? (
              <span role="alert" className="text-small text-alert">
                {shelfLifeError}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || name.trim() === ''}
              onClick={() => {
                const read = readShelfLife();
                if (!read.ok) return;
                void run(
                  () =>
                    api.updateCategory(category.id, {
                      name: name.trim(),
                      icon,
                      ...(read.value !== category.shelfLifeDays
                        ? { shelfLifeDays: read.value }
                        : {}),
                    }),
                  'Catégorie enregistrée.',
                );
              }}
            >
              Enregistrer la catégorie
            </Button>
            {!category.isFallback ? (
              <Button variant="secondary" onClick={() => setMode('confirm')}>
                Supprimer
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={() => {
                setName(category.name);
                setIcon(asIcon(category.icon));
                setShelfLife(category.shelfLifeDays?.toString() ?? '');
                setShelfLifeError(null);
                setMode('idle');
              }}
            >
              Annuler
            </Button>
          </div>
          {category.isFallback ? (
            <p className="text-small">
              « {category.name} » est la catégorie de repli : elle ne peut pas être supprimée.
            </p>
          ) : null}
        </div>
      ) : null}
      {mode === 'confirm' ? (
        <div className="flex flex-col gap-2">
          <p className="text-small">
            Supprimer « {category.name} » ? Les produits iront dans Autre, à confirmer dans À
            classer.
          </p>
          <div className="flex gap-2">
            <Button
              disabled={busy}
              onClick={() =>
                void run(() => api.deleteCategory(category.id), 'Catégorie supprimée.')
              }
            >
              Confirmer la suppression
            </Button>
            <Button variant="secondary" onClick={() => setMode('edit')}>
              Annuler
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function AddCategoryForm({
  api,
  onChanged,
  notify,
}: {
  api: Api;
  onChanged: () => void;
  notify: Notify;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<CategoryIcon>('package');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (name.trim() === '') {
      notify({ kind: 'error', text: 'Le nom de la catégorie est obligatoire.' });
      return;
    }
    setBusy(true);
    try {
      await api.createCategory({ name: name.trim(), icon });
      setName('');
      setIcon('package');
      notify({ kind: 'ok', text: 'Catégorie ajoutée.' });
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
      aria-label="Ajouter une catégorie"
      className="flex flex-col gap-2"
    >
      <label className="flex flex-col gap-1">
        <span className="text-label">Nom de la nouvelle catégorie</span>
        <input
          className={field}
          value={name}
          maxLength={CATEGORY_NAME_MAX_LENGTH}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <IconPicker value={icon} onChange={setIcon} label="Icône de la nouvelle catégorie" />
      <Button type="submit" variant="primary" disabled={busy}>
        Ajouter la catégorie
      </Button>
    </form>
  );
}

/** Categories: name, Lucide icon, order; deletion sends the products to « Autre ». */
export function CategoriesAdmin({ api }: { api: Api }) {
  const [categories, setCategories] = useState<CategoryDto[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(() => {
    api
      .fetchCategories()
      .then((list) => {
        setCategories(list);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, [api]);
  useEffect(load, [load]);

  function move(index: number, direction: -1 | 1) {
    const list = categories ?? [];
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    const ids = list.map((c) => c.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    const changes = ids.flatMap((id, position) =>
      list.find((c) => c.id === id)!.sortOrder === position ? [] : [{ id, sortOrder: position }],
    );
    void Promise.all(changes.map((c) => api.updateCategory(c.id, { sortOrder: c.sortOrder })))
      .then(load)
      .catch((caught) => setNotice({ kind: 'error', text: messageOf(caught) }));
  }

  return (
    <div className="flex flex-col gap-6">
      {notice ? (
        <Callout role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</Callout>
      ) : null}
      {loadError ? (
        <Callout role="alert">
          Impossible de charger les catégories : vérifiez la connexion.
        </Callout>
      ) : null}
      {categories === null && !loadError ? (
        <p role="status" className="text-small">
          Chargement…
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {(categories ?? []).map((category, index) => (
          <CategoryRow
            key={category.id}
            category={category}
            index={index}
            count={(categories ?? []).length}
            api={api}
            onChanged={load}
            onMove={(direction) => move(index, direction)}
            notify={setNotice}
          />
        ))}
      </ul>
      <AddCategoryForm api={api} onChanged={load} notify={setNotice} />
    </div>
  );
}
