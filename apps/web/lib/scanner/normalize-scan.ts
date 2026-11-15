import { InvalidBarcodeError, normalizeBarcode, type BarcodeErrorReason } from '@inventaire/shared';
import type { ScanFormat, ScanResult } from './types';

/** Message shown for a typed code that is not a barcode. */
export const BARCODE_ERROR_MESSAGES: Record<BarcodeErrorReason, string> = {
  empty: 'Saisissez un code-barres.',
  not_digits: 'Un code-barres ne contient que des chiffres.',
  bad_length: 'Un code-barres a 8, 12 ou 13 chiffres.',
  bad_check_digit: 'Ce code est incorrect : vérifiez les chiffres.',
};

export type ParsedCode =
  { ok: true; result: ScanResult } | { ok: false; reason: BarcodeErrorReason };

/** Canonical code (EAN-13 or EAN-8) for what was typed or read, with its canonical format. */
export function parseCode(input: string, format?: ScanFormat): ParsedCode {
  try {
    const code = normalizeBarcode(input, format);
    return { ok: true, result: { code, format: code.length === 8 ? 'ean_8' : 'ean_13' } };
  } catch (error) {
    if (error instanceof InvalidBarcodeError) return { ok: false, reason: error.reason };
    throw error;
  }
}
