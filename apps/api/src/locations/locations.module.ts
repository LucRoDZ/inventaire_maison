import { Module } from '@nestjs/common';
import { LocationsController, ShelvesController } from './locations.controller';
import { LocationsService } from './locations.service';

@Module({
  controllers: [LocationsController, ShelvesController],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
