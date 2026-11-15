import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Validates a request body; the message is shown to the user, so it stays generic. */
export function parseBody<T>(schema: ZodType<T>, body: unknown, message: string): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new BadRequestException(message);
  return parsed.data;
}

const MAX_INT4 = 2_147_483_647;

/** A path identifier: anything that is not a positive integer cannot exist, hence 404. */
export function parseId(raw: string): number {
  const id = /^\d{1,10}$/.test(raw) ? Number(raw) : 0;
  if (id < 1 || id > MAX_INT4) throw new NotFoundException();
  return id;
}
