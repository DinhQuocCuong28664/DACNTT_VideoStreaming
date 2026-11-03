/**
 * Moderation label policy shared by the video `analyse` job and the API's image screening
 * (avatars, banners, custom thumbnails). Labels follow the Amazon Rekognition moderation
 * taxonomy (v7): a label is matched by its own name, else by its parent's name.
 */
import type { ModerationStatus } from '../videoState.js';

export type LabelAction = 'block' | 'review' | 'ignore';

const LABEL_POLICY: ReadonlyMap<string, LabelAction> = new Map<string, LabelAction>([
  ['Explicit', 'block'],
  ['Explicit Nudity', 'block'],
  ['Explicit Sexual Activity', 'block'],
  ['Sex Toys', 'block'],
  ['Non-Explicit Nudity', 'review'],
  ['Obstructed Intimate Parts', 'review'],
  ['Bare Back', 'ignore'],
  ['Exposed Male Nipple', 'ignore'],
  ['Violence', 'review'],
  ['Graphic Violence', 'block'],
  ['Explosions and Blasts', 'review'],
  ['Weapons', 'ignore'],
  ['Visually Disturbing', 'review'],
  ['Death and Emaciation', 'block'],
  ['Crashes', 'review'],
  ['Hate Symbols', 'block'],
  ['Nazi Party', 'block'],
  ['White Supremacy', 'block'],
  ['Extremist', 'block'],
]);

/** In animation or illustration these block-level labels only go to human review. */
const FICTION_DOWNGRADABLE = new Set(['Graphic Violence', 'Death and Emaciation']);
const FICTION_CONTENT_TYPES = new Set(['Animated', 'Illustrated']);
const FICTION_MIN_CONFIDENCE = 80;
const MAX_EVIDENCE_LABELS = 12;

/** Labels of the Violence branch that turn on the viewer warning. */
const VIOLENCE_NODES = new Set(['Violence', 'Graphic Violence']);

export interface RekognitionLabel {
  Name?: string;
  ParentName?: string;
  Confidence?: number;
}

export interface RekognitionContentType {
  Name?: string;
  Confidence?: number;
}

export interface FrameAnalysis {
  /** Position in the video, seconds. */
  timestamp: number;
  labels: RekognitionLabel[];
  contentTypes?: RekognitionContentType[];
}

export interface EvidenceLabel {
  name: string;
  parentName: string;
  confidence: number;
  action: Exclude<LabelAction, 'ignore'>;
  timestamp: number;
  frames: number;
}

function resolve(label: RekognitionLabel): { action: LabelAction; key: string | null } {
  const own = label.Name ? LABEL_POLICY.get(label.Name) : undefined;
  if (own) return { action: own, key: label.Name ?? null };
  const parent = label.ParentName ? LABEL_POLICY.get(label.ParentName) : undefined;
  if (parent) return { action: parent, key: label.ParentName ?? null };
  return { action: 'ignore', key: null };
}

const isFictional = (types: readonly RekognitionContentType[] = []): boolean =>
  types.some((t) => !!t.Name && FICTION_CONTENT_TYPES.has(t.Name) && Number(t.Confidence) >= FICTION_MIN_CONFIDENCE);

/**
 * Labels of one frame that matter under the policy. A parent whose children are all ignored
 * (for example a bare male chest under Non-Explicit Nudity) is dropped, and a top-level label is
 * dropped when a more specific child already reports it.
 */
export function relevantLabels(frame: FrameAnalysis): Omit<EvidenceLabel, 'timestamp' | 'frames'>[] {
  const fictional = isFictional(frame.contentTypes);
  const out: Omit<EvidenceLabel, 'timestamp' | 'frames'>[] = [];
  for (const label of frame.labels) {
    const { action, key } = resolve(label);
    if (action === 'ignore' || !label.Name) continue;
    const children = frame.labels.filter((l) => l.ParentName === label.Name);
    const notable = children.filter((c) => resolve(c).action !== 'ignore');
    if (children.length > 0 && notable.length === 0) continue;
    if (!label.ParentName && notable.length > 0) continue;
    const finalAction = action === 'block' && fictional && key !== null && FICTION_DOWNGRADABLE.has(key) ? 'review' : action;
    out.push({ name: label.Name, parentName: label.ParentName ?? '', confidence: Number(label.Confidence) || 0, action: finalAction });
  }
  return out;
}

