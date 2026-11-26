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
  QuantityUnit,
} from '@inventaire/shared';
import { and, asc, desc, eq, isNull, or, sql, type SQL } from 'drizzle-orm';
import { isUniqueViolation } from '../common/pg-errors';
import type { Transaction } from '../database/database.module';
import { categories, locations, products, shelves, stockItems } from '../database/schema';
import { TenantDb } from '../database/tenant-db';
import { syncAutoShopping } from '../shopping/auto-shopping';
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
  minQuantity?: number | null;
  amount?: number | null;
  unit?: QuantityUnit | null;
}

export interface ProductSearch {
  q?: string;
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
    minQuantity: row.minQuantity,
    amount: row.amount === null ? null : Number(row.amount),
    unit: row.unit as QuantityUnit | null,
    mergedIntoId: row.mergedIntoId,
  };
}

@Injectable()
export class ProductsService {
  constructor(@Inject(TenantDb) private readonly tenant: TenantDb) {}

  async search({ q, limit }: ProductSearch): Promise<ProductDto[]> {
    return this.tenant.run(async (tx, householdId) => {
      const term = q ? normalizeSearch(q) : '';
      const conditions: SQL[] = [
        eq(products.householdId, householdId),
        isNull(products.mergedIntoId),
      ];

      const query = tx.select().from(products);
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
    });
  }

  async get(id: number): Promise<ProductDetailDto> {
    return this.tenant.run((tx, householdId) => this.getIn(tx, householdId, id));
  }

  private async getIn(tx: Transaction, householdId: number, id: number): Promise<ProductDetailDto> {
    const [row] = await tx
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.householdId, householdId)));
    if (!row) throw new NotFoundException('Produit introuvable');
    const lines = await tx
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
      .innerJoin(
        locations,
        and(eq(locations.id, stockItems.locationId), eq(locations.householdId, householdId)),
      )
      .leftJoin(
        shelves,
        and(eq(shelves.id, stockItems.shelfId), eq(shelves.householdId, householdId)),
      )
      .where(and(eq(stockItems.productId, id), eq(stockItems.householdId, householdId)))
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
      return await this.tenant.run(async (tx, householdId) => {
        await this.requireCategory(tx, householdId, input.categoryId);
        if (input.defaultLocationId) {
          await this.requireLocation(tx, householdId, input.defaultLocationId);
        }
        if (barcode) {
          const existing = await this.findByBarcode(tx, householdId, barcode);
          if (existing) throw this.barcodeTaken(existing);
        }
        const [row] = await tx
          .insert(products)
          .values({
            householdId,
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
        // Lost a race with a concurrent creation of the same code in the household.
        const existing = await this.tenant.run((tx, householdId) =>
          this.findByBarcode(tx, householdId, barcode),
        );
        throw this.barcodeTaken(existing ?? undefined);
      }
      throw error;
    }
  }

  /** Id of the product of the household that carries this canonical barcode, or null. */
  async findByBarcode(
    tx: Transaction,
    householdId: number,
    barcode: string,
  ): Promise<number | null> {
    const [row] = await tx
      .select({ id: products.id, mergedIntoId: products.mergedIntoId })
      .from(products)
      .where(and(eq(products.householdId, householdId), eq(products.barcode, barcode)));
    if (!row) return null;
    // The barcode of a merged product leads to the product that was kept.
    let id = row.id;
    let next = row.mergedIntoId;
    for (let hops = 0; next !== null && hops < 10; hops += 1) {
      id = next;
      const [step] = await tx
        .select({ mergedIntoId: products.mergedIntoId })
        .from(products)
        .where(and(eq(products.id, id), eq(products.householdId, householdId)));
      next = step?.mergedIntoId ?? null;
    }
    return id;
  }

  /** Attaches a scanned barcode to a product that has none. */
  async attachBarcode(id: number, rawBarcode: string, format?: BarcodeFormat): Promise<ProductDto> {
    let barcode: string;
    try {
      barcode = normalizeBarcode(rawBarcode, format);
    } catch (error) {
      if (error instanceof InvalidBarcodeError)
        throw new BadRequestException('Code-barres invalide');
      throw error;
    }
    try {
      return await this.tenant.run(async (tx, householdId) => {
        const [current] = await tx
          .select()
          .from(products)
          .where(and(eq(products.id, id), eq(products.householdId, householdId)))
          .for('update');
        if (!current) throw new NotFoundException('Produit introuvable');
        if (current.barcode === barcode) return toProductDto(current);
        if (current.barcode !== null) {
          throw new ConflictException('Ce produit a déjà un code-barres');
        }
        const [taken] = await tx
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.householdId, householdId), eq(products.barcode, barcode)));
        if (taken) throw this.barcodeTaken(taken.id);
        const [row] = await tx
          .update(products)
          .set({ barcode, updatedAt: sql`now()` })
          .where(and(eq(products.id, id), eq(products.householdId, householdId)))
          .returning();
        return toProductDto(row!);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.tenant.run((tx, householdId) =>
          this.findByBarcode(tx, householdId, barcode),
        );
        throw this.barcodeTaken(existing ?? undefined);
      }
      throw error;
    }
  }

  async update(id: number, patch: ProductPatchInput): Promise<ProductDto> {
    return this.tenant.run(async (tx, householdId) => {
      const [current] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, id), eq(products.householdId, householdId)))
        .for('update');
      if (!current) throw new NotFoundException('Produit introuvable');
      if (patch.categoryId !== undefined) {
        await this.requireCategory(tx, householdId, patch.categoryId);
      }
      if (patch.defaultLocationId) {
        await this.requireLocation(tx, householdId, patch.defaultLocationId);
      }

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
          ...(patch.minQuantity !== undefined && { minQuantity: patch.minQuantity }),
          ...(patch.amount !== undefined && {
            amount: patch.amount === null ? null : String(patch.amount),
          }),
          ...(patch.unit !== undefined && { unit: patch.unit }),
          // Choosing a category, even the same one, is a confirmation by a person.
          ...(patch.categoryId !== undefined && {
            categoryId: patch.categoryId,
            categoryGuessed: false,
          }),
          searchText: buildSearchText(name, brand),
          updatedAt: sql`now()`,
        })
        .where(and(eq(products.id, id), eq(products.householdId, householdId)))
        .returning();
      if (patch.minQuantity !== undefined) await syncAutoShopping(tx, householdId, id);
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

  private async requireCategory(tx: Transaction, householdId: number, id: number): Promise<void> {
    const [row] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.householdId, householdId)));
    if (!row) throw new NotFoundException('Catégorie introuvable');
  }

  private async requireLocation(tx: Transaction, householdId: number, id: number): Promise<void> {
    const [row] = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.id, id), eq(locations.householdId, householdId)));
    if (!row) throw new NotFoundException('Lieu introuvable');
  }
}
