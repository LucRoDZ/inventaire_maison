import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ProductDto, ScanResponse } from '@inventaire/shared';
import { eq } from 'drizzle-orm';
import { isUniqueViolation } from '../common/pg-errors';
import { DB, type Database } from '../database/database.module';
import { products } from '../database/schema';
import { RemoteImageService, isAllowedImageUrl } from '../images/remote-image.service';
import { CategoryGuessService } from '../off/category-guess.service';
import { OffClient } from '../off/off.client';
import type { OffProduct } from '../off/off.mapper';
import { ProductsService, toProductDto } from '../products/products.service';
import { buildSearchText } from '../products/search-text';

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);
  /** Concurrent scans of the same unknown code share one lookup, hence one created product. */
  private readonly inFlight = new Map<string, Promise<ScanResponse>>();
  private readonly background = new Set<Promise<void>>();

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ProductsService) private readonly catalog: ProductsService,
    @Inject(OffClient) private readonly off: OffClient,
    @Inject(CategoryGuessService) private readonly guesser: CategoryGuessService,
    @Inject(RemoteImageService) private readonly remoteImages: RemoteImageService,
  ) {}

  /** `barcode` is already normalized. `catalogOnly`: never asks Open Food Facts, never creates. */
  async resolve(
    barcode: string,
    userId: number,
    options: { catalogOnly?: boolean } = {},
  ): Promise<ScanResponse> {
    const [existing] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.barcode, barcode));
    if (existing) return { status: 'known', product: await this.catalog.get(existing.id) };
    if (options.catalogOnly) return { status: 'unknown', reason: 'not_found' };

    let pending = this.inFlight.get(barcode);
    if (!pending) {
      pending = this.lookup(barcode, userId).finally(() => this.inFlight.delete(barcode));
      this.inFlight.set(barcode, pending);
    }
    return pending;
  }

  /** Resolves once the background image downloads started so far are over (used by tests). */
  async idle(): Promise<void> {
    await Promise.all([...this.background]);
  }

  private async lookup(barcode: string, userId: number): Promise<ScanResponse> {
    const result = await this.off.fetchProduct(barcode);
    if (result.status === 'unavailable') return { status: 'unknown', reason: 'off_unavailable' };
    if (result.status === 'not_found') return { status: 'unknown', reason: 'not_found' };

    const card = result.product;
    if (!card.name) {
      return {
        status: 'unknown',
        reason: 'poor_data',
        hints: {
          brand: card.brand,
          sizeLabel: card.quantity,
          imageUrl: card.imageUrl && isAllowedImageUrl(card.imageUrl) ? card.imageUrl : null,
        },
      };
    }

    const categoryId = await this.guesser.guess(card.categoriesTags);
    let product: ProductDto;
    try {
      product = await this.insert(barcode, card, card.name, categoryId, userId);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Another process created it in the meantime.
      const [row] = await this.db.select().from(products).where(eq(products.barcode, barcode));
      if (!row) throw error;
      return { status: 'suggested', product: toProductDto(row) };
    }
    this.fetchImageInBackground(product.id, card.imageUrl);
    return { status: 'suggested', product };
  }

  private async insert(
    barcode: string,
    card: OffProduct,
    name: string,
    categoryId: number,
    userId: number,
  ): Promise<ProductDto> {
    const [row] = await this.db
      .insert(products)
      .values({
        barcode,
        name,
        brand: card.brand,
        sizeLabel: card.quantity,
        categoryId,
        source: 'off',
        categoryGuessed: true,
        offPayload: card.payload,
        searchText: buildSearchText(name, card.brand),
        createdBy: userId,
      })
      .returning();
    return toProductDto(row!);
  }

  private fetchImageInBackground(productId: number, url: string | null): void {
    if (!url) return;
    const task = (async () => {
      const imagePath = await this.remoteImages.download(url);
      if (imagePath) {
        await this.db.update(products).set({ imagePath }).where(eq(products.id, productId));
      }
    })()
      .catch((error: unknown) =>
        this.logger.warn(`Image du produit ${productId} non enregistrée : ${String(error)}`),
      )
      .finally(() => this.background.delete(task));
    this.background.add(task);
  }
}
