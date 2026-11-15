import { Module } from '@nestjs/common';
import { ImageStore } from './image-store.service';
import { ImagesController } from './images.controller';
import { RemoteImageService } from './remote-image.service';

@Module({
  controllers: [ImagesController],
  providers: [ImageStore, RemoteImageService],
  exports: [ImageStore, RemoteImageService],
})
export class ImagesModule {}
