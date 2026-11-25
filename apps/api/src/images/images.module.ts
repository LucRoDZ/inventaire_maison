import { Module } from '@nestjs/common';
import { ImageStore } from './image-store.service';
import { ImagesController, ProductImagesService } from './images.controller';
import { RemoteImageService } from './remote-image.service';

@Module({
  controllers: [ImagesController],
  providers: [ImageStore, RemoteImageService, ProductImagesService],
  exports: [ImageStore, RemoteImageService],
})
export class ImagesModule {}
