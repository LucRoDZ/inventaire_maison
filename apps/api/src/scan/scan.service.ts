import { Inject, Injectable, Logger } from '@nestjs/common';
import { parseNetQuantity, type ProductDto, type ScanResponse } from '@inventaire/shared';
import { and, eq } from 'drizzle-orm';
import { isUniqueViolation } from '../common/pg-errors';
import { products } from '../database/schema';
import { TenantDb } from '../database/tenant-db';
import { RemoteImageService, isAllowedImageUrl } from '../images/remote-image.service';
import { CategoryGuessService } from '../off/category-guess.service';
import { OffClient } from '../off/off.client';
import type { OffProduct } from '../off/off.mapper';
import { ProductsService, toProductDto } from '../products/products.service';
import { buildSearchText } from '../products/search-text';

/**
 * Resolves a barcode within the household of the request: its own catalog first, then Open Food
 * Facts. Two households scanning the same code get two independent products (D5): a household
 * never starts from the card of another one.
 */
@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);
  /** Concurrent scans of the same unknown code in one household share one lookup and one product. */
  private readonly inFlight = new Map<string, Promise<ScanResponse>>();
  private readonly background = new Set<Promise<void>>();

  constructor(
    @Inject(TenantDb) private readonly tenant: TenantDb,
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
    const known = await this.tenant.run(async (tx, householdId) => {
      const id = await this.catalog.findByBarcode(tx, householdId, barcode);
      return { id, householdId };
    });
    if (known.id !== null) return { status: 'known', product: await this.catalog.get(known.id) };
    if (options.catalogOnly) return { status: 'unknown', reason: 'not_found' };

    const key = `${known.householdId}:${barcode}`;
    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = this.lookup(barcode, userId).finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, pending);
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
    let created: { product: ProductDto; householdId: number };
    try {
      created = await this.insert(barcode, card, card.name, categoryId, userId);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Another request of the household created it in the meantime.
      const row = await this.tenant.run(async (tx, householdId) => {
        const [found] = await tx
          .select()
          .from(products)
          .where(and(eq(products.householdId, householdId), eq(products.barcode, barcode)));
        return found;
      });
      if (!row) throw error;
      return { status: 'suggested', product: toProductDto(row) };
    }
    this.fetchImageInBackground(created.householdId, created.product.id, card.imageUrl);
    return { status: 'suggested', product: created.product };
  }

  private async insert(
    barcode: string,
    card: OffProduct,
    name: string,
    categoryId: number,
    userId: number,
  ): Promise<{ product: ProductDto; householdId: number }> {
    const net = parseNetQuantity(card.quantity);
    return this.tenant.run(async (tx, householdId) => {
      const [row] = await tx
        .insert(products)
        .values({
          householdId,
          barcode,
          name,
          brand: card.brand,
          sizeLabel: card.quantity,
          amount: net ? String(net.amount) : null,
          unit: net?.unit ?? null,
          categoryId,
          source: 'off',
          categoryGuessed: true,
          offPayload: card.payload,
          searchText: buildSearchText(name, card.brand),
          createdBy: userId,
        })
        .returning();
      return { product: toProductDto(row!), householdId };
    });
  }

  /** After the answer: its own transaction, bound to the household of the scan. */
  private fetchImageInBackground(householdId: number, productId: number, url: string | null): void {
    if (!url) return;
    const task = (async () => {
      const imagePath = await this.remoteImages.download(householdId, url);
      if (imagePath) {
        await this.tenant.detached(householdId, (tx) =>
          tx
            .update(products)
            .set({ imagePath })
            .where(and(eq(products.id, productId), eq(products.householdId, householdId))),
        );
      }
    })()
      .catch((error: unknown) =>
        this.logger.warn(`Image du produit ${productId} non enregistrée : ${String(error)}`),
      )
      .finally(() => this.background.delete(task));
    this.background.add(task);
  }
}
