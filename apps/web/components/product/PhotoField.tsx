'use client';

import { Camera } from 'lucide-react';
import { useEffect, useId, useState, type ChangeEvent } from 'react';

export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface PhotoFieldProps {
  file: File | null;
  onChange: (file: File | null) => void;
}

/** Optional product photo: camera app on a phone, file picker elsewhere. */
export function PhotoField({ file, onChange }: PhotoFieldProps) {
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    event.target.value = '';
    if (!picked) return;
    if (!TYPES.includes(picked.type)) {
      setError('Choisissez une photo JPEG, PNG ou WebP.');
      return;
    }
    if (picked.size > PHOTO_MAX_BYTES) {
      setError('Photo trop lourde (8 Mo au maximum).');
      return;
    }
    setError(null);
    onChange(picked);
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-label">Photo (facultative)</span>
      <div className="flex items-center gap-3">
        {preview ? (
          <img
            src={preview}
            alt="Aperçu de la photo"
            className="h-16 w-16 rounded-xl object-cover"
          />
        ) : null}
        <label
          htmlFor={inputId}
          className="tap-target text-indigo-mid inline-flex cursor-pointer items-center gap-2 font-bold"
        >
          <Camera size={18} aria-hidden="true" />
          {file ? 'Changer la photo' : 'Ajouter une photo'}
        </label>
        {file ? (
          <button
            type="button"
            className="tap-target text-indigo-mid font-bold"
            onClick={() => onChange(null)}
          >
            Retirer la photo
          </button>
        ) : null}
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="sr-only"
          onChange={pick}
        />
      </div>
      {error ? (
        <p role="alert" className="text-small text-alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
