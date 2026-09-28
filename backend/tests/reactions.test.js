const mongoose = require('mongoose');
const videoService = require('../src/services/videoService');
const Video = require('../src/models/Video');

jest.mock('../src/models/Video');
jest.mock('../src/models/Comment');
jest.mock('../src/services/s3Service');

/**
 * Like / Dislike phải là cập nhật có điều kiện, không phải đọc-sửa-save().
 *
 * Bản cũ gọi save() sau khi gán lại cả mảng, làm Mongoose kiểm tra khoá phiên
 * bản: hai người bấm cùng lúc thì người lưu sau nhận VersionError (HTTP 500).
 * Các document giả dưới đây không có save(), nên nếu code quay lại lối cũ thì
 * test sẽ hỏng ngay.
 */
describe('Like / Dislike bằng cập nhật có điều kiện', () => {
  const ownerId = new mongoose.Types.ObjectId();
  const viewerId = new mongoose.Types.ObjectId();
  const videoId = new mongoose.Types.ObjectId().toString();

  const publicVideo = {
    _id: videoId,
    user: { _id: ownerId },
    visibility: 'public',
    status: 'READY',
  };

  const counts = (likes, dislikes) => ({
    likes: Array(likes).fill(new mongoose.Types.ObjectId()),
    dislikes: Array(dislikes).fill(new mongoose.Types.ObjectId()),
  });

  beforeEach(() => {
    Video.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(publicVideo) });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('bấm Like lần đầu: thêm vào likes và gỡ khỏi dislikes trong cùng một lệnh', async () => {
    Video.findOneAndUpdate.mockResolvedValueOnce(counts(3, 1));

    const result = await videoService.toggleLike(videoId, viewerId);

    expect(result).toEqual({ likesCount: 3, dislikesCount: 1, hasLiked: true });
    const [filter, update] = Video.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: videoId, likes: { $ne: viewerId } });
    expect(update).toEqual({ $addToSet: { likes: viewerId }, $pull: { dislikes: viewerId } });
  });

  it('bấm Like lần nữa: chỉ gỡ khi người này thực sự đang Like', async () => {
    Video.findOneAndUpdate.mockResolvedValueOnce(null).mockResolvedValueOnce(counts(2, 1));

    const result = await videoService.toggleLike(videoId, viewerId);

    expect(result).toEqual({ likesCount: 2, dislikesCount: 1, hasLiked: false });
    const [filter, update] = Video.findOneAndUpdate.mock.calls[1];
    expect(filter).toEqual({ _id: videoId, likes: viewerId });
    expect(update).toEqual({ $pull: { likes: viewerId } });
  });

  it('Dislike dùng mảng ngược lại', async () => {
    Video.findOneAndUpdate.mockResolvedValueOnce(counts(0, 5));

    const result = await videoService.toggleDislike(videoId, viewerId);

    expect(result).toEqual({ likesCount: 0, dislikesCount: 5, hasDisliked: true });
    const [filter, update] = Video.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: videoId, dislikes: { $ne: viewerId } });
    expect(update).toEqual({ $addToSet: { dislikes: viewerId }, $pull: { likes: viewerId } });
  });

  it('trả 404 khi video bị xoá giữa lúc bấm', async () => {
    Video.findOneAndUpdate.mockResolvedValue(null);
    Video.exists.mockResolvedValue(null);

    await expect(videoService.toggleLike(videoId, viewerId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('thử lại khi một request khác của chính người này chen vào giữa hai lệnh', async () => {
    Video.findOneAndUpdate
      .mockResolvedValueOnce(null) // đã Like
      .mockResolvedValueOnce(null) // ...nhưng request khác vừa bỏ Like
      .mockResolvedValueOnce(counts(1, 0)); // lượt sau: Like lại được
    Video.exists.mockResolvedValue({ _id: videoId });

    const result = await videoService.toggleLike(videoId, viewerId);

    expect(result.hasLiked).toBe(true);
    expect(Video.findOneAndUpdate).toHaveBeenCalledTimes(3);
  });

  it('không cho bấm video riêng tư của người khác (kiểm tra quyền trước khi ghi)', async () => {
    Video.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue({ ...publicVideo, visibility: 'private' }),
    });

    await expect(videoService.toggleLike(videoId, viewerId)).rejects.toMatchObject({ statusCode: 404 });
    expect(Video.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
