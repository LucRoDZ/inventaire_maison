import { Global, Module } from '@nestjs/common';

export const CLOCK = Symbol('CLOCK');

export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

@Global()
@Module({
  providers: [{ provide: CLOCK, useClass: SystemClock }],
  exports: [CLOCK],
})
export class ClockModule {}
