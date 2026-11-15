'use client';

import { Camera } from 'lucide-react';
import { useId, useState, type ChangeEvent } from 'react';
import { decodePhoto } from '../../lib/scanner/decode-photo';
import { parseCode } from '../../lib/scanner/normalize-scan';
import type { ScanResult } from '../../lib/scanner/types';

interface PhotoCodeButtonProps {
  onCode: (result: ScanResult) => void;
  /** Test seam. */
  decode?: (blob: Blob) => Promise<ScanResult | null>;
}

export const UNREADABLE_MESSAGE = 'Code illisible, réessayez';

/** Opens the camera app (`capture`) and reads the code from the photo it returns. */
export function PhotoCodeButton({ onCode, decode = decodePhoto }: PhotoCodeButtonProps) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = ''; // the same photo can be chosen again
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const read = await decode(file);
      const parsed = read ? parseCode(read.code, read.format) : null;
      if (parsed?.ok) onCode(parsed.result);
      else setError(UNREADABLE_MESSAGE);
    } catch {
      setError(UNREADABLE_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={inputId}
        className="tap-target text-indigo-mid inline-flex cursor-pointer items-center gap-2 font-bold"
      >
        <Camera size={18} aria-hidden="true" />
        {busy ? 'Lecture en cours…' : 'Prendre une photo du code'}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={busy}
        onChange={(event) => void onChange(event)}
      />
      {error ? (
        <p role="alert" className="text-small text-alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
