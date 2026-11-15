ALTER TABLE "shelves" ADD CONSTRAINT "shelves_id_location_key" UNIQUE("id","location_id");--> statement-breakpoint
ALTER TABLE "stock_items" DROP CONSTRAINT "stock_items_shelf_id_shelves_id_fk";--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_shelf_location_fk" FOREIGN KEY ("shelf_id","location_id") REFERENCES "public"."shelves"("id","location_id") ON DELETE no action ON UPDATE no action;
