/**
 * Maintenance actions of the API function, run once per deploy instead of on every cold start.
 *
 * Index setup used to run in each new instance before its first request. When 80 instances
 * started at once (S5 upload burst, 2026-11-04) the free Atlas cluster answered "Too many
 * concurrent requests", start-up passed the 30 s timeout and 39 uploads got 502. Indexes only
 * change with a deploy, so scripts/ensure-indexes.sh invokes the function directly with
 * `{ "action": "ensure-indexes" }` after each apply.
 *
 * Only a direct invocation (lambda:InvokeFunction, an IAM permission) can carry that event: every
 * request through the Function URL arrives as an HTTP event with `requestContext.http`.
 */
export interface MaintenanceEvent { action: 'ensure-indexes' }

export function isMaintenanceEvent(event: unknown): event is MaintenanceEvent {
  if (typeof event !== 'object' || event === null) return false;
  const e = event as Record<string, unknown>;
  return e['action'] === 'ensure-indexes' && !('requestContext' in e) && !('rawPath' in e) && !('headers' in e);
}
