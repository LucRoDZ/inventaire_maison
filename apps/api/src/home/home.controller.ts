import { Controller, Get, Inject } from '@nestjs/common';
import type { HomeResponse } from '@inventaire/shared';
import { HomeService } from './home.service';

@Controller('home')
export class HomeController {
  constructor(@Inject(HomeService) private readonly home: HomeService) {}

  @Get()
  get(): Promise<HomeResponse> {
    return this.home.get();
  }
}
