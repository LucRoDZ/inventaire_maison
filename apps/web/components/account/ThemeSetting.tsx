'use client';

import { useEffect, useId, useState } from 'react';
import { readTheme, saveTheme, type ThemeChoice } from '../../lib/theme';

const CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'auto', label: 'Automatique' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
];

/** « Apparence »: Automatique (follows the phone), Clair or Sombre, on this device only. */
export function ThemeSetting() {
  const helpId = useId();
  const [choice, setChoice] = useState<ThemeChoice>('auto');

  useEffect(() => {
    setChoice(readTheme());
  }, []);

  return (
    <fieldset aria-describedby={helpId} className="flex flex-col gap-1">
      <legend className="text-card-title mb-1">Apparence</legend>
      {CHOICES.map(({ value, label }) => (
        <label
          key={value}
          className="tap-target text-ink flex cursor-pointer items-center gap-3 font-semibold"
        >
          <input
            type="radio"
            name="theme"
            value={value}
            checked={choice === value}
            onChange={() => {
              setChoice(value);
              saveTheme(value);
            }}
            className="accent-indigo h-5 w-5"
          />
          {label}
        </label>
      ))}
      <p id={helpId} className="text-help">
        Automatique suit le réglage du téléphone. Ce choix ne concerne que cet appareil.
      </p>
    </fieldset>
  );
}
