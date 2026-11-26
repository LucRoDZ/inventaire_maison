import { Module } from '@nestjs/common';
import { ProductMergeService } from './product-merge.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductMergeService],
  exports: [ProductsService],
})
export class ProductsModule {}
