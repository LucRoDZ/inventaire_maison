import type { LocationCreateInput, LocationDto, ShelfDto, ShelfKind } from '@inventaire/shared';
import { apiFetch } from './api';

export const fetchLocations = (): Promise<LocationDto[]> => apiFetch<LocationDto[]>('/locations');

export const updateLocation = (
  id: number,
  patch: { name?: string; icon?: string; sortOrder?: number },
): Promise<LocationDto> =>
  apiFetch<LocationDto>(`/locations/${id}`, { method: 'PATCH', body: patch });

export const createShelf = (input: {
  locationId: number;
  name: string;
  kind: ShelfKind;
}): Promise<ShelfDto> => apiFetch<ShelfDto>('/shelves', { method: 'POST', body: input });

export const updateShelf = (
  id: number,
  patch: { name?: string; kind?: ShelfKind; sortOrder?: number },
): Promise<ShelfDto> => apiFetch<ShelfDto>(`/shelves/${id}`, { method: 'PATCH', body: patch });

export const deleteShelf = (id: number): Promise<void> =>
  apiFetch(`/shelves/${id}`, { method: 'DELETE' });

export const createLocation = (input: LocationCreateInput): Promise<LocationDto> =>
  apiFetch<LocationDto>('/locations', { method: 'POST', body: input });

/** `moveStockTo`: the piece of furniture whose « Non rangé » tray receives the stock, if any. */
export const deleteLocation = (id: number, moveStockTo?: number): Promise<void> =>
  apiFetch(`/locations/${id}${moveStockTo === undefined ? '' : `?moveStockTo=${moveStockTo}`}`, {
    method: 'DELETE',
  });
