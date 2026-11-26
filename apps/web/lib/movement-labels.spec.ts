import type { MovementHistoryItemDto, MovementReason } from '@inventaire/shared';
import { describe, expect, it } from 'vitest';
import { describeMovement, REASON_LABELS } from './movement-labels';

const item = (over: Partial<MovementHistoryItemDto> = {}): MovementHistoryItemDto => ({
  id: 1,
  delta: 2,
  reason: 'scan_add',
  expiryDate: null,
  createdAt: '2026-06-01T10:02:00.000Z',
  user: { id: 1, username: 'lucas' },
  location: { id: 2, name: 'Frigo' },
  shelf: { id: 21, name: 'Étagère 2' },
  ...over,
});

describe('describeMovement', () => {
  it('says who, how many, where, why and when', () => {
    const { headline, detail } = describeMovement(item());
    expect(headline).toBe('lucas a ajouté 2 unités dans Frigo, étagère 2');
    expect(detail).toBe('Ajout par scan · 1 juin 2026, 12:02');
  });

  it('writes a removal with the singular and the tray', () => {
    expect(describeMovement(item({ delta: -1, reason: 'scan_remove', shelf: null })).headline).toBe(
      'lucas a retiré 1 unité de Frigo, non rangé',
    );
  });

  it('names a shelf deleted before its name was kept, and a place without a name', () => {
    expect(describeMovement(item({ shelf: { id: 999, name: '' } })).headline).toBe(
      'lucas a ajouté 2 unités dans Frigo, étagère supprimée',
    );
    expect(describeMovement(item({ location: { id: 7, name: '' }, shelf: null })).headline).toBe(
      'lucas a ajouté 2 unités dans Meuble supprimé, non rangé',
    );
  });

  it('writes a move in both directions', () => {
    expect(describeMovement(item({ delta: -3, reason: 'move' })).headline).toBe(
      'lucas a déplacé 3 unités depuis Frigo, étagère 2',
    );
    expect(
      describeMovement(
        item({ delta: 3, reason: 'move', location: { id: 1, name: 'Cave' }, shelf: null }),
      ).headline,
    ).toBe('lucas a déplacé 3 unités vers Cave, non rangé');
  });

  it('mentions the expiry date of the line', () => {
    expect(describeMovement(item({ expiryDate: '2026-12-01' })).detail).toContain(
      'limite le 01/12/2026',
    );
  });

  it('has a French label for every reason', () => {
    const reasons: MovementReason[] = ['scan_add', 'scan_remove', 'manual', 'move', 'correction'];
    expect(reasons.map((reason) => REASON_LABELS[reason])).toEqual([
      'Ajout par scan',
      'Retrait par scan',
      'Modification manuelle',
      'Déplacement',
      'Correction',
    ]);
  });

  it('names a disabled account like any other', () => {
    expect(
      describeMovement(item({ user: { id: 9, username: 'ancien' } })).headline.startsWith(
        'ancien a ',
      ),
    ).toBe(true);
  });
});

describe('undo of a removal', () => {
  it('says it is the undo of the consumed removal', () => {
    const sentence = describeMovement({
      id: 9,
      delta: 1,
      reason: 'consumed',
      expiryDate: null,
      createdAt: '2026-11-15T09:02:00Z',
      user: { id: 1, username: 'admin' },
      location: { id: 1, name: 'Frigo' },
      shelf: null,
    });
    expect(sentence.detail).toMatch(/^Annulation : consommé · /);
  });
});
