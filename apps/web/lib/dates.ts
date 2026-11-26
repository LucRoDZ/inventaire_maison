const pad = (n: number) => String(n).padStart(2, '0');

/** Today in the device's calendar, `YYYY-MM-DD`. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** `YYYY-MM-DD` plus a number of days (calendar days, no time zone drift). Empty for a bad date. */
export function addDaysIso(iso: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** `YYYY-MM-DD` plus calendar months, the day capped to the end of a shorter month. */
export function addMonthsIso(iso: string, months: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]) - 1 + months;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const date = new Date(Date.UTC(year, month, Math.min(Number(match[3]), last)));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

const dayNumber = (iso: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match
    ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000
    : null;
};

/** « dans 3 jours », « demain », « aujourd’hui », « il y a 2 jours »; empty for a bad date. */
export function relativeDays(iso: string, today: string = todayIso()): string {
  const a = dayNumber(iso);
  const b = dayNumber(today);
  if (a === null || b === null) return '';
  const days = Math.round(a - b);
  if (days === 0) return 'aujourd’hui';
  if (days === 1) return 'demain';
  if (days === -1) return 'hier';
  return days > 0 ? `dans ${days} jours` : `il y a ${-days} jours`;
}

/** « 29 novembre 2026 »: the exact date, for screen readers. */
export function longDate(iso: string): string {
  const time = dayNumber(iso);
  if (time === null) return '';
  return new Date(time * 86_400_000).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
