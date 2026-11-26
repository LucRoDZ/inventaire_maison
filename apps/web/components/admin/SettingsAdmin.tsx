'use client';

import { EXPIRY_ALERT_DAYS_MAX, EXPIRY_ALERT_DAYS_MIN } from '@inventaire/shared';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { ApiError } from '../../lib/api';
import type { SettingsApi } from '../../lib/settings-api';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';

const field = 'tap-target border-line rounded-xl border bg-white px-3 text-base text-ink w-full';

/** The expiry alert threshold of a household: « soon » means this many days before the date. */
export function SettingsAdmin({ api }: { api: SettingsApi }) {
  const inputId = useId();
  const helpId = useId();
  const errorId = useId();
  const [days, setDays] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .fetchSettings()
      .then((settings) => setDays(String(settings.expiryAlertDays)))
      .catch(() =>
        setNotice({
          kind: 'error',
          text: 'Impossible de charger le réglage : vérifiez la connexion.',
        }),
      );
  }, [api]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || days === null) return;
    const value = Number(days);
    if (
      days.trim() === '' ||
      !Number.isInteger(value) ||
      value < EXPIRY_ALERT_DAYS_MIN ||
      value > EXPIRY_ALERT_DAYS_MAX
    ) {
      setError(
        `Entrez un nombre entier de jours entre ${EXPIRY_ALERT_DAYS_MIN} et ${EXPIRY_ALERT_DAYS_MAX}.`,
      );
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const saved = await api.updateSettings({ expiryAlertDays: value });
      setDays(String(saved.expiryAlertDays));
      setNotice({ kind: 'ok', text: 'Réglage enregistré.' });
    } catch (caught) {
      setNotice({
        kind: 'error',
        text:
          caught instanceof ApiError && caught.status !== 0
            ? caught.message
            : 'Enregistrement impossible : vérifiez la connexion.',
      });
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      {notice ? (
        <Callout role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</Callout>
      ) : null}
      {days === null && notice === null ? (
        <p role="status" className="text-small">
          Chargement…
        </p>
      ) : null}
      {days !== null ? (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor={inputId} className="text-label">
              Alerte « bientôt » (jours avant la date limite)
            </label>
            <input
              id={inputId}
              className={field}
              inputMode="numeric"
              value={days}
              aria-invalid={error !== null}
              aria-describedby={error ? `${helpId} ${errorId}` : helpId}
              onChange={(event) => setDays(event.target.value)}
            />
            <p id={helpId} className="text-help">
              Un produit est « bientôt » périmé à partir de ce nombre de jours avant sa date limite.
              Il sert aux compteurs, aux pastilles et au résumé du matin.
            </p>
            {error ? (
              <p id={errorId} role="alert" className="text-small text-alert">
                {error}
              </p>
            ) : null}
          </div>
          <Button type="submit" disabled={busy}>
            Enregistrer le réglage
          </Button>
        </>
      ) : null}
    </form>
  );
}
