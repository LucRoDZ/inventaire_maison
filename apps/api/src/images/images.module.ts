import { Module } from '@nestjs/common';
import { ImageStore } from './image-store.service';
import { ImagesController } from './images.controller';

@Module({ controllers: [ImagesController], providers: [ImageStore], exports: [ImageStore] })
export class ImagesModule {}
