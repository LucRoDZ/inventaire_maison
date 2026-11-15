import type { ProductDto, ScanResponse, ScanUnknownReason, ScanHints } from '@inventaire/shared';
import { ApiError, apiFetch } from './api';
import { BARCODE_ERROR_MESSAGES, parseCode } from './scanner/normalize-scan';
import type { ScanFormat } from './scanner/types';

export type ScanOutcome =
  /** The code is not a barcode: show the message, the scan resumes. */
  | { kind: 'invalid'; message: string }
  | { kind: 'offline' }
  | { kind: 'error'; message: string }
  /** `known` (already in the catalog) or `suggested` (just created from Open Food Facts). */
  | { kind: 'product'; product: ProductDto; suggested: boolean }
  | { kind: 'unknown'; barcode: string; reason: ScanUnknownReason; hints: ScanHints | null };

export const OFFLINE_MESSAGE = 'Pas de connexion';

/** `catalogOnly` (removal mode): the server neither asks Open Food Facts nor creates anything. */
export const fetchScan = (
  code: string,
  options: { catalogOnly?: boolean } = {},
): Promise<ScanResponse> =>
  apiFetch<ScanResponse>(
    `/scan/${encodeURIComponent(code)}${options.catalogOnly ? '?catalogOnly=true' : ''}`,
  );

export interface ResolveDeps {
  online: boolean;
  fetchScan?: (code: string, options?: { catalogOnly?: boolean }) => Promise<ScanResponse>;
  catalogOnly?: boolean;
}

/** Turns a detected or typed code into what the screen must do next. Never throws. */
export async function resolveScan(
  rawCode: string,
  format: ScanFormat | undefined,
  { online, fetchScan: fetcher = fetchScan, catalogOnly = false }: ResolveDeps,
): Promise<ScanOutcome> {
  const parsed = parseCode(rawCode, format);
  if (!parsed.ok) return { kind: 'invalid', message: BARCODE_ERROR_MESSAGES[parsed.reason] };
  if (!online) return { kind: 'offline' };

  try {
    const response = catalogOnly
      ? await fetcher(parsed.result.code, { catalogOnly: true })
      : await fetcher(parsed.result.code);
    if (response.status === 'unknown') {
      return {
        kind: 'unknown',
        barcode: parsed.result.code,
        reason: response.reason,
        hints: response.hints ?? null,
      };
    }
    // The detail of a known product carries its stock; the sheet only needs the product part.
    return {
      kind: 'product',
      product: response.product,
      suggested: response.status === 'suggested',
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 0) return { kind: 'offline' };
    return {
      kind: 'error',
      message: error instanceof ApiError ? error.message : 'Erreur inattendue, réessayez.',
    };
  }
}
