/**
 * Cỡ task của job chunk đọc từ CHUNK_JOB_VCPU / CHUNK_JOB_MEMORY. Cặp sai không được làm hỏng video:
 * lỗi SubmitJob ở planner xảy ra sau khi video đã PROCESSING nên sẽ đánh ERROR mọi video dài.
 */

const loadConfig = (env) => {
  const saved = { ...process.env };
  delete process.env.CHUNK_JOB_VCPU;
  delete process.env.CHUNK_JOB_MEMORY;
  Object.assign(process.env, env);
  let loaded;
  jest.isolateModules(() => {
    loaded = require('../src/config');
  });
  process.env = saved;
  return loaded.chunked;
};

describe('cấu hình cỡ task của job chunk', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('không đặt thì tắt (0 = dùng cỡ của job definition)', () => {
    const c = loadConfig({});
    expect(c.chunkVcpu).toBe(0);
    expect(c.chunkMemoryMiB).toBe(0);
  });

  it('cặp hợp lệ được nhận', () => {
    const c = loadConfig({ CHUNK_JOB_VCPU: '4', CHUNK_JOB_MEMORY: '8192' });
    expect(c.chunkVcpu).toBe(4);
    expect(c.chunkMemoryMiB).toBe(8192);
  });

  it('cặp sai bị bỏ qua và có cảnh báo, không ném lỗi', () => {
    const c = loadConfig({ CHUNK_JOB_VCPU: '4', CHUNK_JOB_MEMORY: '2048' });
    expect(c.chunkVcpu).toBe(0);
    expect(c.chunkMemoryMiB).toBe(0);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('không phải cặp Fargate hợp lệ'));
  });

  it('chỉ đặt một trong hai cũng bị bỏ qua', () => {
    expect(loadConfig({ CHUNK_JOB_VCPU: '4' }).chunkVcpu).toBe(0);
    expect(loadConfig({ CHUNK_JOB_MEMORY: '8192' }).chunkVcpu).toBe(0);
  });
});