export interface SampleSettings {
  /** Seconds between sampled frames. */
  interval: number;
  /** Cost cap: the interval widens for long videos. */
  maxFrames: number;
}

export const DEFAULT_SAMPLE_SETTINGS: SampleSettings = { interval: 5, maxFrames: 120 };

/** Frame timestamps at the middle of equal slices, avoiding black first frames and end cards. */
export function buildSamplePlan(durationSec: number | null, settings: SampleSettings = DEFAULT_SAMPLE_SETTINGS): number[] {
  if (!durationSec || !(durationSec > 0)) return [0];
  const count = Math.min(Math.max(Math.ceil(durationSec / settings.interval), 1), settings.maxFrames);
  const step = durationSec / count;
  return Array.from({ length: count }, (_, i) => Math.round((i + 0.5) * step * 1000) / 1000);
}

export interface Thresholds {
  /** Below this a label is noise (AWS advises against values under 50). */
  reviewConfidence: number;
  /** At or above this a block-level label removes the video without waiting for a human. */
  blockConfidence: number;
  /** Share of planned frames that must be analysed before a video may go public unreviewed. */
  minCoverage: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { reviewConfidence: 60, blockConfidence: 90, minCoverage: 0.8 };

export interface ModerationVerdict {
  status: Exclude<ModerationStatus, 'pending'>;
  labels: EvidenceLabel[];
  maxConfidence: number;
  framesAnalyzed: number;
  framesPlanned: number;
  hasViolence: boolean;
  error: string | null;
}

export function evaluateFrames(frames: readonly FrameAnalysis[], framesPlanned: number, t: Thresholds = DEFAULT_THRESHOLDS): ModerationVerdict {
  const byName = new Map<string, EvidenceLabel>();
  const rank = (a: string): number => (a === 'block' ? 2 : 1);
  for (const frame of frames) {
    for (const label of relevantLabels(frame)) {
      if (label.confidence < t.reviewConfidence) continue;
      const prev = byName.get(label.name);
      if (!prev) {
        byName.set(label.name, { ...label, timestamp: frame.timestamp, frames: 1 });
        continue;
      }
      prev.frames += 1;
      if (rank(label.action) > rank(prev.action)) prev.action = label.action;
      if (label.confidence > prev.confidence) {
        prev.confidence = label.confidence;
        prev.timestamp = frame.timestamp;
      }
    }
  }

  const labels = [...byName.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_EVIDENCE_LABELS)
    .map((l) => ({ ...l, confidence: Math.round(l.confidence * 10) / 10 }));
  const framesAnalyzed = frames.length;
  const coverage = framesPlanned > 0 ? framesAnalyzed / framesPlanned : 0;

  let status: ModerationVerdict['status'] = 'approved';
  let error: string | null = null;
  if (labels.some((l) => l.action === 'block' && l.confidence >= t.blockConfidence)) {
    status = 'removed';
  } else if (framesAnalyzed === 0) {
    status = 'review';
    error = 'no frame could be analysed';
  } else if (labels.length > 0) {
    status = 'review';
  } else if (coverage < t.minCoverage) {
    status = 'review';
    error = `only ${framesAnalyzed}/${framesPlanned} frames could be analysed`;
  }

  return {
    status,
    labels,
    maxConfidence: labels.at(0)?.confidence ?? 0,
    framesAnalyzed,
    framesPlanned,
    hasViolence: labels.some((l) => VIOLENCE_NODES.has(l.name) || VIOLENCE_NODES.has(l.parentName)),
    error,
  };
}

/** Screening of a single image (avatar, banner, custom thumbnail): any review label refuses it. */
export function screenImage(frame: Omit<FrameAnalysis, 'timestamp'>, t: Thresholds = DEFAULT_THRESHOLDS): { allowed: boolean; labels: string[] } {
  const hits = relevantLabels({ ...frame, timestamp: 0 }).filter((l) => l.confidence >= t.reviewConfidence);
  return { allowed: hits.length === 0, labels: hits.map((l) => l.name) };
}
