import type { PushSummaryPayload } from '@inventaire/shared';

/** What the service worker shows for a daily summary. */
export interface SummaryNotification {
  title: string;
  options: { body: string; tag: string; data: { url: string } };
}

/** The page opened when the payload gives none (or an address that is not one of ours). */
export const DEFAULT_PUSH_URL = '/inventaire?vue=liste';

/** Only a path of this application is opened from a notification, never another site. */
export function safePushUrl(url: unknown): string {
  return typeof url === 'string' && /^\/(?!\/)/.test(url) ? url : DEFAULT_PUSH_URL;
}

/** Reads the payload of a push message; null when it is not a summary (nothing is shown). */
export function parsePushPayload(raw: unknown): PushSummaryPayload | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { title, body, tone, url } = raw as Record<string, unknown>;
  if (typeof title !== 'string' || title === '' || typeof body !== 'string') return null;
  return {
    title,
    body,
    tone: tone === 'urgent' ? 'urgent' : 'planned',
    url: safePushUrl(url),
  };
}

/** One notification per household and day: a new summary replaces the previous one (same tag). */
export function notificationFor(payload: PushSummaryPayload): SummaryNotification {
  return {
    title: payload.title,
    options: { body: payload.body, tag: 'daily-summary', data: { url: payload.url } },
  };
}
