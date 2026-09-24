const { parsePaging, MAX_PAGE_SIZE } = require('../src/utils/pagination');

/**
 * Đọc page/limit cho các endpoint danh sách: chặn trên để một `?limit=` tuỳ ý
 * không kéo được cả collection, và không để page âm lọt xuống skip() của
 * MongoDB thành lỗi 500.
 */
describe('parsePaging — tham số phân trang của API danh sách', () => {
  it('dùng mặc định khi không có tham số', () => {
    expect(parsePaging({}, 12)).toEqual({ page: 1, limit: 12 });
  });

  it('giữ nguyên giá trị hợp lệ', () => {
    expect(parsePaging({ page: '3', limit: '20' }, 12)).toEqual({ page: 3, limit: 20 });
  });

  it('chặn limit ở mức tối đa', () => {
    expect(parsePaging({ limit: '100000' }, 12).limit).toBe(MAX_PAGE_SIZE);
  });

  it.each(['0', '-5', 'abc', ''])('limit "%s" quay về mặc định', (value) => {
    expect(parsePaging({ limit: value }, 20).limit).toBe(20);
  });

  it.each(['0', '-1', 'abc'])('page "%s" quay về trang 1 thay vì tạo skip âm', (value) => {
    expect(parsePaging({ page: value }, 12).page).toBe(1);
  });
});
