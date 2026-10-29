import { statePath } from '../global-setup';

/** The 30-second clip processed in S1, present on staging. */
export const SAMPLE_VIDEO = process.env['E2E_SAMPLE_VIDEO'] ?? '6ae24dffdcb778e07c0d1acf';
export const asCreator = { storageState: statePath('creator') };
export const asViewer = { storageState: statePath('viewer') };
/** A unique marker so a run only touches what it created. */
export const runId = () => `e2e-${Date.now().toString(36)}`;
