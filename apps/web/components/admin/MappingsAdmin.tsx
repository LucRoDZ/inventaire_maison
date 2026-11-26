'use client';

import type { CategoryDto, OffCategoryMapDto } from '@inventaire/shared';
import { OFF_TAG_PATTERN } from '@inventaire/shared';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../../lib/api';
import type { CategoriesApi } from '../../lib/categories-api';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';

type Api = CategoriesApi;
type Notify = (notice: { kind: 'ok' | 'error'; text: string }) => void;

const field = 'tap-target border-line rounded-xl border bg-white px-3 text-base text-ink w-full';
const TAG_HELP = 'Tag Open Food Facts au format « fr:slug », par exemple en:cheeses.';

function messageOf(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return 'Ce tag est déjà associé à une catégorie.';
    if (error.status !== 0) return error.message;
  }
  return 'Action impossible : vérifiez la connexion.';
}

function CategorySelect({
  id,
  categories,
  value,
  onChange,
  label,
}: {
  id?: string;
  categories: CategoryDto[];
  value: number;
  onChange: (id: number) => void;
  label: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-label">{label}</span>
      <select
        id={id}
        className={field}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function MappingRow({
  mapping,
  categories,
  api,
  onChanged,
  notify,
}: {
  mapping: OffCategoryMapDto;
  categories: CategoryDto[];
  api: Api;
  onChanged: () => void;
  notify: Notify;
}) {
  const [editing, setEditing] = useState(false);
  const [tag, setTag] = useState(mapping.offTag);
  const [categoryId, setCategoryId] = useState(mapping.categoryId);
  const [busy, setBusy] = useState(false);
  const categoryName = categories.find((c) => c.id === mapping.categoryId)?.name ?? 'Inconnue';

  async function run(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      notify({ kind: 'ok', text: success });
      setEditing(false);
      onChanged();
    } catch (caught) {
      notify({ kind: 'error', text: messageOf(caught) });
    }
    setBusy(false);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const trimmed = tag.trim();
    if (!OFF_TAG_PATTERN.test(trimmed)) {
      notify({ kind: 'error', text: TAG_HELP });
      return;
    }
    void run(
      () => api.updateMapping(mapping.id, { offTag: trimmed, categoryId }),
      'Correspondance enregistrée.',
    );
  }

  return (
    <li
      aria-label={mapping.offTag}
      className="border-line flex flex-col gap-2 rounded-xl border bg-white p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink font-semibold break-all">{mapping.offTag}</span>
        <span className="text-small">{categoryName}</span>
      </div>
      {editing ? (
        <form onSubmit={save} noValidate className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-label">Tag Open Food Facts</span>
            <input
              className={field}
              autoCapitalize="none"
              autoCorrect="off"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            />
          </label>
          <CategorySelect
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            label="Catégorie de la correspondance"
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              Enregistrer la correspondance
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setTag(mapping.offTag);
                setCategoryId(mapping.categoryId);
                setEditing(false);
              }}
            >
              Annuler
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex gap-6">
          <Button variant="secondary" className="px-0!" onClick={() => setEditing(true)}>
            Modifier
          </Button>
          <Button
            variant="secondary"
            className="px-0!"
            disabled={busy}
            onClick={() =>
              void run(() => api.deleteMapping(mapping.id), 'Correspondance supprimée.')
            }
          >
            Supprimer
          </Button>
        </div>
      )}
    </li>
  );
}

function AddMappingForm({
  categories,
  api,
  onChanged,
  notify,
}: {
  categories: CategoryDto[];
  api: Api;
  onChanged: () => void;
  notify: Notify;
}) {
  const [tag, setTag] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? 0);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const trimmed = tag.trim();
    if (!OFF_TAG_PATTERN.test(trimmed)) {
      notify({ kind: 'error', text: TAG_HELP });
      return;
    }
    setBusy(true);
    try {
      await api.createMapping({ offTag: trimmed, categoryId });
      setTag('');
      notify({ kind: 'ok', text: 'Correspondance ajoutée.' });
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
      aria-label="Ajouter une correspondance"
      className="flex flex-col gap-2"
    >
      <label className="flex flex-col gap-1">
        <span className="text-label">Nouveau tag Open Food Facts</span>
        <input
          className={field}
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="en:cheeses"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
      </label>
      <CategorySelect
        categories={categories}
        value={categoryId}
        onChange={setCategoryId}
        label="Catégorie du nouveau tag"
      />
      <Button type="submit" variant="primary" disabled={busy || categories.length === 0}>
        Ajouter la correspondance
      </Button>
    </form>
  );
}

/** The Open Food Facts tag table: filter, add, edit, delete; a duplicate tag is reported. */
export function MappingsAdmin({ api }: { api: Api }) {
  const [mappings, setMappings] = useState<OffCategoryMapDto[] | null>(null);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(() => {
    Promise.all([api.fetchMappings(), api.fetchCategories()])
      .then(([list, cats]) => {
        setMappings(list);
        setCategories(cats);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, [api]);
  useEffect(load, [load]);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return (mappings ?? [])
      .filter((m) => needle === '' || m.offTag.toLowerCase().includes(needle))
      .sort((a, b) => a.offTag.localeCompare(b.offTag));
  }, [mappings, filter]);

  return (
    <div className="flex flex-col gap-6">
      {notice ? (
        <Callout role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</Callout>
      ) : null}
      {loadError ? (
        <Callout role="alert">
          Impossible de charger les correspondances : vérifiez la connexion.
        </Callout>
      ) : null}
      {mappings === null && !loadError ? (
        <p role="status" className="text-small">
          Chargement…
        </p>
      ) : null}
      <section aria-labelledby="ajout" className="flex flex-col gap-2">
        <h2 id="ajout" className="text-card-title">
          Ajouter une correspondance
        </h2>
        {categories.length > 0 ? (
          <AddMappingForm categories={categories} api={api} onChanged={load} notify={setNotice} />
        ) : null}
      </section>
      <section aria-labelledby="liste" className="flex flex-col gap-2">
        <h2 id="liste" className="text-card-title">
          Correspondances ({visible.length})
        </h2>
        <label className="flex flex-col gap-1">
          <span className="text-label">Filtrer les tags</span>
          <input
            className={field}
            type="search"
            autoCapitalize="none"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        <ul className="flex flex-col gap-2">
          {visible.map((mapping) => (
            <MappingRow
              key={mapping.id}
              mapping={mapping}
              categories={categories}
              api={api}
              onChanged={load}
              notify={setNotice}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
