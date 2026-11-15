import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Post,
  StreamableFile,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { ProductDto } from '@inventaire/shared';
import { eq } from 'drizzle-orm';
import { parseId } from '../common/validation';
import { DB, type Database } from '../database/database.module';
import { products } from '../database/schema';
import { toProductDto } from '../products/products.service';
import { UnsupportedImageError, MAX_UPLOAD_BYTES } from './image.processor';
import { ImageStore } from './image-store.service';

@Controller()
export class ImagesController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ImageStore) private readonly store: ImageStore,
  ) {}

  @Post('products/:id/image')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async upload(
    @Param('id') rawId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ProductDto> {
    const id = parseId(rawId);
    if (!file) throw new BadRequestException('Aucune image reçue');
    const [current] = await this.db.select().from(products).where(eq(products.id, id));
    if (!current) throw new NotFoundException('Produit introuvable');

    let name: string;
    try {
      name = await this.store.saveThumbnail(file.buffer);
    } catch (error) {
      if (error instanceof UnsupportedImageError) {
        throw new UnsupportedMediaTypeException('Image JPEG, PNG ou WebP attendue');
      }
      throw error;
    }
    try {
      const [row] = await this.db
        .update(products)
        .set({ imagePath: name })
        .where(eq(products.id, id))
        .returning();
      if (!row) throw new NotFoundException('Produit introuvable');
      await this.store.remove(current.imagePath);
      return toProductDto(row);
    } catch (error) {
      await this.store.remove(name);
      throw error;
    }
  }

  @Get('images/:file')
  @Header('Content-Type', 'image/webp')
  @Header('Cache-Control', 'private, max-age=31536000, immutable')
  async serve(@Param('file') file: string): Promise<StreamableFile> {
    const data = await this.store.read(file);
    if (!data) throw new NotFoundException();
    return new StreamableFile(data);
  }
}
