/** Maps a job failure to the exit code that tells Batch whether to try again. */
import { EXIT_NON_RETRYABLE, EXIT_RETRYABLE, NonRetryableError } from '@zelos/shared';

export function exitCodeFor(err: unknown): number {
  if (err instanceof NonRetryableError) return EXIT_NON_RETRYABLE;
  // Invalid environment or plan JSON: the same input fails the same way next time.
  if (err instanceof Error && err.name === 'ZodError') return EXIT_NON_RETRYABLE;
  return EXIT_RETRYABLE;
}
