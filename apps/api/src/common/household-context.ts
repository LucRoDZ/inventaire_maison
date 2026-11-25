import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';

/** What one request knows about its household. Filled by SessionGuard, read by TenantDb. */
export interface RequestScope {
  householdId?: number;
}

/**
 * The household of the current request, carried by AsyncLocalStorage. Each request gets a fresh,
 * empty scope from the middleware below; SessionGuard writes the household of the signed-in
 * account into it. Code that runs outside a request (or before the guard) has no household, and
 * TenantDb then refuses to touch household data.
 */
@Injectable()
export class HouseholdContext {
  private readonly storage = new AsyncLocalStorage<RequestScope>();

  /** Opens the scope of one request, for the whole chain that serves it. */
  open(next: () => void): void {
    this.storage.run({}, next);
  }

  /** Runs `fn` with its own scope (scripts and tests; requests use the middleware). */
  run<T>(householdId: number | undefined, fn: () => T): T {
    return this.storage.run({ householdId }, fn);
  }

  set(householdId: number): void {
    const scope = this.storage.getStore();
    if (!scope) throw new Error('Aucun contexte de requête : le middleware de foyer manque');
    scope.householdId = householdId;
  }

  /** The household of the current request, or undefined. */
  current(): number | undefined {
    return this.storage.getStore()?.householdId;
  }
}

/**
 * One empty household scope per request, applied to every route by AppModule. A Nest middleware
 * runs after the body parser, so the scope covers the guards, the interceptors and the handler.
 */
@Injectable()
export class HouseholdScopeMiddleware implements NestMiddleware {
  constructor(@Inject(HouseholdContext) private readonly context: HouseholdContext) {}

  use(_req: unknown, _res: unknown, next: () => void): void {
    this.context.open(next);
  }
}
