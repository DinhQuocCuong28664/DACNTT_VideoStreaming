const { RekognitionClient, DetectModerationLabelsCommand } = require('@aws-sdk/client-rekognition');
const httpError = require('../utils/httpError');

/**
 * Screening of avatar images with Amazon Rekognition image moderation.
 *
 * An avatar is shown next to every comment and on the channel page, to
 * anyone, so the rule is stricter than for videos: any label that the video
 * policy would remove or hold for review, at AVATAR_MIN_CONFIDENCE or more,
 * refuses the image. Nothing waits for a person, because the owner can simply
 * pick another picture.
 *
 * LABEL_POLICY is the table of transcoder/src/moderation.js, kept identical by
 * tests/avatarModeration.test.js, so that both checks read the label taxonomy
 * the same way, including its rule that a parent label whose children are all
 * ignored is ignored too (a bare male chest is not nudity).
 *
 * The image is read from S3 by Rekognition (S3Object), which accepts JPEG and
 * PNG only, up to 15 MB and from 80 to 10,000 pixels per side. An image it
 * cannot read is refused like a violating one; a service error refuses the
 * change with 503 and keeps the old avatar, so an outage never lets an
 * unscreened picture through.
 */
const LABEL_POLICY = {
  // Explicit
  Explicit: 'block',
  'Explicit Nudity': 'block',
  'Explicit Sexual Activity': 'block',
  'Sex Toys': 'block',

  // Non-Explicit Nudity of Intimate parts and Kissing
  'Non-Explicit Nudity': 'review',
  'Obstructed Intimate Parts': 'review',
  'Bare Back': 'ignore',
  'Exposed Male Nipple': 'ignore',

  // Violence
  Violence: 'review',
  'Graphic Violence': 'block',
  'Explosions and Blasts': 'review',
  Weapons: 'ignore',

  // Visually Disturbing
  'Visually Disturbing': 'review',
  'Death and Emaciation': 'block',
  Crashes: 'review',

  // Hate Symbols
  'Hate Symbols': 'block',
  'Nazi Party': 'block',
  'White Supremacy': 'block',
  Extremist: 'block',
};

const AVATAR_MIN_CONFIDENCE = 60;

/** Rekognition errors that mean the file itself is not a usable image. */
const UNREADABLE_IMAGE_ERRORS = new Set([
  'InvalidImageFormatException',
  'ImageTooLargeException',
  'InvalidParameterException',
]);

let client;
const getClient = () => {
  if (!client) client = new RekognitionClient({ region: process.env.AWS_REGION });
  return client;
};

const isEnabled = () => process.env.AVATAR_MODERATION_ENABLED !== 'false';

const resolveAction = (label) => {
  if (Object.prototype.hasOwnProperty.call(LABEL_POLICY, label.Name)) return LABEL_POLICY[label.Name];
  if (label.ParentName && Object.prototype.hasOwnProperty.call(LABEL_POLICY, label.ParentName)) {
    return LABEL_POLICY[label.ParentName];
  }
  return 'ignore';
};

/**
 * The labels that refuse an avatar. A parent label is skipped when it has
 * children in the same response and every child is ignored, which is how the
 * finest level of the taxonomy excludes a concept.
 */
const violatingLabels = (labels = []) =>
  labels.filter((label) => {
    if (Number(label.Confidence) < AVATAR_MIN_CONFIDENCE) return false;
    if (resolveAction(label) === 'ignore') return false;
    const children = labels.filter((l) => l.ParentName === label.Name);
    if (children.length > 0 && children.every((c) => resolveAction(c) === 'ignore')) return false;
    return true;
  });

/**
 * Screens one uploaded avatar.
 * @returns {Promise<{ allowed: boolean, reason?: 'labels'|'unreadable', labels: string[] }>}
 */
const checkAvatar = async ({ bucket, key }) => {
  if (!isEnabled()) return { allowed: true, labels: [] };

  let response;
  try {
    response = await getClient().send(
      new DetectModerationLabelsCommand({
        Image: { S3Object: { Bucket: bucket, Name: key } },
        MinConfidence: AVATAR_MIN_CONFIDENCE,
      })
    );
  } catch (err) {
    if (err && UNREADABLE_IMAGE_ERRORS.has(err.name)) {
      return { allowed: false, reason: 'unreadable', labels: [] };
    }
    console.error(`Avatar screening failed for ${key}: ${err && err.name}: ${err && err.message}`);
    throw httpError.localized(503, 'avatar.checkUnavailable', 'AVATAR_CHECK_UNAVAILABLE');
  }

  const found = violatingLabels(response.ModerationLabels || []);
  if (found.length > 0) {
    return { allowed: false, reason: 'labels', labels: found.map((l) => l.Name) };
  }
  return { allowed: true, labels: [] };
};

/** Test hook: replace the Rekognition client. */
const setClientForTests = (fake) => {
  client = fake;
};

module.exports = {
  checkAvatar,
  violatingLabels,
  LABEL_POLICY,
  AVATAR_MIN_CONFIDENCE,
  setClientForTests,
};
