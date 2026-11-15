import { Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { StockQuery } from './stock.query';
import { StockService } from './stock.service';

@Module({
  controllers: [StockController],
  providers: [StockService, StockQuery],
  exports: [StockService],
})
export class StockModule {}
