import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database.module';
import { SeedService } from './seed.service';

@Module({ imports: [DatabaseModule], providers: [SeedService], exports: [SeedService] })
export class SeedModule {}
