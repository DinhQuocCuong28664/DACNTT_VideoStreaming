import type { Feature } from '../app.js';
import { authFeature } from './auth.js';
import { uploadsFeature } from './uploads.js';

/** Every feature module, in the order its routes are registered. */
export const FEATURES: readonly Feature[] = [authFeature, uploadsFeature];
