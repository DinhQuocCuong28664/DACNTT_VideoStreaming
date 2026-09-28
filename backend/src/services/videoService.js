const mongoose = require('mongoose');
const Video = require('../models/Video');
const Comment = require('../models/Comment');
const Report = require('../models/Report');
const s3Service = require('./s3Service');
const { publicListingFilter } = require('../utils/moderation');
const httpError = require('../utils/httpError');
const { MAX_VIDEO_SIZE_BYTES } = require('../middleware/validateRequest');

const isAdminUser = (user) => Boolean(user && user.role === 'admin');

/**
 * Danh sách video (trang chủ, trang kênh, video liên quan) không cần hai mảng
 * người đã Like/Dislike: thẻ video không hiện chúng, và mảng dài ra theo mức
 * độ nổi tiếng của video. Bỏ ngay từ truy vấn để không kéo chúng ra khỏi DB.
 */
const LIST_PROJECTION = '-likes -dislikes';

/**
 * Initiate upload flow:
 * 1. Create DB record FIRST (status: UPLOADING) to get Mongo _id (videoId)
 * 2. Generate S3 key using Mongo _id: videos/{userId}/{videoId}/{filename}
 * 3. Generate a presigned POST (url + fields) for the client; S3 enforces the
 *    exact key, the validated Content-Type and the 2 GB ceiling
 * 4. Return video record + upload + s3Key
 */
const initiateUpload = async (userId, videoData) => {
  const video = await Video.create({
    title: videoData.title || 'Untitled Video',
    description: videoData.description || '',
    user: userId,
    category: videoData.category || 'Công nghệ',
    mimeType: videoData.mimeType,
    fileSize: videoData.fileSize || 0,
    tags: videoData.tags || [],
    visibility: videoData.visibility || 'public',
    status: 'UPLOADING',
  });

  const s3Key = s3Service.generateS3Key(userId, video._id.toString(), videoData.filename);
  video.rawS3Key = s3Key;
  await video.save();

  const upload = await s3Service.generateVideoUploadPost(s3Key, videoData.mimeType, MAX_VIDEO_SIZE_BYTES);

  return { video, upload, s3Key };
};

/**
 * Confirm upload complete — transition status UPLOADING → PROCESSING
 */
const confirmUpload = async (videoId, userId) => {
  const video = await Video.findOne({ _id: videoId, user: userId });

  if (!video) {
    const error = new Error('Video not found or not owned by user');
    error.statusCode = 404;
    throw error;
  }

  if (video.status !== 'UPLOADING') {
    return video;
  }

  video.status = 'PROCESSING';
  await video.save();

  return video;
};

/**
 * Get a single video by ID with visibility & status security checks
 */
const getVideoById = async (videoId, requesterUser = null) => {
  if (!mongoose.Types.ObjectId.isValid(videoId)) {
    const error = new Error('Invalid video ID');
    error.statusCode = 400;
    throw error;
  }

  const video = await Video.findById(videoId).populate(
    'user',
    'username displayName avatar'
  );

  if (!video) {
    const error = new Error('Video not found');
    error.statusCode = 404;
    throw error;
  }

  const isOwner =
    requesterUser && requesterUser._id && requesterUser._id.toString() === video.user._id.toString();

  // Quản trị viên cần xem được mọi video để rà soát, kể cả video riêng tư bị
  // báo cáo qua đường link cũ hay video đã bị gỡ.
  if (!isOwner && !isAdminUser(requesterUser)) {
    if (video.visibility === 'private') {
      const error = new Error('Video not found');
      error.statusCode = 404;
      throw error;
    }

    if (video.status !== 'READY') {
      const error = new Error('Video is still processing');
      error.statusCode = 400;
      throw error;
    }

    // Kiểm tra SAU visibility: video riêng tư vẫn phải trả 404 như cũ, không
    // được để lộ nó tồn tại qua một mã lỗi kiểm duyệt khác đi.
    //
    // Cố ý KHÔNG dùng 410 Gone. 410 thuộc nhóm được cache theo heuristic (RFC
    // 9111 §4.2.2) và Chrome thực sự cache nó dù không có Cache-Control: khi
    // thử nghiệm, trình duyệt trả lại 410 đã lưu từ lượt xem của một tài khoản
    // cho cả chủ video đăng nhập sau đó. Trạng thái "bị gỡ" lại đảo ngược được
    // (quản trị viên khôi phục) và khác nhau theo người xem, nên 403 kèm mã máy
    // đọc được mới đúng.
    const moderationStatus = video.moderation && video.moderation.status;
    if (moderationStatus === 'blocked') {
      throw httpError(403, 'This video has been removed for violating the community guidelines', 'VIDEO_REMOVED');
    }
    if (moderationStatus === 'flagged') {
      throw httpError(403, 'This video is being reviewed by moderators', 'VIDEO_UNDER_REVIEW');
    }
  }

  return video;
};

