import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({ imports: [StockModule], controllers: [HomeController], providers: [HomeService] })
export class HomeModule {}
