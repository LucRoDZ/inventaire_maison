import { Controller, Get, Inject } from '@nestjs/common';
import type { CategoryDto } from '@inventaire/shared';
import { CategoriesService } from './categories.service';

/**
 * Categories of the household of the request, read by everyone (pickers, filters). They are
 * changed from the admin console only, for an explicit household (D2, D5).
 */
@Controller('categories')
export class CategoriesController {
  constructor(@Inject(CategoriesService) private readonly categories: CategoriesService) {}

  @Get()
  list(): Promise<CategoryDto[]> {
    return this.categories.list();
  }
}
