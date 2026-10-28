import type { Feature } from '../app.js';
import { authFeature } from './auth.js';
import { uploadsFeature } from './uploads.js';
import { videosFeature } from './videos.js';
import { communityFeature } from './community.js';
import { channelsFeature } from './channels.js';
import { libraryFeature } from './library.js';
import { studioFeature } from './studio.js';
import { moderationFeature } from './moderation.js';

/** Every feature module, in the order its routes are registered. */
export const FEATURES: readonly Feature[] = [authFeature, uploadsFeature, videosFeature, communityFeature, channelsFeature, libraryFeature, studioFeature, moderationFeature];
