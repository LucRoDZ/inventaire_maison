import type { ExpiryStatus } from './stock';
import type { LocationKind, ShelfKind } from './locations';

/** One stock line drawn as a thumbnail on a shelf or in the tray. */
export interface HomeTileDto {
  stockItemId: number;
  productId: number;
  name: string;
  brand: string | null;
  /** Null: the category icon is drawn instead. */
  imageUrl: string | null;
  category: { id: number; name: string; icon: string };
  quantity: number;
  expiryDate: string | null;
  expiry: ExpiryStatus | null;
}

export interface HomeShelfDto {
  id: number;
  name: string;
  kind: ShelfKind;
  tiles: HomeTileDto[];
}

export interface HomeLocationDto {
  id: number;
  name: string;
  kind: LocationKind;
  icon: string;
  counts: {
    /** Distinct products in stock. */
    products: number;
    units: number;
    /** Lines expired or expiring within `EXPIRY_SOON_DAYS` days. */
    expiringSoon: number;
  };
  shelves: HomeShelfDto[];
  /** The "Non rangé" tray. */
  unshelved: HomeTileDto[];
}

export interface HomeResponse {
  locations: HomeLocationDto[];
}
