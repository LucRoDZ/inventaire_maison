import { Module } from '@nestjs/common';
import { ImagesModule } from '../images/images.module';
import { CategoryGuessService } from './category-guess.service';
import { OffClient } from './off.client';

@Module({
  imports: [ImagesModule],
  providers: [OffClient, CategoryGuessService],
  exports: [OffClient, CategoryGuessService, ImagesModule],
})
export class OffModule {}
