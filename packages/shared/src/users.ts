import type { UserRole } from './auth';

/**
 * An account as the admin console sees it (admin only: a member never receives it, nor any
 * household). The password hash never leaves the API.
 */
export interface UserDto {
  id: number;
  username: string;
  role: UserRole;
  /** True once an admin deactivated the account (sign-in refused, history kept). */
  disabled: boolean;
  createdAt: string;
  household: { id: number; name: string };
}

/** Creation by the admin: an existing household, or a new one created with the account. */
export type UserCreateInput = {
  username: string;
  password: string;
  role: UserRole;
} & ({ householdId: number } | { newHouseholdName: string });
