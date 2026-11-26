'use client';

import { useEffect, useId, useState } from 'react';
import { readHaptics, saveHaptics } from '../../lib/haptics';

/** « Retour tactile »: a short vibration when the scanner reads a code (this device only). */
export function HapticsSetting() {
  const helpId = useId();
  const [on, setOn] = useState(true);

  useEffect(() => {
    setOn(readHaptics());
  }, []);

  return (
    <section aria-labelledby={`${helpId}-title`} className="flex flex-col gap-1">
      <h2 id={`${helpId}-title`} className="text-card-title">
        Scanner
      </h2>
      <label className="tap-target text-ink flex cursor-pointer items-center gap-3 font-semibold">
        <input
          type="checkbox"
          checked={on}
          aria-describedby={helpId}
          onChange={(event) => {
            setOn(event.target.checked);
            saveHaptics(event.target.checked);
          }}
          className="accent-indigo h-5 w-5"
        />
        Retour tactile
      </label>
      <p id={helpId} className="text-help">
        Une courte vibration quand un code est lu, si l’appareil le permet.
      </p>
    </section>
  );
}
