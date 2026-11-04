import { describe, expect, it } from 'vitest';
import { isMaintenanceEvent } from '../src/maintenance.js';

describe('isMaintenanceEvent', () => {
  it('accepts the direct invocation payload', () => {
    expect(isMaintenanceEvent({ action: 'ensure-indexes' })).toBe(true);
  });

  it('refuses anything that came through the Function URL', () => {
    const urlEvent = { version: '2.0', rawPath: '/v1/health', headers: {}, requestContext: { http: { method: 'POST' } }, body: '{"action":"ensure-indexes"}' };
    expect(isMaintenanceEvent(urlEvent)).toBe(false);
    expect(isMaintenanceEvent({ action: 'ensure-indexes', requestContext: {} })).toBe(false);
    expect(isMaintenanceEvent({ action: 'ensure-indexes', headers: {} })).toBe(false);
  });

  it('refuses other actions and non-objects', () => {
    expect(isMaintenanceEvent({ action: 'drop-database' })).toBe(false);
    expect(isMaintenanceEvent(null)).toBe(false);
    expect(isMaintenanceEvent('ensure-indexes')).toBe(false);
  });
});
