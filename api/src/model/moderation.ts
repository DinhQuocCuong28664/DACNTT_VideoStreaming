/**
 * Closed vocabularies of moderation. Short lists on purpose: overlapping options make people
 * pick at random and the data stops being countable (Crawford and Gillespie, 2016).
 */
export const REPORT_REASONS = ['sexual', 'violent', 'hateful', 'harassment', 'dangerous', 'child_abuse', 'spam', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const DECISIONS = ['approve', 'block'] as const;
export type Decision = (typeof DECISIONS)[number];

/** Reason codes an operator must give with each decision. */
export const DECISION_REASONS = {
  approve: ['model_error', 'fiction_or_game', 'news_or_education', 'acceptable_context', 'appeal_upheld', 'report_unfounded', 'other'],
  block: ['confirmed_violation', 'missed_by_model', 'report_upheld', 'audit_failed', 'policy_violation', 'other'],
} as const;
export type DecisionReason = (typeof DECISION_REASONS)[Decision][number];

export const MAX_REPORT_DETAILS = 500;
export const MAX_NOTE = 500;

/**
 * How a human decision compares with the machine verdict kept from before the override:
 * the inputs of the false-positive and false-negative rates.
 */
export type Outcome = 'false_positive' | 'flag_noise' | 'false_negative' | 'true_positive' | 'true_negative' | 'unclassified';

export function classifyOutcome(machine: 'approved' | 'review' | 'removed' | null, decision: Decision): Outcome {
  if (!machine) return 'unclassified';
  if (decision === 'approve') return machine === 'removed' ? 'false_positive' : machine === 'review' ? 'flag_noise' : 'true_negative';
  return machine === 'approved' ? 'false_negative' : 'true_positive';
}
