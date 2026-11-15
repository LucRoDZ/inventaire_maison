export type UserRole = 'admin' | 'member';

export interface AuthUser {
  id: number;
  username: string;
  role: UserRole;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export const SESSION_COOKIE_NAME = 'inv_session';
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
/** Usernames (decision M6): 3 to 30 characters among a-z, 0-9, '_', '.', '-', stored in lowercase. */
export const USERNAME_PATTERN = /^[a-z0-9_.-]{3,30}$/;
