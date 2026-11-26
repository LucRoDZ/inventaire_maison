-- Phase 4 (finition premium), the only migration of the phase: idempotency keys of the offline
-- operations, row-level secured like every household table.
CREATE TABLE "idempotency_keys" (
	"household_id" integer DEFAULT NULLIF(current_setting('app.household_id', true), '')::int NOT NULL,
	"key" text NOT NULL,
	"device_id" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_key_check" CHECK (char_length("idempotency_keys"."key") between 8 and 100),
	CONSTRAINT "idempotency_keys_device_check" CHECK (char_length("idempotency_keys"."device_id") between 8 and 100)
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_household_key" ON "idempotency_keys" USING btree ("household_id","key");--> statement-breakpoint
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys" USING btree ("created_at");
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "idempotency_keys" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "idempotency_keys_household_isolation" ON "idempotency_keys" AS PERMISSIVE FOR ALL USING ("household_id" = NULLIF(current_setting('app.household_id', true), '')::int) WITH CHECK ("household_id" = NULLIF(current_setting('app.household_id', true), '')::int);
