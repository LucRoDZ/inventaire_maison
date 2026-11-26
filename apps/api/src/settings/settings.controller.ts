import { Controller, Get, Inject } from '@nestjs/common';
import type { SettingsDto } from '@inventaire/shared';
import { SettingsService } from './settings.service';

/** Settings of the household of the session, read by everyone. */
@Controller('settings')
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly settings: SettingsService) {}

  @Get()
  get(): Promise<SettingsDto> {
    return this.settings.get();
  }
}