/**
 * Như getVideoById nhưng dành cho việc PHÁT video (cấp Signed Cookie).
 *
 * Chủ video vẫn xem được trang của video đã bị gỡ — để biết nó bị gỡ — nhưng
 * không phát được nữa. Chỉ quản trị viên phát được, để rà soát khiếu nại.
 */
const getPlayableVideo = async (videoId, requesterUser = null) => {
  const video = await getVideoById(videoId, requesterUser);

  if (video.moderation && video.moderation.status === 'blocked' && !isAdminUser(requesterUser)) {
    throw httpError(403, 'This video has been removed for violating the community guidelines', 'VIDEO_REMOVED');
  }

  return video;
};

/**
 * Get all public READY videos (with optional Category & Search filtering)
 */
const getAllVideos = async (page = 1, limit = 12, category = null, searchQuery = null) => {
  const skip = (page - 1) * limit;

  const filter = publicListingFilter();

  if (category && category !== 'Tất cả') {
    filter.category = category;
  }

  if (searchQuery && searchQuery.trim() !== '') {
    const escapedQuery = searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Chuỗi tìm kiếm đã được thoát toàn bộ ký tự đặc biệt ở dòng trên nên không
    // thể chèn cú pháp biểu thức chính quy độc hại (ReDoS / NoSQL regex injection).
    // eslint-disable-next-line security/detect-non-literal-regexp
    const regex = new RegExp(escapedQuery, 'i');
    filter.$or = [{ title: regex }, { description: regex }, { tags: regex }];
  }

  const [videos, total] = await Promise.all([
    Video.find(filter, LIST_PROJECTION)
      .populate('user', 'username displayName avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Video.countDocuments(filter),
  ]);

  return {
    videos,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get videos by a specific user (for Channel page) with pagination
 */
/**
 * Ba kiểu sắp xếp của trang kênh, khớp với ba chip "Mới nhất / Phổ biến / Cũ
 * nhất" ở giao diện.
 *
 * Mỗi kiểu đều kết thúc bằng `_id` làm tiêu chí phụ. Tài liệu MongoDB (mục
 * cursor.skip() và $sort) nói rõ: sắp theo trường có giá trị trùng, như `views`
 * hay hai video cùng `createdAt`, thì thứ tự giữa các bản ghi trùng không ổn
 * định qua các lần truy vấn. Kết hợp với skip(), một video có thể xuất hiện ở
 * cả trang 1 lẫn trang 2, hoặc không xuất hiện ở trang nào. `_id` là duy nhất
 * nên thứ tự luôn xác định.
 *
 * Dùng bảng tra cố định thay vì nhận thẳng giá trị từ query: người gọi chỉ
 * chọn được tên kiểu sắp xếp, không truyền được đối tượng sort tuỳ ý vào
 * truy vấn.
 */
const USER_VIDEO_SORTS = {
  latest: { createdAt: -1, _id: -1 },
  popular: { views: -1, createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
};

const getVideosByUser = async (userId, page = 1, limit = 12, requesterId = null, sort = 'latest') => {
  const skip = (page - 1) * limit;
  const sortSpec = Object.prototype.hasOwnProperty.call(USER_VIDEO_SORTS, sort)
    ? USER_VIDEO_SORTS[sort]
    : USER_VIDEO_SORTS.latest;

  // Chủ kênh thấy mọi video của mình, kể cả video đang chờ rà soát hay đã bị
  // gỡ — trang kênh là nơi duy nhất họ biết được điều đó.
  const isOwner = requesterId && requesterId.toString() === userId.toString();
  const filter = isOwner ? { user: userId } : { ...publicListingFilter(), user: userId };

  const [videos, total] = await Promise.all([
    Video.find(filter, LIST_PROJECTION)
      .populate('user', 'username displayName avatar')
      .sort(sortSpec)
      .skip(skip)
      .limit(limit),
    Video.countDocuments(filter),
  ]);

  return {
    videos,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Lựa chọn của chính người đang xem: 'like', 'dislike' hoặc null.
 *
 * Tính ở máy chủ vì danh sách người đã bấm không còn được gửi ra ngoài (xem
 * Video.toJSON). Nhận document đã nạp đủ hai mảng.
 */
const reactionOf = (video, requesterUser) => {
  if (!requesterUser || !requesterUser._id) return null;
  const has = (list) => Array.isArray(list) && list.some((id) => id.equals(requesterUser._id));
  if (has(video.likes)) return 'like';
  if (has(video.dislikes)) return 'dislike';
  return null;
};

/** Mảng của từng loại phản hồi và mảng loại trừ nó (Like bỏ Dislike và ngược lại). */
const REACTION_FIELDS = {
  like: ['likes', 'dislikes'],
  dislike: ['dislikes', 'likes'],
};

/**
 * Bấm Like hoặc Dislike: bấm lần nữa là bỏ, và hai lựa chọn loại trừ nhau.
 *
 * Trước đây hàm đọc video, sửa mảng trong bộ nhớ rồi gọi save(). Gán lại cả
 * mảng làm Mongoose kiểm tra khoá phiên bản `__v` khi lưu, nên hai người bấm
 * cùng lúc trên một video thì người lưu sau nhận VersionError — HTTP 500.
 *
 * Nay mỗi chiều là một lệnh cập nhật có điều kiện trên một document. MongoDB
 * bảo đảm ghi nguyên tử ở mức document, và filter mang theo trạng thái mong
 * đợi ("chưa bấm" hoặc "đã bấm") — đúng cách tài liệu MongoDB khuyến nghị để
 * cập nhật đồng thời không ghi đè nhau. Lệnh chỉ đụng tới phần tử của chính
 * người bấm, nên không bao giờ xung đột với người khác.
 *
 * Thử "bấm" trước; không khớp nghĩa là người này đã bấm rồi, khi đó "bỏ bấm".
 * Cả hai cùng trượt chỉ xảy ra khi video vừa bị xoá, hoặc chính người này bấm
 * liên tiếp và một request khác chen vào giữa — khi đó thử lại.
 */
const toggleReaction = async (videoId, userId, reaction) => {
  // Giữ nguyên kiểm tra quyền như trước: không bấm được video mình không xem được.
  await getVideoById(videoId, { _id: userId });

  const [field, opposite] = REACTION_FIELDS[reaction];
  const uid = new mongoose.Types.ObjectId(userId);
  const options = { returnDocument: 'after', select: 'likes dislikes' };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const added = await Video.findOneAndUpdate(
      { _id: videoId, [field]: { $ne: uid } },
      { $addToSet: { [field]: uid }, $pull: { [opposite]: uid } },
      options
    );
    if (added) {
      return { likesCount: added.likes.length, dislikesCount: added.dislikes.length, active: true };
    }

    const removed = await Video.findOneAndUpdate(
      { _id: videoId, [field]: uid },
      { $pull: { [field]: uid } },
      options
    );
    if (removed) {
      return { likesCount: removed.likes.length, dislikesCount: removed.dislikes.length, active: false };
    }

    if (!(await Video.exists({ _id: videoId }))) {
      throw httpError(404, 'Video not found');
    }
  }

  throw httpError(409, 'Your reaction changed while saving, please try again');
};

/**
 * Toggle Like on video (enforces visibility & READY status checks)
 */
const toggleLike = async (videoId, userId) => {
  const { active, ...counts } = await toggleReaction(videoId, userId, 'like');
  return { ...counts, hasLiked: active };
};

/**
 * Toggle Dislike on video (enforces visibility & READY status checks)
 */
const toggleDislike = async (videoId, userId) => {
  const { active, ...counts } = await toggleReaction(videoId, userId, 'dislike');
  return { ...counts, hasDisliked: active };
};

/**
 * Get comments for a video (enforces visibility & READY status checks)
 */
const getComments = async (videoId, page = 1, limit = 20, requesterUser = null) => {
  await getVideoById(videoId, requesterUser);

  const skip = (page - 1) * limit;

  const [comments, total] = await Promise.all([
    Comment.find({ video: videoId })
      .populate('user', 'username displayName avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Comment.countDocuments({ video: videoId }),
  ]);

  return { comments, total };
};

/**
 * Add a new comment (enforces visibility & READY status checks)
 */
const addComment = async (videoId, userId, content) => {
  await getVideoById(videoId, { _id: userId });

  const comment = await Comment.create({
    video: videoId,
    user: userId,
    content,
  });

  return await comment.populate('user', 'username displayName avatar');
};

/**
 * Delete a comment (Author of comment OR Video owner can delete)
 */
const deleteComment = async (commentId, userId) => {
  const comment = await Comment.findById(commentId).populate('video', 'user');
  if (!comment) {
    const error = new Error('Comment not found');
    error.statusCode = 404;
    throw error;
  }

  const isCommentOwner = comment.user.toString() === userId.toString();
  const isVideoOwner = comment.video && comment.video.user.toString() === userId.toString();

  if (!isCommentOwner && !isVideoOwner) {
    const error = new Error('Not authorized to delete this comment');
    error.statusCode = 403;
    throw error;
  }

  await Comment.findByIdAndDelete(commentId);
  return comment;
};

/**
 * Update video metadata (title, description, category, tags, visibility)
 */
const updateVideo = async (videoId, userId, updateData) => {
  const video = await Video.findOne({ _id: videoId, user: userId });

  if (!video) {
    const error = new Error('Video not found or not owned by user');
    error.statusCode = 404;
    throw error;
  }

  const allowedFields = ['title', 'description', 'category', 'tags', 'visibility'];
  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      video[field] = updateData[field];
    }
  }

  await video.save();
  return video;
};

/**
 * Delete video (remove from DB + delete both raw & processed HLS S3 objects + comments)
 */
const deleteVideo = async (videoId, userId) => {
  const video = await Video.findOne({ _id: videoId, user: userId });

  if (!video) {
    const error = new Error('Video not found or not owned by user');
    error.statusCode = 404;
    throw error;
  }

  // 1. Delete raw video from S3 Raw Bucket
  if (video.rawS3Key) {
    try {
      await s3Service.deleteObject(process.env.S3_RAW_BUCKET_NAME, video.rawS3Key);
    } catch (err) {
      console.warn(`⚠️ Failed to delete S3 raw object: ${video.rawS3Key}`, err.message);
    }
  }

  // 2. Delete processed HLS directory from S3 Processed Bucket
  try {
    await s3Service.deleteDirectory(process.env.S3_PROCESSED_BUCKET_NAME, `videos/${videoId}/`);
  } catch (err) {
    console.warn(`⚠️ Failed to delete S3 processed directory videos/${videoId}/:`, err.message);
  }

  // 3. Delete comments and reports
  await Comment.deleteMany({ video: videoId });
  await Report.deleteMany({ video: videoId });

  // 4. Delete DB record
  await Video.findByIdAndDelete(videoId);
  return video;
};

/**
 * Bộ nhớ tạm chống đếm trùng lượt xem.
 * Khóa có dạng `<videoId>:<danh tính người xem>`, giá trị là thời điểm ghi nhận
 * gần nhất. Dùng bộ nhớ tiến trình vì mô hình triển khai hiện tại chỉ có một
 * instance backend; khi mở rộng nhiều instance cần chuyển sang Redis để cơ chế
 * chống trùng có hiệu lực trên toàn cụm.
 */
const viewDedupeCache = new Map();

/** Khoảng thời gian một người xem chỉ được tính một lượt xem cho cùng video */
const VIEW_DEDUPE_WINDOW_MS = 30 * 60 * 1000; // 30 phút

/**
 * Dọn các mục đã hết hạn để bộ nhớ không phình vô hạn.
 *
 * Map duyệt theo thứ tự chèn, và registerView luôn xoá rồi chèn lại khoá khi
 * ghi, nên các mục xếp từ cũ đến mới: gặp mục còn hạn đầu tiên là dừng. Bản
 * trước duyệt toàn bộ Map ở MỖI lượt xem — O(số người xem trong 30 phút) trên
 * luồng sự kiện duy nhất của Node. Từ khi req.ip là IP thật của từng người thay
 * vì một nhúm IP Cloudflare, Map lớn hơn hẳn và chi phí đó mới thật sự lộ ra.
 */
const pruneViewCache = (now) => {
  for (const [key, timestamp] of viewDedupeCache) {
    if (now - timestamp <= VIEW_DEDUPE_WINDOW_MS) break;
    viewDedupeCache.delete(key);
  }
};

/**
 * Ghi nhận một lượt xem.
 *
 * Lượt xem chỉ được cộng khi thỏa mãn đồng thời các điều kiện: video tồn tại và
 * ở trạng thái READY, người xem không phải chủ video, và cùng một người xem chưa
 * ghi nhận lượt xem cho video này trong cửa sổ thời gian quy định. Cách làm này
 * ngăn việc tải lại trang liên tục để thổi phồng số lượt xem.
 *
 * @param {string} videoId - ID video
 * @param {object|null} requesterUser - Người dùng đã đăng nhập (nếu có)
 * @param {string} clientIp - Địa chỉ IP dùng để định danh khách vãng lai
 * @returns {Promise<{counted: boolean, views: number}>}
 */
const registerView = async (videoId, requesterUser, clientIp) => {
  const video = await Video.findById(videoId).select('user status views moderation.status');

  if (!video) {
    const error = new Error('Video not found');
    error.statusCode = 404;
    throw error;
  }

  // Quản trị viên phát video bị gỡ để rà soát không phải lượt xem thật.
  const moderationStatus = video.moderation && video.moderation.status;
  if (video.status !== 'READY' || moderationStatus === 'flagged' || moderationStatus === 'blocked') {
    return { counted: false, views: video.views };
  }

  // Không tính lượt xem của chính chủ video
  if (requesterUser && requesterUser._id.toString() === video.user.toString()) {
    return { counted: false, views: video.views };
  }

  const viewerId = requesterUser ? `u:${requesterUser._id}` : `ip:${clientIp || 'unknown'}`;
  const cacheKey = `${videoId}:${viewerId}`;
  const now = Date.now();

  pruneViewCache(now);

  const lastViewedAt = viewDedupeCache.get(cacheKey);
  if (lastViewedAt && now - lastViewedAt < VIEW_DEDUPE_WINDOW_MS) {
    return { counted: false, views: video.views };
  }

  // Xoá trước khi ghi để khoá chuyển xuống cuối Map (xem pruneViewCache).
  viewDedupeCache.delete(cacheKey);
  viewDedupeCache.set(cacheKey, now);

  const updated = await Video.findByIdAndUpdate(
    videoId,
    { $inc: { views: 1 } },
    { new: true, select: 'views' }
  );

  return { counted: true, views: updated.views };
};

/**
 * Get related/recommended videos based on category and tags
 *
 * Quyền xem video gốc được kiểm tra bằng chính `getVideoById`, tức là dùng
 * lại đúng một nguồn quy tắc với endpoint xem chi tiết video. Nếu tự viết
 * lại phần kiểm tra ở đây thì người lạ sẽ dò được ID nào có thật chỉ bằng
 * cách so sánh 404 với 200, dù nội dung trả về vẫn chỉ toàn video công khai.
 */
const getRelatedVideos = async (videoId, limit = 8, requesterUser = null) => {
  const currentVideo = await getVideoById(videoId, requesterUser);

  const query = {
    ...publicListingFilter(),
    _id: { $ne: currentVideo._id },
  };

  if (currentVideo.category || (currentVideo.tags && currentVideo.tags.length > 0)) {
    query.$or = [
      { category: currentVideo.category },
      { tags: { $in: currentVideo.tags || [] } },
    ];
  }

  let related = await Video.find(query, LIST_PROJECTION)
    .populate('user', 'username displayName avatar')
    .sort({ views: -1, createdAt: -1 })
    .limit(limit);

  // If fewer than limit, backfill with most viewed public READY videos
  if (related.length < limit) {
    const existingIds = [currentVideo._id, ...related.map((v) => v._id)];
    const backfill = await Video.find(
      {
        ...publicListingFilter(),
        _id: { $nin: existingIds },
      },
      LIST_PROJECTION
    )
      .populate('user', 'username displayName avatar')
      .sort({ views: -1, createdAt: -1 })
      .limit(limit - related.length);

    related = [...related, ...backfill];
  }

  return related;
};

module.exports = {
  initiateUpload,
  confirmUpload,
  getVideoById,
  getPlayableVideo,
  getAllVideos,
  getVideosByUser,
  USER_VIDEO_SORTS,
  getRelatedVideos,
  reactionOf,
  toggleLike,
  toggleDislike,
  getComments,
  addComment,
  deleteComment,
  updateVideo,
  deleteVideo,
  registerView,
  VIEW_DEDUPE_WINDOW_MS,
  // Xuất ra để kiểm thử việc dọn bộ nhớ chống đếm trùng
  viewDedupeCache,
  pruneViewCache,
};

