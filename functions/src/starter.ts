/**
 * SQS consumer of raw-upload events. For each new object it reads the user metadata pinned by
 * the upload policy (never parses the key), validates it, and starts one workflow execution
 * named {videoId}-{uploadVersion}. A duplicate S3 event finds the name taken and starts nothing.
 * Failures are reported per message (partial batch response) so one bad record does not
 * redeliver the others.
 */
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ExecutionAlreadyExists, SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { RAW_KEY_PATTERN, RawObjectMetadata, WorkflowInput, executionName } from '@zelos/shared';
import { required } from './lib/s3.js';

interface SqsRecord {
  messageId: string;
  body: string;
}

interface S3EventRecord {
  eventName?: string;
  s3?: { bucket?: { name?: string }; object?: { key?: string; size?: number } };
}

export interface StarterDeps {
  headMetadata: (bucket: string, key: string) => Promise<Record<string, string>>;
  /** Returns false when an execution of that name already exists. */
  startExecution: (name: string, input: WorkflowInput) => Promise<boolean>;
  log: (entry: Record<string, unknown>) => void;
}

export interface BatchResponse {
  batchItemFailures: { itemIdentifier: string }[];
}

/** S3 URL-encodes keys in events, with '+' for spaces. */
const decodeKey = (key: string): string => decodeURIComponent(key.replace(/\+/g, ' '));

async function handleRecord(record: SqsRecord, deps: StarterDeps): Promise<void> {
  const body = JSON.parse(record.body) as { Records?: S3EventRecord[]; Event?: string };
  // S3 sends one test event when the notification is configured; nothing to do.
  if (body.Event === 's3:TestEvent') return;

  for (const r of body.Records ?? []) {
    const bucket = r.s3?.bucket?.name;
    const rawKey = r.s3?.object?.key;
    if (!bucket || !rawKey || !r.eventName?.startsWith('ObjectCreated')) continue;
    const key = decodeKey(rawKey);
    if (!RAW_KEY_PATTERN.test(key)) {
      deps.log({ level: 'warn', msg: 'ignored object outside the raw layout', key });
      continue;
    }

    const metadata = RawObjectMetadata.parse(await deps.headMetadata(bucket, key));
    const input = WorkflowInput.parse({
      videoId: metadata['video-id'],
      uploadVersion: metadata['upload-version'],
      ownerId: metadata['owner-id'],
      bucket,
      key,
      sizeBytes: r.s3?.object?.size ?? 0,
    });
    // The key and the metadata come from the same upload policy; disagreement means tampering.
    if (key !== `raw/${input.videoId}/${input.uploadVersion}/source`) {
      throw new Error(`metadata does not match the object key ${key}`);
    }

    const name = executionName(input.videoId, input.uploadVersion);
    const started = await deps.startExecution(name, input);
    deps.log({ level: 'info', msg: started ? 'workflow started' : 'duplicate event, workflow already exists', videoId: input.videoId, execution: name });
  }
}

export async function start(event: { Records?: SqsRecord[] }, deps: StarterDeps): Promise<BatchResponse> {
  const failures: { itemIdentifier: string }[] = [];
  for (const record of event.Records ?? []) {
    try {
      await handleRecord(record, deps);
    } catch (err) {
      deps.log({ level: 'error', msg: 'record failed', messageId: record.messageId, error: String(err) });
      failures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures: failures };
}

let deps: StarterDeps | undefined;

export const handler = async (event: { Records?: SqsRecord[] }): Promise<BatchResponse> => {
  if (!deps) {
    const s3 = new S3Client({});
    const sfn = new SFNClient({});
    const stateMachineArn = required('STATE_MACHINE_ARN');
    deps = {
      headMetadata: async (bucket, key) => (await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))).Metadata ?? {},
      startExecution: async (name, input) => {
        try {
          await sfn.send(new StartExecutionCommand({ stateMachineArn, name, input: JSON.stringify(input) }));
          return true;
        } catch (err) {
          if (err instanceof ExecutionAlreadyExists) return false;
          throw err;
        }
      },
      log: (entry) => console.log(JSON.stringify(entry)),
    };
  }
  return start(event, deps);
};
