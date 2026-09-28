const { pickThumbnailTime } = require('../src/transcoder');

/**
 * Mốc lấy ảnh bìa phải nằm trong video.
 *
 * Bản cũ luôn lấy ở giây thứ 5; video ngắn hơn thì ffmpeg không ghi được
 * khung nào và video không có ảnh bìa dù DB vẫn trỏ tới thumbnail.jpg.
 */
describe('pickThumbnailTime', () => {
  it('giữ giây thứ 5 cho video đủ dài', () => {
    expect(pickThumbnailTime(120)).toBe(5);
    expect(pickThumbnailTime(10)).toBe(5);
  });

  it('lấy giữa video khi video ngắn hơn 10 giây', () => {
    expect(pickThumbnailTime(3)).toBe(1.5);
    expect(pickThumbnailTime(0.5)).toBe(0.25);
  });

  it('về 0 khi không đọc được thời lượng', () => {
    expect(pickThumbnailTime(0)).toBe(0);
    expect(pickThumbnailTime(NaN)).toBe(0);
    expect(pickThumbnailTime(undefined)).toBe(0);
  });
});
