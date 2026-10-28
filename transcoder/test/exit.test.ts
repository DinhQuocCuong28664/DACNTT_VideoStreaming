import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { EXIT_NON_RETRYABLE, EXIT_RETRYABLE, NonRetryableError } from '@zelos/shared';
import { exitCodeFor } from '../src/exit.js';
import { EncodeTooSlowError } from '../src/ffmpeg/guard.js';
import { ProcessError } from '../src/ffmpeg/run.js';

describe('exitCodeFor', () => {
  it('stops Batch from retrying errors that would fail again', () => {
    expect(exitCodeFor(new NonRetryableError('plan mismatch'))).toBe(EXIT_NON_RETRYABLE);
    expect(exitCodeFor(new EncodeTooSlowError(9000, 3600))).toBe(EXIT_NON_RETRYABLE);
    expect(exitCodeFor(z.object({ a: z.string() }).safeParse({}).error)).toBe(EXIT_NON_RETRYABLE);
  });

  it('lets Batch retry kills, network and AWS errors', () => {
    expect(exitCodeFor(new ProcessError('ffmpeg killed by SIGKILL', null, 'SIGKILL', ''))).toBe(EXIT_RETRYABLE);
    expect(exitCodeFor(new Error('socket hang up'))).toBe(EXIT_RETRYABLE);
    expect(exitCodeFor('weird')).toBe(EXIT_RETRYABLE);
  });
});
