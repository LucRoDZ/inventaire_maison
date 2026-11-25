'use client';

import {
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_TEXT_MAX_LENGTH,
  type CategoryDto,
  type LocationDto,
  type ProductDto,
  type ScanHints,
  type ScanUnknownReason,
} from '@inventaire/shared';
import { useId, useState, type FormEvent } from 'react';
import { ApiError } from '../../lib/api';
import { useOnline } from '../../lib/online';
import { createProduct, uploadProductImage, type NewProductInput } from '../../lib/products-api';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';
import { PhotoField } from './PhotoField';
import { LocationOptions } from '../ui/LocationOptions';

export const PHOTO_FAILED_NOTICE =
  'Produit enregistré, mais la photo n’a pas pu être envoyée. Vous pourrez la remettre depuis la fiche produit.';

const REASON_MESSAGES: Record<ScanUnknownReason | 'manual', string> = {
  not_found:
    'Ce code n’est pas dans Open Food Facts. Décrivez le produit une seule fois : il sera reconnu ensuite.',
  off_unavailable:
    'Open Food Facts est injoignable pour le moment. Décrivez le produit : il sera reconnu au prochain scan.',
  poor_data: 'La fiche Open Food Facts est incomplète. Complétez le produit une seule fois.',
  manual: 'Ce produit n’existe pas encore. Décrivez-le pour l’ajouter.',
};

interface ProductFormProps {
  /** Canonical code of the scan; null for a product without barcode. */
  barcode: string | null;
  reason: ScanUnknownReason | 'manual';
  hints?: ScanHints | null;
  initialName?: string;
  categories: CategoryDto[];
  locations: LocationDto[];
  /** `notice` is set when the product was kept but its photo could not be sent. */
  onCreated: (product: ProductDto, notice?: string) => void;
  onCancel: () => void;
  /** Test seams. */
  api?: {
    createProduct?: (input: NewProductInput) => Promise<ProductDto>;
    uploadImage?: (productId: number, photo: File) => Promise<unknown>;
  };
}

const field = 'tap-target border-line text-ink w-full rounded-xl border bg-white px-3';

export function ProductForm({
  barcode,
  reason,
  hints,
  initialName = '',
  categories,
  locations,
  onCreated,
  onCancel,
  api = {},
}: ProductFormProps) {
  const titleId = useId();
  const online = useOnline();
  const [name, setName] = useState(initialName);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [brand, setBrand] = useState(hints?.brand ?? '');
  const [sizeLabel] = useState(hints?.sizeLabel ?? '');
  const [locationId, setLocationId] = useState<number | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [errors, setErrors] = useState<{ name?: string; category?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    const next: typeof errors = {};
    if (trimmed === '') next.name = 'Le nom est obligatoire.';
    if (categoryId === null) next.category = 'Choisissez une catégorie.';
    setErrors(next);
    if (next.name || next.category || categoryId === null) return;

    setBusy(true);
    setFailure(null);
    let product: ProductDto;
    try {
      product = await (api.createProduct ?? createProduct)({
        name: trimmed,
        categoryId,
        brand: brand.trim() || null,
        sizeLabel: sizeLabel.trim() || null,
        defaultLocationId: locationId,
        ...(barcode ? { barcode } : {}),
      });
    } catch (error) {
      setBusy(false);
      setFailure(
        error instanceof ApiError && error.status !== 0
          ? error.message
          : 'Impossible d’enregistrer le produit : vérifiez la connexion et réessayez.',
      );
      return;
    }

    let notice: string | undefined;
    if (photo) {
      try {
        await (api.uploadImage ?? uploadProductImage)(product.id, photo);
      } catch {
        // The product exists: it is kept, only the photo is lost.
        notice = PHOTO_FAILED_NOTICE;
      }
    }
    onCreated(product, notice);
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-indigo/40">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={(event) => void submit(event)}
        noValidate
        className="rounded-card mx-auto flex max-h-[92dvh] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-b-none bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <h2 id={titleId} className="text-title">
          Nouveau produit
        </h2>
        <Callout role="note">{REASON_MESSAGES[reason]}</Callout>
        {barcode ? <p className="text-small">Code-barres : {barcode}</p> : null}

        <label className="text-label flex flex-col gap-1">
          Nom
          <input
            className={field}
            value={name}
            maxLength={PRODUCT_NAME_MAX_LENGTH}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={errors.name !== undefined}
            autoComplete="off"
          />
          {errors.name ? (
            <span role="alert" className="text-small text-alert normal-case tracking-normal">
              {errors.name}
            </span>
          ) : null}
        </label>

        <label className="text-label flex flex-col gap-1">
          Catégorie
          <select
            className={field}
            value={categoryId ?? ''}
            onChange={(event) =>
              setCategoryId(event.target.value === '' ? null : Number(event.target.value))
            }
            aria-invalid={errors.category !== undefined}
          >
            <option value="">Choisir une catégorie</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {errors.category ? (
            <span role="alert" className="text-small text-alert normal-case tracking-normal">
              {errors.category}
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

        {!online ? (
          <Callout role="alert" title="Pas de connexion">
            L’enregistrement est indisponible tant que la connexion n’est pas revenue.
          </Callout>
        ) : null}
        {failure ? (
          <Callout role="alert" title="Enregistrement impossible">
            {failure}
          </Callout>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button type="submit" variant="add" disabled={busy || !online}>
            {busy ? 'Enregistrement…' : 'Enregistrer et ajouter'}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Annuler
          </Button>
        </div>
      </form>
    </div>
  );
}
