/** Units of a net content or of a shopping line. `unit` = pieces. */
export const QUANTITY_UNITS = ['g', 'kg', 'ml', 'cl', 'l', 'unit'] as const;
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];
export const QUANTITY_UNIT_LABELS: Readonly<Record<QuantityUnit, string>> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  cl: 'cl',
  l: 'l',
  unit: 'unité',
};

// ---------- Settings (per household) ----------

export const EXPIRY_ALERT_DAYS_MIN = 0;
export const EXPIRY_ALERT_DAYS_MAX = 30;

/** `GET /settings` (household of the session), `GET|PATCH /admin/households/:id/settings`. */
export interface SettingsDto {
  expiryAlertDays: number;
}
export type SettingsPatchInput = Partial<SettingsDto>;

// ---------- Shopping list ----------

export const SHOPPING_ORIGINS = ['manual', 'auto'] as const;
export type ShoppingOrigin = (typeof SHOPPING_ORIGINS)[number];
export const SHOPPING_LABEL_MAX_LENGTH = 120;
export const SHOPPING_QUANTITY_MAX = 999;

export interface ShoppingItemDto {
  id: number;
  /** Null for a free line. */
  product: {
    id: number;
    name: string;
    imageUrl: string | null;
    /** Null: storing the line opens the product form. */
    defaultLocationId: number | null;
  } | null;
  /** The free text, or null for a catalogue product. */
  label: string | null;
  quantity: number;
  amount: number | null;
  unit: QuantityUnit | null;
  checked: boolean;
  origin: ShoppingOrigin;
  createdAt: string;
}

/** `GET /shopping`: unchecked first (oldest first), then checked. */
export interface ShoppingListResponse {
  items: ShoppingItemDto[];
}

/** `POST /shopping`: `productId` or `label`. Adding an open product again adds to its quantity. */
export interface ShoppingItemCreateInput {
  productId?: number | null;
  label?: string | null;
  quantity?: number;
  amount?: number | null;
  unit?: QuantityUnit | null;
}

/** `PATCH /shopping/:id`. */
export interface ShoppingItemPatchInput {
  checked?: boolean;
  quantity?: number;
}

/** `POST /shopping/clear-checked`. */
export interface ShoppingClearResponse {
  removed: number;
}

/**
 * `POST /shopping/store-checked`: every checked line of a known product with a usual location is
 * added to the stock (+quantity, reason `scan_add`) and removed from the list; the others are left
 * for the product form.
 */
export interface ShoppingStoreResponse {
  stored: {
    shoppingItemId: number;
    productId: number;
    productName: string;
    quantity: number;
    locationId: number;
    /** To undo within 5 s: `POST /stock/adjust` with the opposite delta, reason `correction`. */
    stockItemId: number;
  }[];
  /** Checked lines that need the product form (free line or no usual location). */
  needsForm: ShoppingItemDto[];
}

/** `GET /shopping/recent`: products consumed in the last 30 days, most frequent first, 12 at most. */
export interface RecentProductDto {
  productId: number;
  name: string;
  imageUrl: string | null;
  /** Number of `consumed` movements in the period. */
  count: number;
}
export const RECENT_PRODUCTS_DAYS = 30;
export const RECENT_PRODUCTS_MAX = 12;

// ---------- Statistics ----------

export const STATS_DAYS = 30;

/** `GET /stats`: the last `STATS_DAYS` days of the household. */
export interface StatsDto {
  days: number;
  /** Units removed with reason `consumed` / `wasted`. */
  consumed: number;
  wasted: number;
  /** wasted / (consumed + wasted), between 0 and 1; null when both are 0. */
  wasteRate: number | null;
  /** The 5 most wasted products (units), most first. */
  topWasted: { productId: number; name: string; units: number }[];
}

// ---------- Web Push ----------

/** `GET /push/public-key`: null when the server has no VAPID keys (the option is then hidden). */
export interface PushPublicKeyDto {
  publicKey: string | null;
}

/** `POST /push/subscriptions` (the shape of `PushSubscription.toJSON()`), `DELETE` with `endpoint`. */
export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Payload of the daily summary, read by the service worker. */
export interface PushSummaryPayload {
  title: string;
  body: string;
  /** `urgent`: something expires today or has expired; `planned`: only "soon". */
  tone: 'urgent' | 'planned';
  /** Opened on click: the list view filtered on the expiry. */
  url: string;
}

/** Local hour (Europe/Paris) of the daily summary. */
export const PUSH_SUMMARY_HOUR = 8;
export const PUSH_SUMMARY_TIME_ZONE = 'Europe/Paris';
