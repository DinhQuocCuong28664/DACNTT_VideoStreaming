import type { TFunction } from 'i18next';
import { ApiError } from '../api/http';

/** Text for an error: a translation of the API code when there is one, else the API message. */
export function errorText(t: TFunction, err: unknown): string {
  if (err instanceof ApiError) {
    const key = `errors.${err.code}`;
    const translated = t(key);
    if (translated !== key) return translated;
    return err.message || t('errors.default');
  }
  return t('errors.default');
}

export const isApiError = (err: unknown, code?: string): err is ApiError =>
  err instanceof ApiError && (code === undefined || err.code === code);
