import type { QueuedOp } from './types';

/** French explanation of why an operation was not applied, and what the user can do. */
export function conflictMessage(item: QueuedOp): string {
  const result = item.result;
  if (!result) return 'En attente de connexion.';
  if (result.status === 'rejected') {
    return 'Ce produit ou ce lieu n’existe plus dans votre foyer. Abandonnez cette opération.';
  }
  switch (result.conflict) {
    case 'merged':
      return 'Ce produit a été fusionné avec un autre. Réessayez pour l’appliquer au produit conservé.';
    case 'insufficient_stock':
      return 'Le stock est inférieur à la quantité retirée. Rien n’a été retiré.';
    case 'no_location':
      return 'Aucun lieu habituel pour ce produit. Abandonnez l’opération et rangez-le depuis la fiche.';
  }
}
