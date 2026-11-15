import type { HomeResponse } from '@inventaire/shared';
import { apiFetch } from './api';

export const fetchHome = (): Promise<HomeResponse> => apiFetch<HomeResponse>('/home');
