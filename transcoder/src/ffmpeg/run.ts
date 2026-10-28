/**
 * Runs ffmpeg or ffprobe. Keeps only the tail of stderr (a long job must not hold megabytes of
 * warnings), reports kills by signal (Spot reclaim, out of memory) as such, and parses the
 * `-progress pipe:1` stream into encoded seconds.
 */
import { spawn } from 'node:child_process';

const STDERR_TAIL = 4000;

export class ProcessError extends Error {
  constructor(message: string, readonly code: number | null, readonly signal: NodeJS.Signals | null, readonly stderrTail: string) {
    super(message);
    this.name = 'ProcessError';
  }
}

export interface RunOptions {
  /** Called with the encoded position in seconds as ffmpeg reports progress. */
  onProgress?: (encodedSec: number) => void;
  /** Return an error to stop the process; it is then rejected with that error. */
  shouldStop?: () => Error | null;
  /** Collect stdout (for ffprobe JSON). Progress parsing is skipped when set. */
  captureStdout?: boolean;
}

export function runProcess(command: string, args: readonly string[], options: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    let pending = '';
    let stopError: Error | null = null;

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL);
    });

    proc.stdout.on('data', (chunk: Buffer) => {
      if (options.captureStdout) {
        stdout += chunk.toString();
        return;
      }
      pending += chunk.toString();
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        // out_time_us is microseconds despite older ffmpeg naming it out_time_ms.
        const match = /^out_time_(?:us|ms)=(\d+)$/.exec(line.trim());
        if (match) options.onProgress?.(Number(match[1]) / 1e6);
      }
      const stop = options.shouldStop?.();
      if (stop && !stopError) {
        stopError = stop;
        proc.kill('SIGKILL');
      }
    });

    proc.on('error', (err) => reject(err));
    proc.on('close', (code, signal) => {
      if (stopError) return reject(stopError);
      if (code === 0) return resolve(stdout);
      const reason = signal ? `killed by ${signal}` : `exited with code ${code}`;
      reject(new ProcessError(`${command} ${reason}: ${stderr.trim().split('\n').slice(-5).join(' | ')}`, code, signal, stderr));
    });
  });
}
