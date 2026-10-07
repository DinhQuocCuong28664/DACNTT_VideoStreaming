const { buildSubmitInput, createBatchSubmitter, safeJobName, MAX_DEPENDENCIES } = require('../src/chunked/batch');
const { runFfmpegProcess, withAttempts, STDERR_TAIL_CHARS } = require('../src/chunked/run');
const { EventEmitter } = require('events');

/**
 * Nộp job con vào AWS Batch và chạy ffmpeg cho job con. Hai lớp này chạm tài nguyên ngoài nên
 * được kiểm bằng đối tượng giả; điều cần chứng minh là hình dạng đầu vào Batch và cách xử lý lỗi.
 */

const base = {
  jobQueue: 'dacntt-dev-transcode-queue',
  jobDefinition: 'dacntt-dev-transcoder-job',
  name: 'chunks-6a78c10f1c4541ef615cf01d',
  command: ['node', 'src/index.js', 'chunk'],
};

describe('buildSubmitInput', () => {
  it('dùng chung MỘT job definition và chỉ đổi command qua containerOverrides', () => {
    const input = buildSubmitInput({ ...base, environment: { VIDEO_ID: 'v1', RAW_S3_KEY: 'videos/u/v1/a b.mp4' } });
    expect(input).toEqual({
      jobName: 'chunks-6a78c10f1c4541ef615cf01d',
      jobQueue: 'dacntt-dev-transcode-queue',
      jobDefinition: 'dacntt-dev-transcoder-job',
      containerOverrides: {
        command: ['node', 'src/index.js', 'chunk'],
        environment: [
          { name: 'VIDEO_ID', value: 'v1' },
          { name: 'RAW_S3_KEY', value: 'videos/u/v1/a b.mp4' },
        ],
      },
    });
  });

  it('biến môi trường luôn là chuỗi (Batch từ chối số)', () => {
    const input = buildSubmitInput({ ...base, environment: { AUDIO_BITRATE: '64k', N: 3 } });
    expect(input.containerOverrides.environment).toEqual([
      { name: 'AUDIO_BITRATE', value: '64k' },
      { name: 'N', value: '3' },
    ]);
  });

  it('array job: arrayProperties.size và phụ thuộc vào các job âm thanh', () => {
    const input = buildSubmitInput({ ...base, arraySize: 48, dependsOn: ['job-a', 'job-b'] });
    expect(input.arrayProperties).toEqual({ size: 48 });
    expect(input.dependsOn).toEqual([{ jobId: 'job-a' }, { jobId: 'job-b' }]);
  });

  it('không thêm dependsOn/arrayProperties/timeout khi không cần', () => {
    const input = buildSubmitInput(base);
    expect(input).not.toHaveProperty('dependsOn');
    expect(input).not.toHaveProperty('arrayProperties');
    expect(input).not.toHaveProperty('timeout');
  });

  it('ghi đè chiến lược thử lại: thử lại vô điều kiện, không dựa vào lý do trạng thái', () => {
    const input = buildSubmitInput({ ...base, retryAttempts: 3 });
    expect(input.retryStrategy).toEqual({ attempts: 3 });
    expect(input.retryStrategy).not.toHaveProperty('evaluateOnExit');
    expect(buildSubmitInput(base)).not.toHaveProperty('retryStrategy');
  });

  it('ghi đè timeout theo job', () => {
    expect(buildSubmitInput({ ...base, timeoutSeconds: 21600 }).timeout).toEqual({ attemptDurationSeconds: 21600 });
  });

  it('tên job chỉ gồm ký tự hợp lệ và không quá 128 ký tự', () => {
    expect(safeJobName('audio 64k/vid.eo')).toBe('audio-64k-vid-eo');
    expect(safeJobName('x'.repeat(300))).toHaveLength(128);
    expect(buildSubmitInput({ ...base, name: 'a b' }).jobName).toBe('a-b');
  });

  it('từ chối cấu hình thiếu thay vì gửi một yêu cầu sẽ thất bại muộn', () => {
    expect(() => buildSubmitInput({ ...base, jobQueue: '' })).toThrow(/BATCH_JOB_QUEUE/);
    expect(() => buildSubmitInput({ ...base, jobDefinition: '' })).toThrow(/BATCH_JOB_DEFINITION/);
    expect(() => buildSubmitInput({ ...base, command: [] })).toThrow(/command/);
  });

  it('array job cần 2-10.000 phần tử', () => {
    for (const bad of [1, 0, 10001, 2.5, -3]) {
      expect(() => buildSubmitInput({ ...base, arraySize: bad })).toThrow(/Array job/);
    }
    expect(() => buildSubmitInput({ ...base, arraySize: 2 })).not.toThrow();
    expect(() => buildSubmitInput({ ...base, arraySize: 10000 })).not.toThrow();
  });

  it('một job phụ thuộc tối đa 20 job khác', () => {
    const ids = Array.from({ length: MAX_DEPENDENCIES + 1 }, (_, i) => `job-${i}`);
    expect(() => buildSubmitInput({ ...base, dependsOn: ids })).toThrow(/tối đa 20/);
    expect(() => buildSubmitInput({ ...base, dependsOn: ids.slice(0, MAX_DEPENDENCIES) })).not.toThrow();
  });
});

