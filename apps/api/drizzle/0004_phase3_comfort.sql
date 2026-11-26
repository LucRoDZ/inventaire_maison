-- Phase 3 (confort et refonte), written by hand: the only migration of the phase.
-- settings, shopping_items, push_subscriptions (row-level secured like every household table),
-- shelf life per category, minimum quantity, net amount and merge on products, consumed/wasted.
CREATE TABLE "push_subscriptions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "push_subscriptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"household_id" integer DEFAULT NULLIF(current_setting('app.household_id', true), '')::int NOT NULL,
	"user_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"household_id" integer PRIMARY KEY DEFAULT NULLIF(current_setting('app.household_id', true), '')::int NOT NULL,
	"expiry_alert_days" integer DEFAULT 3 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_expiry_alert_days_check" CHECK ("settings"."expiry_alert_days" between 0 and 30)
);
--> statement-breakpoint
CREATE TABLE "shopping_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "shopping_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"household_id" integer DEFAULT NULLIF(current_setting('app.household_id', true), '')::int NOT NULL,
	"product_id" integer,
	"label" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"amount" numeric(10, 3),
	"unit" text,
	"checked" boolean DEFAULT false NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_at" timestamp with time zone,
	CONSTRAINT "shopping_items_target_check" CHECK ("shopping_items"."product_id" is not null or "shopping_items"."label" is not null),
	CONSTRAINT "shopping_items_label_check" CHECK ("shopping_items"."label" is null or char_length("shopping_items"."label") between 1 and 120),
	CONSTRAINT "shopping_items_quantity_check" CHECK ("shopping_items"."quantity" between 1 and 999),
	CONSTRAINT "shopping_items_amount_check" CHECK ("shopping_items"."amount" is null or "shopping_items"."amount" > 0),
	CONSTRAINT "shopping_items_unit_check" CHECK ("shopping_items"."unit" is null or "shopping_items"."unit" in ('g', 'kg', 'ml', 'cl', 'l', 'unit')),
	CONSTRAINT "shopping_items_origin_check" CHECK ("shopping_items"."origin" in ('manual', 'auto'))
);
--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_reason_check";
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "shelf_life_days" integer;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "min_quantity" integer;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "amount" numeric(10, 3);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "unit" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "merged_into_id" integer;
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_product_household_fk" FOREIGN KEY ("product_id","household_id") REFERENCES "public"."products"("id","household_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "push_subscriptions_household_idx" ON "push_subscriptions" USING btree ("household_id");
--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_household_endpoint_key" ON "push_subscriptions" USING btree ("household_id","endpoint");
--> statement-breakpoint
CREATE INDEX "shopping_items_household_idx" ON "shopping_items" USING btree ("household_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "shopping_items_open_product_key" ON "shopping_items" USING btree ("household_id","product_id") WHERE "shopping_items"."product_id" is not null and not "shopping_items"."checked";
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_merged_into_household_fk" FOREIGN KEY ("merged_into_id","household_id") REFERENCES "public"."products"("id","household_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "products_merged_into_idx" ON "products" USING btree ("merged_into_id");
--> statement-breakpoint
CREATE INDEX "stock_movements_household_reason_idx" ON "stock_movements" USING btree ("household_id","reason","created_at");
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_shelf_life_days_check" CHECK ("categories"."shelf_life_days" is null or "categories"."shelf_life_days" between 1 and 3650);
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_min_quantity_check" CHECK ("products"."min_quantity" is null or "products"."min_quantity" >= 1);
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_amount_check" CHECK ("products"."amount" is null or "products"."amount" > 0);
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_unit_check" CHECK ("products"."unit" is null or "products"."unit" in ('g', 'kg', 'ml', 'cl', 'l', 'unit'));
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_merged_into_check" CHECK ("products"."merged_into_id" is null or "products"."merged_into_id" <> "products"."id");
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reason_check" CHECK ("stock_movements"."reason" in ('scan_add', 'scan_remove', 'manual', 'move', 'correction', 'consumed', 'wasted'));
--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "settings_household_isolation" ON "settings" AS PERMISSIVE FOR ALL USING ("household_id" = NULLIF(current_setting('app.household_id', true), '')::int) WITH CHECK ("household_id" = NULLIF(current_setting('app.household_id', true), '')::int);
--> statement-breakpoint
ALTER TABLE "shopping_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "shopping_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "shopping_items_household_isolation" ON "shopping_items" AS PERMISSIVE FOR ALL USING ("household_id" = NULLIF(current_setting('app.household_id', true), '')::int) WITH CHECK ("household_id" = NULLIF(current_setting('app.household_id', true), '')::int);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "push_subscriptions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "push_subscriptions_household_isolation" ON "push_subscriptions" AS PERMISSIVE FOR ALL USING ("household_id" = NULLIF(current_setting('app.household_id', true), '')::int) WITH CHECK ("household_id" = NULLIF(current_setting('app.household_id', true), '')::int);
--> statement-breakpoint
-- Existing households get the suggested shelf lives of the model for the categories they kept.
UPDATE "categories" SET "shelf_life_days" = CASE "name" WHEN 'Viandes' THEN 3 WHEN 'Poissons et fruits de mer' THEN 2 WHEN 'Produits laitiers et œufs' THEN 7 WHEN 'Fruits et légumes' THEN 5 END WHERE "shelf_life_days" IS NULL AND "name" IN ('Viandes', 'Poissons et fruits de mer', 'Produits laitiers et œufs', 'Fruits et légumes');
