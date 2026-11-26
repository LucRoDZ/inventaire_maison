import type { SettingsDto, SettingsPatchInput } from '@inventaire/shared';
import { apiFetch } from './api';

/** Settings of one household, for the admin console (the household is named in the URL). */
export interface SettingsApi {
  fetchSettings(): Promise<SettingsDto>;
  updateSettings(patch: SettingsPatchInput): Promise<SettingsDto>;
}

export const settingsApiFor = (householdId: number): SettingsApi => ({
  fetchSettings: () => apiFetch<SettingsDto>(`/admin/households/${householdId}/settings`),
  updateSettings: (patch) =>
    apiFetch<SettingsDto>(`/admin/households/${householdId}/settings`, {
      method: 'PATCH',
      body: patch,
    }),
});

/** Household of the session (any account): the threshold the counters and badges use. */
export const fetchOwnSettings = (): Promise<SettingsDto> => apiFetch<SettingsDto>('/settings');
