import { Module } from '@nestjs/common';
import { CategoriesController, OffCategoryMapController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  controllers: [CategoriesController, OffCategoryMapController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
