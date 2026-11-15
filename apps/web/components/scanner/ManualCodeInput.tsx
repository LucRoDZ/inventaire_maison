'use client';

import { useId, useState, type FormEvent } from 'react';
import { BARCODE_ERROR_MESSAGES, parseCode } from '../../lib/scanner/normalize-scan';
import type { ScanResult } from '../../lib/scanner/types';
import { Button } from '../ui/Button';

interface ManualCodeInputProps {
  onCode: (result: ScanResult) => void;
}

/** Typed code; a USB or Bluetooth reader "types" the digits and presses Enter, which submits. */
export function ManualCodeInput({ onCode }: ManualCodeInputProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseCode(value);
    if (!parsed.ok) {
      setError(BARCODE_ERROR_MESSAGES[parsed.reason]);
      return;
    }
    setError(null);
    setValue('');
    onCode(parsed.result);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <label htmlFor={`${errorId}-input`} className="text-label">
        Code-barres
      </label>
      <div className="flex gap-2">
        <input
          id={`${errorId}-input`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="go"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          placeholder="Tapez ou scannez le code"
          className="tap-target border-line text-ink min-w-0 flex-1 rounded-xl border bg-white px-3"
        />
        <Button type="submit">Valider</Button>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-small text-alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
