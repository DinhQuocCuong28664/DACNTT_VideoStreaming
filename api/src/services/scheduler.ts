/**
 * One-time EventBridge Scheduler schedules for scheduled publishing (§4.4). The target is the
 * publish hook Lambda; the API never publishes on an HTTP request.
 */
import {
  ConflictException, CreateScheduleCommand, DeleteScheduleCommand, ResourceNotFoundException, SchedulerClient, UpdateScheduleCommand,
} from '@aws-sdk/client-scheduler';
import { HttpError } from '../http/errors.js';

export interface Scheduler {
  /** Creates or moves the schedule to fire once at `at`. */
  upsert(name: string, at: Date, payload: Record<string, unknown>): Promise<void>;
  /** Deletes the schedule; a missing one is fine. */
  remove(name: string): Promise<void>;
}

export interface SchedulerConfig { group: string; targetArn: string; roleArn: string }

/** at(yyyy-mm-ddThh:mm:ss) in UTC, the one-time expression format. */
export const atExpression = (d: Date) => `at(${d.toISOString().slice(0, 19)})`;

export function eventBridgeScheduler(cfg: SchedulerConfig | null, client = new SchedulerClient({})): Scheduler {
  const need = () => {
    if (!cfg) throw new HttpError(503, 'SCHEDULING_UNAVAILABLE', 'Scheduling is not configured');
    return cfg;
  };
  return {
    async upsert(name, at, payload) {
      const c = need();
      const input = {
        Name: name, GroupName: c.group,
        ScheduleExpression: atExpression(at), ScheduleExpressionTimezone: 'UTC',
        FlexibleTimeWindow: { Mode: 'OFF' as const },
        ActionAfterCompletion: 'DELETE' as const,
        Target: { Arn: c.targetArn, RoleArn: c.roleArn, Input: JSON.stringify(payload), RetryPolicy: { MaximumRetryAttempts: 5 } },
      };
      try {
        await client.send(new CreateScheduleCommand(input));
      } catch (err) {
        if (!(err instanceof ConflictException)) throw err;
        await client.send(new UpdateScheduleCommand(input));
      }
    },
    async remove(name) {
      const c = need();
      try {
        await client.send(new DeleteScheduleCommand({ Name: name, GroupName: c.group }));
      } catch (err) {
        if (!(err instanceof ResourceNotFoundException)) throw err;
      }
    },
  };
}

export function memoryScheduler() {
  const schedules = new Map<string, { at: Date; payload: Record<string, unknown> }>();
  const scheduler: Scheduler = {
    async upsert(name, at, payload) { schedules.set(name, { at, payload }); },
    async remove(name) { schedules.delete(name); },
  };
  return { scheduler, schedules };
}
