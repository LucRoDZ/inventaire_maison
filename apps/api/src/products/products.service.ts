import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  normalizeBarcode,
  InvalidBarcodeError,
  type BarcodeFormat,
  type ProductDetailDto,
  type ProductDto,
  type ProductSource,
  type ProductStockByLocationDto,
} from '@inventaire/shared';
import { and, asc, desc, eq, exists, or, sql, type SQL } from 'drizzle-orm';
import { isUniqueViolation } from '../common/pg-errors';
import { DB, type Database, type Transaction } from '../database/database.module';
import { categories, locations, products, shelves, stockItems } from '../database/schema';
import { buildSearchText, normalizeSearch } from './search-text';

export interface ProductCreateInput {
  name: string;
  categoryId: number;
  brand?: string | null;
  sizeLabel?: string | null;
  defaultLocationId?: number | null;
  barcode?: string | null;
  barcodeFormat?: BarcodeFormat;
}

export interface ProductPatchInput {
  name?: string;
  brand?: string | null;
  categoryId?: number;
  defaultLocationId?: number | null;
}

export interface ProductSearch {
  q?: string;
  needsReview?: boolean;
  limit: number;
}

/** Minimum word similarity for a fuzzy match (typos, missing words). */
const SIMILARITY_THRESHOLD = 0.3;

