const mongoose = require('mongoose');
const Video = require('../src/models/Video');
const { reactionOf } = require('../src/services/videoService');

/**
 * API công khai không được lộ ai đã Like/Dislike video nào.
 *
 * Trước đây `GET /api/videos/:id` trả nguyên hai mảng ID người dùng, và mọi
 * danh sách video cũng vậy. Nay chỉ trả số lượng, cộng lựa chọn của chính
 * người đang xem.
 */
describe('Không lộ danh sách người đã Like/Dislike', () => {
  const owner = new mongoose.Types.ObjectId();
  const alice = new mongoose.Types.ObjectId();
  const bob = new mongoose.Types.ObjectId();
  const carol = new mongoose.Types.ObjectId();

  const buildVideo = () =>
    new Video({
      title: 'Video mẫu',
      user: owner,
      likes: [alice, bob],
      dislikes: [carol],
    });

  it('toJSON chỉ trả số lượng, không trả mảng ID', () => {
    const json = buildVideo().toJSON();

    expect(json.likesCount).toBe(2);
    expect(json.dislikesCount).toBe(1);
    expect(json).not.toHaveProperty('likes');
    expect(json).not.toHaveProperty('dislikes');
    expect(JSON.stringify(json)).not.toContain(carol.toString());
  });

  it('video nạp bằng projection danh sách không bịa ra số 0', () => {
    // Giống kết quả của Video.find(filter, '-likes -dislikes') ở các danh sách.
    const listed = Video.hydrate(
      { _id: new mongoose.Types.ObjectId(), title: 'x', user: owner },
      { likes: 0, dislikes: 0 }
    );
    const json = listed.toJSON();

    expect(json).not.toHaveProperty('likes');
    expect(json).not.toHaveProperty('likesCount');
  });

  it('reactionOf cho biết lựa chọn của chính người đang xem', () => {
    const video = buildVideo();

    expect(reactionOf(video, { _id: alice })).toBe('like');
    expect(reactionOf(video, { _id: carol })).toBe('dislike');
    expect(reactionOf(video, { _id: owner })).toBeNull();
    expect(reactionOf(video, null)).toBeNull();
  });
});
