import type { UserRole } from '@inventaire/shared';

export interface RequestUser {
  id: number;
  username: string;
  role: UserRole;
  /** Never sent to the client (decision D2): used to bind the request to its household. */
  householdId: number;
  sessionId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: RequestUser;
  }
}
