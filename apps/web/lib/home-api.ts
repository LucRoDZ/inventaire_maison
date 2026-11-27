import type { HomeResponse } from '@inventaire/shared';
import { apiFetch } from './api';

/**
 * Last house read in this tab: the shelf focus page draws it at once, then refreshes. Emptied on
 * sign-in and sign-out (`clearAppCaches`), so another account never sees it.
 */
let lastHome: HomeResponse | null = null;

export const fetchHome = async (): Promise<HomeResponse> => {
  const home = await apiFetch<HomeResponse>('/home');
  lastHome = home;
  return home;
};

export const cachedHome = (): HomeResponse | null => lastHome;

export const forgetHome = (): void => {
  lastHome = null;
};
