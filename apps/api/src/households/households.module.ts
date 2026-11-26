import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { ImagesModule } from '../images/images.module';
import { LocationsModule } from '../locations/locations.module';
import { SettingsModule } from '../settings/settings.module';
import { HouseholdsController } from './households.controller';
import { HouseholdsService } from './households.service';

@Module({
  imports: [CategoriesModule, ImagesModule, LocationsModule, SettingsModule],
  controllers: [HouseholdsController],
  providers: [HouseholdsService],
  exports: [HouseholdsService],
})
export class HouseholdsModule {}
