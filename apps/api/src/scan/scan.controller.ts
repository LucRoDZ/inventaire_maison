import { BadRequestException, Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
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
    @Req() req: Request,
  ): Promise<ScanResponse> {
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
    return this.scan.resolve(barcode, req.user!.id);
  }
}
