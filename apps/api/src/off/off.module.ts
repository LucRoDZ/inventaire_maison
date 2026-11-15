import { Module } from '@nestjs/common';
import { OffClient } from './off.client';

@Module({ providers: [OffClient], exports: [OffClient] })
export class OffModule {}
