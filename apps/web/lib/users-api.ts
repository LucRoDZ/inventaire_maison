import type { UserCreateInput, UserDto } from '@inventaire/shared';
import { apiFetch } from './api';

export const fetchUsers = (): Promise<UserDto[]> => apiFetch<UserDto[]>('/users');

/** In an existing household (`householdId`) or a new one created with it (`newHouseholdName`). */
export const createUser = (input: UserCreateInput): Promise<UserDto> =>
  apiFetch<UserDto>('/users', { method: 'POST', body: input });

/** The account then sees the inventory of that household; its sessions are cut. */
export const moveUser = (id: number, householdId: number): Promise<UserDto> =>
  apiFetch<UserDto>(`/users/${id}`, { method: 'PATCH', body: { householdId } });

export const resetUserPassword = (id: number, password: string): Promise<UserDto> =>
  apiFetch<UserDto>(`/users/${id}`, { method: 'PATCH', body: { password } });

export const reactivateUser = (id: number): Promise<UserDto> =>
  apiFetch<UserDto>(`/users/${id}`, { method: 'PATCH', body: { disabled: false } });

export const deactivateUser = (id: number): Promise<void> =>
  apiFetch(`/users/${id}`, { method: 'DELETE' });
