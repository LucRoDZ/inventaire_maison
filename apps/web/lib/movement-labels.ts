import type { MovementHistoryItemDto, MovementReason } from '@inventaire/shared';

/** Why a movement happened, as the history says it. */
export const REASON_LABELS: Record<MovementReason, string> = {
  scan_add: 'Ajout par scan',
  scan_remove: 'Retrait par scan',
  manual: 'Modification manuelle',
  move: 'Déplacement',
  correction: 'Correction',
};

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

export const formatMovementDate = (iso: string): string =>
  new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(new Date(iso));

export interface MovementSentence {
  /** « admin a ajouté 2 unités dans Frigo, étagère 2 » */
  headline: string;
  /** « Ajout par scan · 15 nov. 2026, 10:02 » */
  detail: string;
}

/** The movement as a sentence: who, how many, where, why, when. */
export function describeMovement(item: MovementHistoryItemDto): MovementSentence {
  const count = Math.abs(item.delta);
  const units = `${count} ${count > 1 ? 'unités' : 'unité'}`;
  const place = `${item.location.name}${item.shelf ? `, ${lowerFirst(item.shelf.name)}` : ', non rangé'}`;
  const who = item.user.username;
  const incoming = item.delta > 0;
  const headline =
    item.reason === 'move'
      ? `${who} a déplacé ${units} ${incoming ? 'vers' : 'depuis'} ${place}`
      : `${who} a ${incoming ? 'ajouté' : 'retiré'} ${units} ${incoming ? 'dans' : 'de'} ${place}`;
  const expiry = item.expiryDate
    ? ` · limite le ${item.expiryDate.split('-').reverse().join('/')}`
    : '';
  return {
    headline,
    detail: `${REASON_LABELS[item.reason]} · ${formatMovementDate(item.createdAt)}${expiry}`,
  };
}
