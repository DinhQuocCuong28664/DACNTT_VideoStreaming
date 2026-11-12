/**
 * Types and loader for the privacy policy and the terms of use (DRAFT, needs a legal review before
 * it is final). The text lives in src/i18n/locales/legal.{vi,en}.json. Every data item in the
 * privacy policy traces to code: api/src/model/user.ts (account fields), infra/modules/kv (watch
 * progress, notifications, rate limits, view marks), api/src/services/images.ts and the moderation
 * feature (Rekognition), api/src/auth/google.ts (Google sign-in), the SMTP settings in
 * api/src/config.ts (e-mail). Basis: Law 91/2025/QH15 and Decree 356/2025/ND-CP.
 * Items written as [FILL: ...] are facts the owners must supply; [CHECK: ...] must be confirmed.
 */
import vi from '../../i18n/locales/legal.vi.json';
import en from '../../i18n/locales/legal.en.json';

export type LegalLang = 'vi' | 'en';

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  items?: string[];
  table?: { head: string[]; rows: string[][] };
}

export interface LegalDoc {
  title: string;
  updated: string;
  draftNote: string;
  sections: LegalSection[];
}

interface LegalBundle { privacy: LegalDoc; terms: LegalDoc }

const BUNDLES: Record<LegalLang, LegalBundle> = { vi, en };

export const PRIVACY: Record<LegalLang, LegalDoc> = { vi: BUNDLES.vi.privacy, en: BUNDLES.en.privacy };
export const TERMS: Record<LegalLang, LegalDoc> = { vi: BUNDLES.vi.terms, en: BUNDLES.en.terms };
