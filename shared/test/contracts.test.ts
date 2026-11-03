import { describe, expect, it } from 'vitest';
import {
  RAW_KEY_PATTERN,
  RawObjectMetadata,
  WorkflowInput,
  executionName,
  rawObjectKey,
} from '../src/events.js';
import { canTransition } from '../src/videoState.js';

const videoId = '6a78c10f1c4541ef615cf01d';
const ownerId = '6a78c10f1c4541ef615cf01e';

describe('raw object contract', () => {
  it('builds keys that match the pattern the pipeline accepts', () => {
    expect(rawObjectKey(videoId, 3)).toBe(`raw/${videoId}/3/source`);
    expect(RAW_KEY_PATTERN.test(rawObjectKey(videoId, 3))).toBe(true);
  });

  it('rejects keys outside the raw layout', () => {
    for (const key of [`videos/${videoId}/source`, `raw/${videoId}/source`, `raw/xyz/1/source`, `raw/${videoId}/0x/source`]) {
      expect(RAW_KEY_PATTERN.test(key)).toBe(false);
    }
  });

  it('reads metadata as S3 returns it, coercing the version', () => {
    const parsed = RawObjectMetadata.parse({ 'video-id': videoId, 'upload-version': '2', 'owner-id': ownerId });
    expect(parsed['upload-version']).toBe(2);
  });

  it('rejects metadata with a missing or malformed id', () => {
    expect(RawObjectMetadata.safeParse({ 'video-id': 'abc', 'upload-version': '1', 'owner-id': ownerId }).success).toBe(false);
    expect(RawObjectMetadata.safeParse({ 'upload-version': '1', 'owner-id': ownerId }).success).toBe(false);
    expect(RawObjectMetadata.safeParse({ 'video-id': videoId, 'upload-version': '0', 'owner-id': ownerId }).success).toBe(false);
  });

  it('accepts a complete workflow input and refuses a foreign key', () => {
    const input = { videoId, uploadVersion: 1, ownerId, bucket: 'zelos-prod-raw', key: rawObjectKey(videoId, 1), sizeBytes: 10 };
    expect(WorkflowInput.parse(input)).toEqual(input);
    expect(WorkflowInput.safeParse({ ...input, key: 'other/file.mp4' }).success).toBe(false);
  });

  it('names one execution per upload version', () => {
    expect(executionName(videoId, 1)).toBe(`${videoId}-1`);
    expect(executionName(videoId, 1)).not.toBe(executionName(videoId, 2));
  });
});

describe('video status transitions', () => {
  it('allows the normal path and retries', () => {
    expect(canTransition('UPLOADING', 'PROCESSING')).toBe(true);
    expect(canTransition('PROCESSING', 'READY')).toBe(true);
    expect(canTransition('PROCESSING', 'SCHEDULED')).toBe(true);
    expect(canTransition('SCHEDULED', 'READY')).toBe(true);
    expect(canTransition('ERROR', 'PROCESSING')).toBe(true);
  });

  it('refuses skipping processing or reviving a draft as ready', () => {
    expect(canTransition('UPLOADING', 'READY')).toBe(false);
    expect(canTransition('READY', 'UPLOADING')).toBe(false);
    expect(canTransition('ERROR', 'READY')).toBe(false);
  });
});
