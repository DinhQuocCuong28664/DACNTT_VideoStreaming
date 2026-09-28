const {
  viewDedupeCache,
  pruneViewCache,
  VIEW_DEDUPE_WINDOW_MS,
} = require('../src/services/videoService');

jest.mock('../src/models/Video');
jest.mock('../src/models/Comment');
jest.mock('../src/services/s3Service');

/**
 * Dọn bộ nhớ chống đếm trùng lượt xem trong thời gian tỉ lệ với số mục hết
 * hạn, không phải với cả Map.
 */
describe('pruneViewCache', () => {
  const NOW = 10 * VIEW_DEDUPE_WINDOW_MS;

  afterEach(() => {
    viewDedupeCache.clear();
  });

  it('xoá mọi mục hết hạn ở đầu và giữ các mục còn hạn', () => {
    viewDedupeCache.set('v1:ip:a', NOW - VIEW_DEDUPE_WINDOW_MS - 3);
    viewDedupeCache.set('v1:ip:b', NOW - VIEW_DEDUPE_WINDOW_MS - 1);
    viewDedupeCache.set('v2:ip:a', NOW - 1000);
    viewDedupeCache.set('v3:ip:c', NOW);

    pruneViewCache(NOW);

    expect([...viewDedupeCache.keys()]).toEqual(['v2:ip:a', 'v3:ip:c']);
  });

  it('dừng ở mục còn hạn đầu tiên thay vì duyệt cả Map', () => {
    for (let i = 0; i < 1000; i += 1) viewDedupeCache.set(`fresh:${i}`, NOW);

    const iterate = jest.spyOn(Map.prototype, Symbol.iterator);
    pruneViewCache(NOW);
    const entries = iterate.mock.results[0].value;
    iterate.mockRestore();

    // Iterator chỉ bị đọc đúng một lần (mục đầu tiên còn hạn) rồi dừng.
    expect(entries.next().value[0]).toBe('fresh:1');
    expect(viewDedupeCache.size).toBe(1000);
  });
});
