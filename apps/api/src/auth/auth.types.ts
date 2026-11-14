import type { UserRole } from '@inventaire/shared';

export interface RequestUser {
  id: number;
  username: string;
  role: UserRole;
  sessionId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: RequestUser;
  }
}
