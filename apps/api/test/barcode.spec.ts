import { InvalidBarcodeError, normalizeBarcode, tryNormalizeBarcode } from '@inventaire/shared';
import type { BarcodeErrorReason, BarcodeFormat } from '@inventaire/shared';
import { describe, expect, it } from 'vitest';

describe('normalizeBarcode: valid codes', () => {
  const cases: [string, string, string, BarcodeFormat?][] = [
    ['EAN-13 (Nutella)', '3017620422003', '3017620422003'],
    ['EAN-13 (Coca-Cola)', '5449000000996', '5449000000996'],
    ['EAN-13 (Stabilo)', '4006381333931', '4006381333931'],
    ['EAN-13 with spaces', '3 017620 422003', '3017620422003'],
    ['EAN-13 with dashes', '3017-6204-22003', '3017620422003'],
    ['EAN-13 with surrounding blanks', '  3017620422003\n', '3017620422003'],
    ['EAN-13 with a leading zero', '0036000291452', '0036000291452'],
    ['EAN-8', '96385074', '96385074'],
    ['EAN-8 reported as ean_8', '73513537', '73513537', 'ean_8'],
    ['UPC-A', '036000291452', '0036000291452'],
    ['UPC-A reported as upc_a', '012345678905', '0012345678905', 'upc_a'],
    // UPC-E 04252614 is UPC-A 042100005264 (last digit of the body is 1).
    ['UPC-E, body ending in 1', '04252614', '0042100005264', 'upc_e'],
    ['UPC-E, body ending in 0', '01234505', '0012000003455', 'upc_e'],
    ['UPC-E, body ending in 3', '01234531', '0012300000451', 'upc_e'],
    ['UPC-E, body ending in 4', '01234543', '0012340000053', 'upc_e'],
    ['UPC-E, body ending in 6', '01234565', '0012345000065', 'upc_e'],
  ];
  it.each(cases)('%s', (_name, input, expected, format) => {
    expect(normalizeBarcode(input, format)).toBe(expected);
    expect(tryNormalizeBarcode(input, format)).toBe(expected);
  });

  it('is idempotent', () => {
    for (const [, input, , format] of cases) {
      const once = normalizeBarcode(input, format);
      expect(normalizeBarcode(once)).toBe(once);
    }
  });
});

describe('normalizeBarcode: invalid codes', () => {
  const cases: [string, string, BarcodeErrorReason, BarcodeFormat?][] = [
    ['empty string', '', 'empty'],
    ['only spaces and dashes', ' - - ', 'empty'],
    ['letters', 'ABCDEFGHIJKLM', 'not_digits'],
    ['letters mixed with digits', '30176204220A3', 'not_digits'],
    ['a decimal point', '3017620.22003', 'not_digits'],
    ['14 digits', '30176204220031', 'bad_length'],
    ['11 digits', '30176204220', 'bad_length'],
    ['7 digits', '9638507', 'bad_length'],
    ['EAN-13 with a wrong check digit', '3017620422004', 'bad_check_digit'],
    ['EAN-8 with a wrong check digit', '96385075', 'bad_check_digit'],
    ['UPC-A with a wrong check digit', '036000291453', 'bad_check_digit'],
    ['UPC-E with a wrong check digit', '04252615', 'bad_check_digit', 'upc_e'],
    ['UPC-E with number system 2', '24252614', 'bad_length', 'upc_e'],
  ];
  it.each(cases)('%s', (_name, input, reason, format) => {
    expect(() => normalizeBarcode(input, format)).toThrowError(InvalidBarcodeError);
    try {
      normalizeBarcode(input, format);
    } catch (error) {
      expect((error as InvalidBarcodeError).reason).toBe(reason);
    }
    expect(tryNormalizeBarcode(input, format)).toBeNull();
  });

  it('reads an 8-digit code as an EAN-8 when no format is given', () => {
    // 04252614 is a valid UPC-E but not a valid EAN-8.
    expect(() => normalizeBarcode('04252614')).toThrowError(InvalidBarcodeError);
  });
});
