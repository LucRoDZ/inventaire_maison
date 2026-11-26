import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type { PushPublicKeyDto, PushSubscriptionInput } from '@inventaire/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { parseBody } from '../common/validation';
import { PushService } from './push.service';

const endpoint = z.string().url().max(2048);
const subscribeSchema = z
  .object({
    endpoint,
    keys: z
      .object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(512) })
      .strict(),
  })
  .strict();
const unsubscribeSchema = z.object({ endpoint }).strict();

const INVALID = 'Abonnement invalide : adresse et clés requises';

@Controller('push')
export class PushController {
  constructor(@Inject(PushService) private readonly push: PushService) {}

  @Get('public-key')
  publicKey(): PushPublicKeyDto {
    return this.push.publicKey();
  }

  @Post('subscriptions')
  @HttpCode(204)
  async subscribe(@Body() body: unknown, @Req() req: Request): Promise<void> {
    const input: PushSubscriptionInput = parseBody(subscribeSchema, body, INVALID);
    await this.push.subscribe(req.user!.id, input);
  }

  @Delete('subscriptions')
  @HttpCode(204)
  async unsubscribe(@Body() body: unknown, @Req() req: Request): Promise<void> {
    const { endpoint: target } = parseBody(unsubscribeSchema, body, INVALID);
    await this.push.unsubscribe(req.user!.id, target);
  }
}
