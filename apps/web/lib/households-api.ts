import type { HouseholdDto } from '@inventaire/shared';
import { apiFetch } from './api';

/** Admin console only: a member gets 404 on every one of these routes. */
export const fetchHouseholds = (): Promise<HouseholdDto[]> =>
  apiFetch<HouseholdDto[]>('/admin/households');

export const createHousehold = (name: string): Promise<{ id: number; name: string }> =>
  apiFetch('/admin/households', { method: 'POST', body: { name } });

export const renameHousehold = (id: number, name: string): Promise<{ id: number; name: string }> =>
  apiFetch(`/admin/households/${id}`, { method: 'PATCH', body: { name } });

/** `confirmName` repeats the name of the household (type-to-confirm, checked by the server too). */
export const deleteHousehold = (id: number, confirmName: string): Promise<void> =>
  apiFetch(`/admin/households/${id}`, { method: 'DELETE', body: { confirmName } });
