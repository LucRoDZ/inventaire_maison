import type { INestApplication } from '@nestjs/common';

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
}

/**
 * Every route registered by the controllers, as « METHOD /api/path » (path parameters as written
 * in the controllers, e.g. `/api/products/:id`). Read from the Express router, so that a new
 * controller route shows up here without anyone listing it by hand.
 */
export function listRoutes(app: INestApplication): string[] {
  const instance = app.getHttpAdapter().getInstance() as {
    router?: { stack: Layer[] };
    _router?: { stack: Layer[] };
  };
  const stack = (instance.router ?? instance._router)?.stack ?? [];
  const routes = new Set<string>();
  const walk = (layers: Layer[]) => {
    for (const layer of layers) {
      if (layer.route) {
        const methods = Object.entries(layer.route.methods).filter(([, on]) => on);
        // A route or middleware registered for every method (`@All`, `forRoutes`): one entry.
        if (methods.length > 10) {
          routes.add(`ALL ${layer.route.path}`);
          continue;
        }
        for (const [method] of methods) routes.add(`${method.toUpperCase()} ${layer.route.path}`);
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  walk(stack);
  return [...routes].sort();
}