describe('createBatchSubmitter', () => {
  it('gửi SubmitJob với đầu vào đã dựng và trả về jobId', async () => {
    const sent = [];
    const client = {
      send: async (command) => {
        sent.push(command.input);
        return { jobId: 'abc-123' };
      },
    };
    const submit = createBatchSubmitter({ jobQueue: base.jobQueue, jobDefinition: base.jobDefinition, client });

    const jobId = await submit({ name: base.name, command: base.command, arraySize: 4 });

    expect(jobId).toBe('abc-123');
    expect(sent[0]).toMatchObject({ jobName: base.name, jobQueue: base.jobQueue, arrayProperties: { size: 4 } });
  });

  it('lỗi từ Batch được ném nguyên vẹn để planner đánh ERROR', async () => {
    const client = { send: async () => Promise.reject(new Error('AccessDeniedException')) };
    const submit = createBatchSubmitter({ jobQueue: base.jobQueue, jobDefinition: base.jobDefinition, client });
    await expect(submit({ name: 'x', command: ['node'] })).rejects.toThrow('AccessDeniedException');
  });
});

describe('withAttempts', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('chạy một lần khi thành công, trả về kết quả', async () => {
    const attempt = jest.fn(async () => 'ok');
    expect(await withAttempts(3, 'x', attempt)).toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('thử lại tới khi thành công và truyền số lần thử cho nơi gọi', async () => {
    const attempt = jest.fn(async (n) => {
      if (n < 3) throw new Error(`lỗi ${n}`);
      return `xong ở lần ${n}`;
    });
    expect(await withAttempts(3, 'x', attempt)).toBe('xong ở lần 3');
    expect(attempt.mock.calls.map(([n]) => n)).toEqual([1, 2, 3]);
  });

  it('hết số lần thì ném lỗi của lần CUỐI, không phải lần đầu', async () => {
    const attempt = jest.fn(async (n) => {
      throw new Error(`lỗi ${n}`);
    });
    await expect(withAttempts(2, 'x', attempt)).rejects.toThrow('lỗi 2');
    expect(attempt).toHaveBeenCalledTimes(2);
  });
});

describe('runFfmpegProcess', () => {
  /** spawn giả: trả về tiến trình có stderr và cho phép điều khiển thời điểm đóng. */
  const fakeSpawn = () => {
    const proc = new EventEmitter();
    proc.stderr = new EventEmitter();
    const spawnFn = jest.fn(() => proc);
    return { proc, spawnFn };
  };

  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('gọi ffmpeg với đúng đối số và không nối stdin/stdout', async () => {
    const { proc, spawnFn } = fakeSpawn();
    const pending = runFfmpegProcess({ args: ['-i', 'in.mp4'], label: 'chunk 1', spawnFn });
    proc.emit('close', 0, null);
    await pending;
    expect(spawnFn).toHaveBeenCalledWith('ffmpeg', ['-i', 'in.mp4'], { stdio: ['ignore', 'ignore', 'pipe'] });
  });

  it('mã thoát khác 0: lỗi mang theo phần đuôi stderr để biết ffmpeg phàn nàn gì', async () => {
    const { proc, spawnFn } = fakeSpawn();
    const pending = runFfmpegProcess({ args: [], label: 'chunk 7', spawnFn });
    proc.stderr.emit('data', Buffer.from('Server returned 403 Forbidden (access denied)\n'));
    proc.emit('close', 1, null);
    await expect(pending).rejects.toThrow(/chunk 7: ffmpeg mã thoát 1\nServer returned 403 Forbidden/);
  });

  it('bị tín hiệu giết (Spot thu hồi, OOM) thì nói rõ tín hiệu', async () => {
    const { proc, spawnFn } = fakeSpawn();
    const pending = runFfmpegProcess({ args: [], label: 'chunk 2', spawnFn });
    proc.emit('close', null, 'SIGKILL');
    await expect(pending).rejects.toThrow(/bị dừng bởi SIGKILL/);
  });

  it('chỉ giữ phần đuôi của stderr, không để một job dài ăn hết bộ nhớ', async () => {
    const { proc, spawnFn } = fakeSpawn();
    const pending = runFfmpegProcess({ args: [], label: 'x', spawnFn });
    proc.stderr.emit('data', Buffer.from('A'.repeat(50000)));
    proc.stderr.emit('data', Buffer.from('LỖI CUỐI'));
    proc.emit('close', 1, null);
    const error = await pending.catch((e) => e);
    expect(error.message.length).toBeLessThan(STDERR_TAIL_CHARS + 200);
    expect(error.message).toContain('LỖI CUỐI');
  });

  it('không chạy được ffmpeg (thiếu tệp thực thi) thì báo lỗi rõ ràng', async () => {
    const { proc, spawnFn } = fakeSpawn();
    const pending = runFfmpegProcess({ args: [], label: 'x', spawnFn });
    proc.emit('error', new Error('spawn ffmpeg ENOENT'));
    await expect(pending).rejects.toThrow(/không chạy được ffmpeg: spawn ffmpeg ENOENT/);
  });
});
