/**
 * Runtime switches of the platform, set by an administrator in the staff console and read by the
 * API, the workflow and the caption function. They live in one MongoDB document; without it, or
 * without a field, each switch takes the default that the infrastructure passes in the environment.
 * Processing containers never read it: the workflow hands them the value of the switch.
 */
export const SETTINGS_COLLECTION = 'settings';
export const SETTINGS_CHANGES_COLLECTION = 'settingsChanges';
export const SYSTEM_SETTINGS_ID = 'system';

export const SETTING_KEYS = ['moderationEnabled', 'autoCaptionsEnabled'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export interface SystemSettingsDoc {
  _id: typeof SYSTEM_SETTINGS_ID;
  moderationEnabled?: boolean;
  autoCaptionsEnabled?: boolean;
  updatedAt?: Date;
  updatedBy?: string;
}

/** Reads a 'true'/'false' environment value; anything else gives the fallback. */
export function envFlag(raw: string | undefined, fallback: boolean): boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

/** The stored switch wins; without one, the default of the infrastructure applies. */
export const effectiveSetting = (stored: boolean | null | undefined, fallback: boolean): boolean =>
  typeof stored === 'boolean' ? stored : fallback;
