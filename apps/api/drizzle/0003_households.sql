-- Households: isolation of the data of each family (decisions D1 to D6, docs/foyers-et-meubles.md).
-- Written by hand: drizzle-kit does not generate the row-level security below. The Drizzle migrator
-- applies pending migrations in one transaction, so a failure leaves nothing behind.

CREATE TABLE "households" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "households_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "households_name_length_check" CHECK (char_length("households"."name") between 1 and 40)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "households_name_lower_key" ON "households" USING btree (lower("name"));
--> statement-breakpoint

-- D4: everything that exists goes to « Famille ». On an empty database nothing is created here: the
-- first start creates the first household together with the first admin.
INSERT INTO "households" ("name")
SELECT 'Famille'
WHERE EXISTS (SELECT 1 FROM "users") OR EXISTS (SELECT 1 FROM "locations")
   OR EXISTS (SELECT 1 FROM "categories") OR EXISTS (SELECT 1 FROM "products");
--> statement-breakpoint

-- Accounts: outside row-level security (login comes before any household), filtered in the code.
ALTER TABLE "users" ADD COLUMN "household_id" integer;
--> statement-breakpoint
UPDATE "users" SET "household_id" = (SELECT min("id") FROM "households");
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "household_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "users_household_idx" ON "users" USING btree ("household_id");
--> statement-breakpoint

-- household_id on every data table. The default reads the household of the transaction (TenantDb):
-- an insert made without one is null, hence refused by NOT NULL.
ALTER TABLE "locations" ADD COLUMN "household_id" integer DEFAULT NULLIF(current_setting('app.household_id', true), '')::int;
--> statement-breakpoint
ALTER TABLE "shelves" ADD COLUMN "household_id" integer DEFAULT NULLIF(current_setting('app.household_id', true), '')::int;
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "household_id" integer DEFAULT NULLIF(current_setting('app.household_id', true), '')::int;
--> statement-breakpoint
ALTER TABLE "off_category_map" ADD COLUMN "household_id" integer DEFAULT NULLIF(current_setting('app.household_id', true), '')::int;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "household_id" integer DEFAULT NULLIF(current_setting('app.household_id', true), '')::int;
--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "household_id" integer DEFAULT NULLIF(current_setting('app.household_id', true), '')::int;
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "household_id" integer DEFAULT NULLIF(current_setting('app.household_id', true), '')::int;
--> statement-breakpoint
UPDATE "locations" SET "household_id" = (SELECT min("id") FROM "households");
--> statement-breakpoint
UPDATE "shelves" SET "household_id" = (SELECT min("id") FROM "households");
--> statement-breakpoint
UPDATE "categories" SET "household_id" = (SELECT min("id") FROM "households");
--> statement-breakpoint
UPDATE "off_category_map" SET "household_id" = (SELECT min("id") FROM "households");
--> statement-breakpoint
UPDATE "products" SET "household_id" = (SELECT min("id") FROM "households");
--> statement-breakpoint
UPDATE "stock_items" SET "household_id" = (SELECT min("id") FROM "households");
--> statement-breakpoint
UPDATE "stock_movements" SET "household_id" = (SELECT min("id") FROM "households");
--> statement-breakpoint
ALTER TABLE "locations" ALTER COLUMN "household_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "shelves" ALTER COLUMN "household_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "household_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "off_category_map" ALTER COLUMN "household_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "household_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "stock_items" ALTER COLUMN "household_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "stock_movements" ALTER COLUMN "household_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shelves" ADD CONSTRAINT "shelves_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "off_category_map" ADD CONSTRAINT "off_category_map_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "locations_household_idx" ON "locations" USING btree ("household_id");
--> statement-breakpoint
CREATE INDEX "shelves_household_idx" ON "shelves" USING btree ("household_id");
--> statement-breakpoint
CREATE INDEX "categories_household_idx" ON "categories" USING btree ("household_id");
--> statement-breakpoint
CREATE INDEX "off_category_map_household_idx" ON "off_category_map" USING btree ("household_id");
--> statement-breakpoint
CREATE INDEX "products_household_idx" ON "products" USING btree ("household_id");
--> statement-breakpoint
CREATE INDEX "stock_items_household_idx" ON "stock_items" USING btree ("household_id");
--> statement-breakpoint
CREATE INDEX "stock_movements_household_idx" ON "stock_movements" USING btree ("household_id");
--> statement-breakpoint

-- Targets of the composite foreign keys: (id, household_id) on every referenced parent.
ALTER TABLE "locations" ADD CONSTRAINT "locations_id_household_key" UNIQUE("id","household_id");
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_id_household_key" UNIQUE("id","household_id");
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_id_household_key" UNIQUE("id","household_id");
--> statement-breakpoint

-- Global uniqueness becomes uniqueness per household (D5, D6).
ALTER TABLE "products" DROP CONSTRAINT "products_barcode_unique";
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_household_barcode_key" UNIQUE("household_id","barcode");
--> statement-breakpoint
DROP INDEX "categories_name_lower_key";
--> statement-breakpoint
DROP INDEX "categories_single_fallback_key";
--> statement-breakpoint
CREATE UNIQUE INDEX "categories_household_name_key" ON "categories" USING btree ("household_id",lower("name"));
--> statement-breakpoint
CREATE UNIQUE INDEX "categories_household_fallback_key" ON "categories" USING btree ("household_id") WHERE "categories"."is_fallback";
--> statement-breakpoint
ALTER TABLE "off_category_map" DROP CONSTRAINT "off_category_map_off_tag_unique";
--> statement-breakpoint
ALTER TABLE "off_category_map" ADD CONSTRAINT "off_category_map_household_tag_key" UNIQUE("household_id","off_tag");
--> statement-breakpoint
-- Two pieces of furniture whose names only differ by their case: the later ones get a number.
UPDATE "locations" AS l SET "name" = l."name" || ' ' || d.rn
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "household_id", lower("name") ORDER BY "id") AS rn
  FROM "locations"
) AS d
WHERE l."id" = d."id" AND d.rn > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "locations_household_name_key" ON "locations" USING btree ("household_id",lower("name"));
--> statement-breakpoint

