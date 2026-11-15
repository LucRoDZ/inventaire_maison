import { Module } from '@nestjs/common';
import { OffModule } from '../off/off.module';
import { ProductsModule } from '../products/products.module';
import { ScanController } from './scan.controller';
import { ScanService } from './scan.service';

@Module({
  imports: [OffModule, ProductsModule],
  controllers: [ScanController],
  providers: [ScanService],
})
export class ScanModule {}
