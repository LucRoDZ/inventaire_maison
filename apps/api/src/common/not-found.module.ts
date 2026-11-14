import { All, Controller, Module, NotFoundException } from '@nestjs/common';

@Controller()
class NotFoundController {
  @All('{*path}')
  notFound(): never {
    throw new NotFoundException();
  }
}

/**
 * Import it last: unknown routes then answer 401 without a session (global guard) and 404 with one.
 */
@Module({ controllers: [NotFoundController] })
export class NotFoundModule {}
