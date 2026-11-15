import type { UserRole } from './auth';

/** A member as the administration screen sees it; the password hash never leaves the API. */
export interface UserDto {
  id: number;
  username: string;
  role: UserRole;
  /** True once an admin deactivated the account (sign-in refused, history kept). */
  disabled: boolean;
  createdAt: string;
}
