/** One error shape for every response: { error: { code, message, details? } }. */
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new HttpError(400, code, message, details);
export const unauthorized = (message = 'Sign in to continue') => new HttpError(401, 'UNAUTHORIZED', message);
export const forbidden = (code = 'FORBIDDEN', message = 'You may not do this') => new HttpError(403, code, message);
export const notFound = (what = 'Resource') => new HttpError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);
export const tooMany = (retryAfterSec: number) =>
  new HttpError(429, 'RATE_LIMITED', 'Too many requests, try again later', { retryAfterSec });

export const notFoundHandler: RequestHandler = (_req, _res, next) => next(notFound('Route'));

/** Logs unexpected errors once, never leaks their message to the client. */
export const errorHandler = (log: (entry: Record<string, unknown>) => void): ErrorRequestHandler =>
  (err, req, res, _next) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'Some fields are invalid', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } });
      return;
    }
    if (err instanceof HttpError) {
      if (err.status === 429 && typeof err.details === 'object' && err.details && 'retryAfterSec' in err.details) {
        res.setHeader('Retry-After', String((err.details as { retryAfterSec: number }).retryAfterSec));
      }
      res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.details === undefined ? {} : { details: err.details }) } });
      return;
    }
    // Body parser errors carry a status and type.
    const status = (err as { status?: number }).status;
    if (status === 400 || status === 413) {
      res.status(status).json({ error: { code: status === 413 ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST', message: 'The request body is invalid or too large' } });
      return;
    }
    log({ level: 'error', msg: 'unhandled error', method: req.method, path: req.path, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err), stack: err instanceof Error ? err.stack : undefined });
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
  };
