import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { ProductDto } from '@inventaire/shared';
import { and, eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { parseId } from '../common/validation';
import { products } from '../database/schema';
import { TenantDb } from '../database/tenant-db';
import { toProductDto } from '../products/products.service';
import { UnsupportedImageError, MAX_UPLOAD_BYTES } from './image.processor';
import { IMAGE_FILE_PATTERN, ImageStore } from './image-store.service';

/** Product pictures of the household of the request. */
@Injectable()
export class ProductImagesService {
  constructor(
    @Inject(TenantDb) private readonly tenant: TenantDb,
    @Inject(ImageStore) private readonly store: ImageStore,
  ) {}

  async upload(productId: number, data: Buffer): Promise<ProductDto> {
    return this.tenant.run(async (tx, householdId) => {
      const [current] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, productId), eq(products.householdId, householdId)));
      if (!current) throw new NotFoundException('Produit introuvable');

      let name: string;
      try {
        name = await this.store.saveThumbnail(householdId, data);
      } catch (error) {
        if (error instanceof UnsupportedImageError) {
          throw new UnsupportedMediaTypeException('Image JPEG, PNG ou WebP attendue');
        }
        throw error;
      }
      try {
        const [row] = await tx
          .update(products)
          .set({ imagePath: name })
          .where(and(eq(products.id, productId), eq(products.householdId, householdId)))
          .returning();
        if (!row) throw new NotFoundException('Produit introuvable');
        await this.store.remove(householdId, current.imagePath);
        return toProductDto(row);
      } catch (error) {
        await this.store.remove(householdId, name);
        throw error;
      }
    });
  }

  /** The thumbnail, only when a product of the household uses it; null otherwise (404). */
  async read(file: string): Promise<Buffer | null> {
    if (!IMAGE_FILE_PATTERN.test(file)) return null;
    return this.tenant.run(async (tx, householdId) => {
      const [owner] = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.householdId, householdId), eq(products.imagePath, file)))
        .limit(1);
      if (!owner) return null;
      return this.store.read(householdId, file);
    });
  }
}

@Controller()
export class ImagesController {
  constructor(@Inject(ProductImagesService) private readonly images: ProductImagesService) {}

  @Post('products/:id/image')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async upload(
    @Param('id') rawId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ProductDto> {
    const id = parseId(rawId);
    if (!file) throw new BadRequestException('Aucune image reçue');
    return this.images.upload(id, file.buffer);
  }

  /**
   * Served only to the household that owns the product. `no-cache` with an ETag: the browser keeps
   * the file but asks again each time, so the ownership check always runs (a 304 costs nothing).
   */
  @Get('images/:file')
  async serve(
    @Param('file') file: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | undefined> {
    const data = await this.images.read(file);
    if (!data) throw new NotFoundException();
    const etag = `"${file.slice(0, 32)}"`;
    res.setHeader('Cache-Control', 'private, no-cache');
    res.setHeader('ETag', etag);
    if (req.get('if-none-match') === etag) {
      res.status(304);
      return undefined;
    }
    res.setHeader('Content-Type', 'image/webp');
    return new StreamableFile(data);
  }
}
