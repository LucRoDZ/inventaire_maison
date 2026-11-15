import { Module } from '@nestjs/common';
import { MovementHistoryService } from './movement-history.service';
import { StockMoveService } from './stock-move.service';
import { StockRemoveService } from './stock-remove.service';
import { MovementsController, StockController } from './stock.controller';
import { StockQuery } from './stock.query';
import { StockService } from './stock.service';

@Module({
  controllers: [StockController, MovementsController],
  providers: [
    StockService,
    StockQuery,
    StockMoveService,
    StockRemoveService,
    MovementHistoryService,
  ],
  exports: [StockService, StockQuery],
})
export class StockModule {}
