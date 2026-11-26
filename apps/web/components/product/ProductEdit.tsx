'use client';

import {
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_TEXT_MAX_LENGTH,
  type CategoryDto,
  type LocationDto,
  type ProductDto,
} from '@inventaire/shared';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../../lib/api';
import { updateProduct, uploadProductImage, type ProductPatch } from '../../lib/products-api';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';
import { PhotoField } from './PhotoField';
import { LocationOptions } from '../ui/LocationOptions';

interface ProductEditProps {
  product: ProductDto;
  categories: CategoryDto[];
  locations: LocationDto[];
  onSaved: (product: ProductDto) => void;
  /** Test seams. */
  api?: {
    update?: (id: number, patch: ProductPatch) => Promise<ProductDto>;
    upload?: (id: number, photo: File) => Promise<ProductDto>;
  };
}

const field = 'tap-target border-line text-ink w-full rounded-xl border bg-white px-3';

/** Name, brand, category, usual location and photo of a product. */
export function ProductEdit({
  product,
  categories,
  locations,
  onSaved,
  api = {},
}: ProductEditProps) {
  const [name, setName] = useState(product.name);
  const [brand, setBrand] = useState(product.brand ?? '');
  const [categoryId, setCategoryId] = useState(product.categoryId);
  const [locationId, setLocationId] = useState<number | null>(product.defaultLocationId);
  const [photo, setPhoto] = useState<File | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (trimmed === '') {
      setNameError('Le nom est obligatoire.');
      return;
    }
    setNameError(null);
    setBusy(true);
    setMessage(null);
    let saved: ProductDto;
    try {
      // The category is always sent: saving the form confirms it.
      saved = await (api.update ?? updateProduct)(product.id, {
        name: trimmed,
        brand: brand.trim() || null,
        categoryId,
        defaultLocationId: locationId,
      });
    } catch (error) {
      setBusy(false);
      setMessage({
        kind: 'error',
        text:
          error instanceof ApiError && error.status !== 0
            ? error.message
            : 'Enregistrement impossible : vérifiez la connexion.',
      });
      return;
    }
    if (photo) {
      try {
        saved = await (api.upload ?? uploadProductImage)(product.id, photo);
        setPhoto(null);
      } catch {
        setBusy(false);
        onSaved(saved);
        setMessage({
          kind: 'error',
          text: 'Produit enregistré, mais la photo n’a pas pu être envoyée.',
        });
        return;
      }
    }
    setBusy(false);
    onSaved(saved);
    setMessage({ kind: 'ok', text: 'Produit enregistré.' });
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      <label className="text-label flex flex-col gap-1">
        Nom
        <input
          className={field}
          value={name}
          maxLength={PRODUCT_NAME_MAX_LENGTH}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={nameError !== null}
          autoComplete="off"
        />
        {nameError ? (
          <span role="alert" className="text-small text-alert tracking-normal normal-case">
            {nameError}
          </span>
        ) : null}
      </label>
      <label className="text-label flex flex-col gap-1">
        Marque (facultative)
        <input
          className={field}
          value={brand}
          maxLength={PRODUCT_TEXT_MAX_LENGTH}
          onChange={(event) => setBrand(event.target.value)}
          autoComplete="off"
        />
      </label>
      <label className="text-label flex flex-col gap-1">
        Catégorie
        <select
          className={field}
          value={categoryId}
          onChange={(event) => setCategoryId(Number(event.target.value))}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-label flex flex-col gap-1">
        Lieu habituel (facultatif)
        <select
          className={field}
          value={locationId ?? ''}
          onChange={(event) =>
            setLocationId(event.target.value === '' ? null : Number(event.target.value))
          }
        >
          <option value="">Aucun</option>
          <LocationOptions locations={locations} />
        </select>
      </label>
      <PhotoField file={photo} onChange={setPhoto} />
      {message ? (
        <Callout
          role={message.kind === 'error' ? 'alert' : 'status'}
          title={message.kind === 'error' ? 'Un instant' : 'C’est fait'}
        >
          {message.text}
        </Callout>
      ) : null}
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </form>
  );
}