-- Composite foreign keys: a child can never point at an object of another household.
ALTER TABLE "shelves" DROP CONSTRAINT "shelves_location_id_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "shelves" ADD CONSTRAINT "shelves_location_household_fk" FOREIGN KEY ("location_id","household_id") REFERENCES "public"."locations"("id","household_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "off_category_map" DROP CONSTRAINT "off_category_map_category_id_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "off_category_map" ADD CONSTRAINT "off_category_map_category_household_fk" FOREIGN KEY ("category_id","household_id") REFERENCES "public"."categories"("id","household_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_category_id_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_household_fk" FOREIGN KEY ("category_id","household_id") REFERENCES "public"."categories"("id","household_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_default_location_id_locations_id_fk";
--> statement-breakpoint
-- Deleting a location clears the default location of its products, never their household.
ALTER TABLE "products" ADD CONSTRAINT "products_default_location_household_fk" FOREIGN KEY ("default_location_id","household_id") REFERENCES "public"."locations"("id","household_id") ON DELETE SET NULL ("default_location_id") ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_items" DROP CONSTRAINT "stock_items_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_product_household_fk" FOREIGN KEY ("product_id","household_id") REFERENCES "public"."products"("id","household_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_items" DROP CONSTRAINT "stock_items_location_id_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_location_household_fk" FOREIGN KEY ("location_id","household_id") REFERENCES "public"."locations"("id","household_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_household_fk" FOREIGN KEY ("product_id","household_id") REFERENCES "public"."products"("id","household_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- The journal survives the deletion of a piece of furniture: plain location id, names kept.
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_location_id_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "location_name" text;
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "shelf_name" text;
--> statement-breakpoint
UPDATE "stock_movements" AS m SET "location_name" = l."name" FROM "locations" AS l WHERE l."id" = m."location_id";
--> statement-breakpoint
-- Rows of a shelf deleted before this migration keep a null shelf name (the history says so).
UPDATE "stock_movements" AS m SET "shelf_name" = s."name" FROM "shelves" AS s WHERE s."id" = m."shelf_id";
--> statement-breakpoint
UPDATE "stock_movements" SET "location_name" = '' WHERE "location_name" IS NULL;
--> statement-breakpoint
ALTER TABLE "stock_movements" ALTER COLUMN "location_name" SET NOT NULL;
--> statement-breakpoint

-- Row-level security: the safety net under the filters of the application. Without a household in
-- the transaction, no row is visible and no row can be written. FORCE applies it to the table owner
-- too (superusers, used only for migrations, always bypass it).
ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "locations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "locations_household_isolation" ON "locations" AS PERMISSIVE FOR ALL USING ("household_id" = NULLIF(current_setting('app.household_id', true), '')::int) WITH CHECK ("household_id" = NULLIF(current_setting('app.household_id', true), '')::int);
--> statement-breakpoint
ALTER TABLE "shelves" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "shelves" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "shelves_household_isolation" ON "shelves" AS PERMISSIVE FOR ALL USING ("household_id" = NULLIF(current_setting('app.household_id', true), '')::int) WITH CHECK ("household_id" = NULLIF(current_setting('app.household_id', true), '')::int);
--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "categories" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "categories_household_isolation" ON "categories" AS PERMISSIVE FOR ALL USING ("household_id" = NULLIF(current_setting('app.household_id', true), '')::int) WITH CHECK ("household_id" = NULLIF(current_setting('app.household_id', true), '')::int);
--> statement-breakpoint
ALTER TABLE "off_category_map" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "off_category_map" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "off_category_map_household_isolation" ON "off_category_map" AS PERMISSIVE FOR ALL USING ("household_id" = NULLIF(current_setting('app.household_id', true), '')::int) WITH CHECK ("household_id" = NULLIF(current_setting('app.household_id', true), '')::int);
--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "products_household_isolation" ON "products" AS PERMISSIVE FOR ALL USING ("household_id" = NULLIF(current_setting('app.household_id', true), '')::int) WITH CHECK ("household_id" = NULLIF(current_setting('app.household_id', true), '')::int);
--> statement-breakpoint
ALTER TABLE "stock_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "stock_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "stock_items_household_isolation" ON "stock_items" AS PERMISSIVE FOR ALL USING ("household_id" = NULLIF(current_setting('app.household_id', true), '')::int) WITH CHECK ("household_id" = NULLIF(current_setting('app.household_id', true), '')::int);
--> statement-breakpoint
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "stock_movements" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "stock_movements_household_isolation" ON "stock_movements" AS PERMISSIVE FOR ALL USING ("household_id" = NULLIF(current_setting('app.household_id', true), '')::int) WITH CHECK ("household_id" = NULLIF(current_setting('app.household_id', true), '')::int);
