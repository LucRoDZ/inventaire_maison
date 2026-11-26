import { Controller, Get, Inject } from '@nestjs/common';
import type { StatsDto } from '@inventaire/shared';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(@Inject(StatsService) private readonly stats: StatsService) {}

  @Get()
  get(): Promise<StatsDto> {
    return this.stats.get();
  }
}
