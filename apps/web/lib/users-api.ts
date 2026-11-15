import type { UserDto, UserRole } from '@inventaire/shared';
import { apiFetch } from './api';

export const fetchUsers = (): Promise<UserDto[]> => apiFetch<UserDto[]>('/users');

export const createUser = (input: {
  username: string;
  password: string;
  role: UserRole;
}): Promise<UserDto> => apiFetch<UserDto>('/users', { method: 'POST', body: input });

export const resetUserPassword = (id: number, password: string): Promise<UserDto> =>
  apiFetch<UserDto>(`/users/${id}`, { method: 'PATCH', body: { password } });

export const reactivateUser = (id: number): Promise<UserDto> =>
  apiFetch<UserDto>(`/users/${id}`, { method: 'PATCH', body: { disabled: false } });

export const deactivateUser = (id: number): Promise<void> =>
  apiFetch(`/users/${id}`, { method: 'DELETE' });
