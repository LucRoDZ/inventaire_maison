import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import {
  InvalidBarcodeError,
  normalizeBarcode,
  type BarcodeFormat,
  type ScanResponse,
} from '@inventaire/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { ScanService } from './scan.service';

const formatSchema = z.enum(['ean_13', 'ean_8', 'upc_a', 'upc_e']).optional();

@Controller('scan')
export class ScanController {
  constructor(@Inject(ScanService) private readonly scan: ScanService) {}

  @Get(':barcode')
  resolve(
    @Param('barcode') raw: string,
    @Query('format') rawFormat: unknown,
    /** `true`: removal mode, the catalog only (nothing is created, Open Food Facts is not called). */
    @Query('catalogOnly') catalogOnly: unknown,
    @Req() req: Request,
  ): Promise<ScanResponse> {
    // A scan can create a product: a request started by another site (a link followed with the
    // session cookie, SameSite=Lax) is refused. Browsers always send Sec-Fetch-Site; other clients
    // (tests, curl) do not and are not affected.
    const site = req.get('sec-fetch-site');
    if (site === 'cross-site' || site === 'same-site') {
      throw new ForbiddenException('Origine non autorisée');
    }
    const format = formatSchema.safeParse(rawFormat);
    if (!format.success) throw new BadRequestException('Code-barres invalide');
    let barcode: string;
    try {
      barcode = normalizeBarcode(raw, format.data as BarcodeFormat | undefined);
    } catch (error) {
      if (error instanceof InvalidBarcodeError) {
        throw new BadRequestException('Code-barres invalide');
      }
      throw error;
    }
    return this.scan.resolve(barcode, req.user!.id, { catalogOnly: catalogOnly === 'true' });
  }
}
