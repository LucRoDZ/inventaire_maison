/** Symbology reported by a scanner (names follow the `BarcodeDetector` API). */
export type BarcodeFormat = 'ean_13' | 'ean_8' | 'upc_a' | 'upc_e';

export type BarcodeErrorReason = 'empty' | 'not_digits' | 'bad_length' | 'bad_check_digit';

/** Thrown for any input that is not a valid EAN-13, EAN-8, UPC-A or UPC-E. */
export class InvalidBarcodeError extends Error {
  constructor(readonly reason: BarcodeErrorReason) {
    super(`Code-barres invalide (${reason})`);
    this.name = 'InvalidBarcodeError';
  }
}

/** True when the last digit of `digits` is the right GS1 check digit for the others. */
function hasValidCheckDigit(digits: string): boolean {
  let sum = 0;
  // Weights 3, 1, 3, 1... counted from the digit next to the check digit.
  for (let i = digits.length - 2, weight = 3; i >= 0; i--, weight = 4 - weight) {
    sum += Number(digits[i]) * weight;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/** Expands an 8-digit UPC-E (number system 0 or 1) to its 12-digit UPC-A. */
function expandUpcE(code: string): string {
  const system = code[0] as string;
  if (system !== '0' && system !== '1') throw new InvalidBarcodeError('bad_length');
  const [d1, d2, d3, d4, d5, d6] = code.slice(1, 7) as unknown as string[];
  const check = code[7] as string;
  let body: string;
  switch (d6) {
    case '0':
    case '1':
    case '2':
      body = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
      break;
    case '3':
      body = `${d1}${d2}${d3}00000${d4}${d5}`;
      break;
    case '4':
      body = `${d1}${d2}${d3}${d4}00000${d5}`;
      break;
    default:
      body = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  }
  return `${system}${body}${check}`;
}

/**
 * Returns the canonical barcode (EAN-13, or EAN-8) of what a scanner or a person typed.
 *
 * Spaces and dashes are removed. A 12-digit UPC-A gets a leading 0. An 8-digit code is an EAN-8,
 * unless `format` says `upc_e`, in which case it is expanded to UPC-A then EAN-13.
 * Throws `InvalidBarcodeError` for anything else, including a wrong check digit.
 */
export function normalizeBarcode(input: string, format?: BarcodeFormat): string {
  const code = input.replace(/[\s-]/g, '');
  if (code === '') throw new InvalidBarcodeError('empty');
  if (!/^\d+$/.test(code)) throw new InvalidBarcodeError('not_digits');

  let canonical: string;
  if (code.length === 8 && format === 'upc_e') {
    const upcA = expandUpcE(code);
    if (!hasValidCheckDigit(upcA)) throw new InvalidBarcodeError('bad_check_digit');
    return `0${upcA}`;
  } else if (code.length === 8 || code.length === 13) {
    canonical = code;
  } else if (code.length === 12) {
    canonical = `0${code}`;
  } else {
    throw new InvalidBarcodeError('bad_length');
  }
  if (!hasValidCheckDigit(canonical)) throw new InvalidBarcodeError('bad_check_digit');
  return canonical;
}

/** Same as `normalizeBarcode`, with `null` instead of an exception. */
export function tryNormalizeBarcode(input: string, format?: BarcodeFormat): string | null {
  try {
    return normalizeBarcode(input, format);
  } catch (error) {
    if (error instanceof InvalidBarcodeError) return null;
    throw error;
  }
}