export function toProductDto(row: typeof products.$inferSelect): ProductDto {
  return {
    id: row.id,
    barcode: row.barcode,
    name: row.name,
    brand: row.brand,
    sizeLabel: row.sizeLabel,
    imageUrl: row.imagePath ? `/api/images/${row.imagePath}` : null,
    categoryId: row.categoryId,
    categoryGuessed: row.categoryGuessed,
    defaultLocationId: row.defaultLocationId,
    source: row.source as ProductSource,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class ProductsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async search({ q, needsReview, limit }: ProductSearch): Promise<ProductDto[]> {
    const term = q ? normalizeSearch(q) : '';
    const conditions: SQL[] = [];
    if (needsReview) {
      conditions.push(
        exists(
          this.db
            .select({ one: sql`1` })
            .from(stockItems)
            .where(eq(stockItems.productId, products.id)),
        ),
        // Only a category nobody has confirmed yet is pending. « Autre » chosen or confirmed by a
        // person is a valid classification: counting it would keep the product here for ever.
        eq(products.categoryGuessed, true),
      );
    }

    const query = this.db.select().from(products);
    if (term === '') {
      const rows = await query
        .where(and(...conditions))
        .orderBy(asc(products.name), asc(products.id))
        .limit(limit);
      return rows.map(toProductDto);
    }

    const contains = sql`position(${term} in ${products.searchText}) > 0`;
    const similarity = sql`word_similarity(${term}, ${products.searchText})`;
    const rows = await query
      .where(and(...conditions, or(contains, sql`${similarity} >= ${SIMILARITY_THRESHOLD}`)))
      .orderBy(desc(contains), desc(similarity), asc(products.name), asc(products.id))
      .limit(limit);
    return rows.map(toProductDto);
  }

  async get(id: number): Promise<ProductDetailDto> {
    const [row] = await this.db.select().from(products).where(eq(products.id, id));
    if (!row) throw new NotFoundException('Produit introuvable');
    const lines = await this.db
      .select({
        id: stockItems.id,
        locationId: stockItems.locationId,
        locationName: locations.name,
        shelfId: stockItems.shelfId,
        shelfName: shelves.name,
        quantity: stockItems.quantity,
        expiryDate: stockItems.expiryDate,
      })
      .from(stockItems)
      .innerJoin(locations, eq(locations.id, stockItems.locationId))
      .leftJoin(shelves, eq(shelves.id, stockItems.shelfId))
      .where(eq(stockItems.productId, id))
      .orderBy(
        asc(locations.sortOrder),
        asc(locations.id),
        // "Non rangé" last, then by shelf order, then nearest expiry first (no date last).
        sql`${shelves.sortOrder} asc nulls last`,
        sql`${stockItems.expiryDate} asc nulls last`,
        asc(stockItems.id),
      );

    const byLocation = new Map<number, ProductStockByLocationDto>();
    for (const line of lines) {
      let group = byLocation.get(line.locationId);
      if (!group) {
        group = {
          locationId: line.locationId,
          locationName: line.locationName,
          quantity: 0,
          lines: [],
        };
        byLocation.set(line.locationId, group);
      }
      group.quantity += line.quantity;
      group.lines.push({
        id: line.id,
        shelfId: line.shelfId,
        shelfName: line.shelfName,
        quantity: line.quantity,
        expiryDate: line.expiryDate,
      });
    }
    return { ...toProductDto(row), stock: [...byLocation.values()] };
  }

  async create(input: ProductCreateInput, userId: number): Promise<ProductDto> {
    let barcode: string | null = null;
    if (input.barcode) {
      try {
        barcode = normalizeBarcode(input.barcode, input.barcodeFormat);
      } catch (error) {
        if (error instanceof InvalidBarcodeError)
          throw new BadRequestException('Code-barres invalide');
        throw error;
      }
    }
    try {
      return await this.db.transaction(async (tx) => {
        await this.requireCategory(tx, input.categoryId);
        if (input.defaultLocationId) await this.requireLocation(tx, input.defaultLocationId);
        if (barcode) {
          const [existing] = await tx
            .select({ id: products.id })
            .from(products)
            .where(eq(products.barcode, barcode));
          if (existing) throw this.barcodeTaken(existing.id);
        }
        const [row] = await tx
          .insert(products)
          .values({
            barcode,
            name: input.name,
            brand: input.brand ?? null,
            sizeLabel: input.sizeLabel ?? null,
            categoryId: input.categoryId,
            defaultLocationId: input.defaultLocationId ?? null,
            source: 'manual',
            categoryGuessed: false,
            searchText: buildSearchText(input.name, input.brand),
            createdBy: userId,
          })
          .returning();
        return toProductDto(row!);
      });
    } catch (error) {
      if (isUniqueViolation(error) && barcode) {
        // Lost a race with a concurrent creation of the same code.
        const [existing] = await this.db
          .select({ id: products.id })
          .from(products)
          .where(eq(products.barcode, barcode));
        throw this.barcodeTaken(existing?.id);
      }
      throw error;
    }
  }

  async update(id: number, patch: ProductPatchInput): Promise<ProductDto> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(products).where(eq(products.id, id)).for('update');
      if (!current) throw new NotFoundException('Produit introuvable');
      if (patch.categoryId !== undefined) await this.requireCategory(tx, patch.categoryId);
      if (patch.defaultLocationId) await this.requireLocation(tx, patch.defaultLocationId);

      const name = patch.name ?? current.name;
      const brand = patch.brand === undefined ? current.brand : patch.brand;
      const [row] = await tx
        .update(products)
        .set({
          ...(patch.name !== undefined && { name: patch.name }),
          ...(patch.brand !== undefined && { brand: patch.brand }),
          ...(patch.defaultLocationId !== undefined && {
            defaultLocationId: patch.defaultLocationId,
          }),
          // Choosing a category, even the same one, is a confirmation by a person.
          ...(patch.categoryId !== undefined && {
            categoryId: patch.categoryId,
            categoryGuessed: false,
          }),
          searchText: buildSearchText(name, brand),
          updatedAt: sql`now()`,
        })
        .where(eq(products.id, id))
        .returning();
      return toProductDto(row!);
    });
  }

  private barcodeTaken(productId: number | undefined): ConflictException {
    return new ConflictException({
      statusCode: 409,
      message: 'Ce code-barres existe déjà au catalogue',
      error: 'Conflict',
      productId,
    });
  }

  private async requireCategory(tx: Transaction, id: number): Promise<void> {
    const [row] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, id));
    if (!row) throw new NotFoundException('Catégorie introuvable');
  }

  private async requireLocation(tx: Transaction, id: number): Promise<void> {
    const [row] = await tx.select({ id: locations.id }).from(locations).where(eq(locations.id, id));
    if (!row) throw new NotFoundException('Lieu introuvable');
  }
}
