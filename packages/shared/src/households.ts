import type { UserRole } from './auth';

/** Households (D1, D2): only the admin console ever sees them. */
export const HOUSEHOLD_NAME_MAX_LENGTH = 40;

/** D6: at most 12 pieces of furniture per household and 8 shelves or drawers per piece. */
export const MAX_LOCATIONS_PER_HOUSEHOLD = 12;
export const MAX_SHELVES_PER_LOCATION = 8;

export interface HouseholdMemberDto {
  id: number;
  username: string;
  role: UserRole;
  disabled: boolean;
}

export interface HouseholdDto {
  id: number;
  name: string;
  createdAt: string;
  members: HouseholdMemberDto[];
  /** Pieces of furniture: a count, never their content (the console does not read inventories). */
  locationCount: number;
  /** The household of the admin who asks (chosen by default in the console). */
  isOwn: boolean;
}
