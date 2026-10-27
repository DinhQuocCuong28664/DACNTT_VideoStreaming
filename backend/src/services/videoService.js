const mongoose = require('mongoose');
const Video = require('../models/Video');
const Comment = require('../models/Comment');
const CommentReport = require('../models/CommentReport');
const Report = require('../models/Report');
const s3Service = require('./s3Service');
const { publicListingFilter } = require('../utils/moderation');
const httpError = require('../utils/httpError');
const { can } = require('../utils/roles');
const limits = require('../config/uploadLimits');
const ChannelMembership = require('../models/ChannelMembership');
const { MAX_VIDEO_SIZE_BYTES } = limits;

// Xem và phát video đã bị gỡ hoặc đang chờ rà soát: quyền của admin và operator, không phải
// của auditor (chỉ đọc số liệu). Kiểm tra theo quyền để thêm vai trò không phải sửa ở đây.
const isAdminUser = (user) => can(user, 'content:viewRemoved');

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
 * 3a. Tệp nhỏ (hoặc không khai dung lượng): a presigned POST (url + fields) for
 *     the client; S3 enforces the exact key, the validated Content-Type and the
 *     size ceiling
 * 3b. Tệp lớn (khai dung lượng > ngưỡng multipart): mở lượt tải multipart và trả
 *     về kích thước phần; URL của từng phần được cấp sau, theo yêu cầu, ngay
 *     trước khi tải phần đó (getMultipartPartUrls)
 * 4. Return video record + upload (or multipart) + s3Key
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
    accessLevel: videoData.accessLevel || 'public',
    requiredTierLevel: Number(videoData.requiredTierLevel) || 1,
    hasViolence: Boolean(videoData.hasViolence),
    status: 'UPLOADING',
  });

  const s3Key = s3Service.generateS3Key(userId, video._id.toString(), videoData.filename);
  video.rawS3Key = s3Key;

  if (limits.usesMultipart(videoData.fileSize)) {
    try {
      video.multipartUploadId = await s3Service.createMultipartUpload({
        key: s3Key,
        contentType: videoData.mimeType,
      });
      video.multipartPartSize = limits.MULTIPART_PART_SIZE_BYTES;
      await video.save();
    } catch (err) {
      // Không để lại bản nháp mà người dùng không thể tiếp tục.
      await Video.deleteOne({ _id: video._id }).catch(() => {});
      throw err;
    }

    return {
      video,
      s3Key,
      multipart: {
        partSize: limits.MULTIPART_PART_SIZE_BYTES,
        partCount: limits.countParts(videoData.fileSize),
        maxPartUrlsPerRequest: limits.MAX_PART_URLS_PER_REQUEST,
      },
    };
  }

  await video.save();

  // Một lệnh POST đơn lẻ không nhận quá 5 GiB, dù trần tải lên có cao hơn.
  const postCeiling = Math.min(MAX_VIDEO_SIZE_BYTES, limits.SINGLE_UPLOAD_MAX_BYTES);
  const upload = await s3Service.generateVideoUploadPost(s3Key, videoData.mimeType, postCeiling);

  return { video, upload, s3Key };
};

/** Các giới hạn tải lên đang áp dụng, để frontend không phải giữ con số riêng. */
const getUploadConfig = () => ({
  maxVideoSizeBytes: limits.MAX_VIDEO_SIZE_BYTES,
  multipartThresholdBytes: limits.MULTIPART_THRESHOLD_BYTES,
});

/**
 * Cấp URL PUT cho một số phần của lượt tải multipart đang dở, mỗi URL ký đúng
 * dung lượng của phần đó. Chỉ chủ video, chỉ khi còn UPLOADING, chỉ cho các số
 * phần nằm trong tệp; mỗi lần tối đa MAX_PART_URLS_PER_REQUEST phần.
 */
const getMultipartPartUrls = async (videoId, userId, partNumbers) => {
  const video = await Video.findOne({ _id: videoId, user: userId }).select('+multipartUploadId');
  if (!video) throw httpError(404, 'Video not found or not owned by user');
  if (video.status !== 'UPLOADING' || !video.multipartUploadId) {
    throw httpError(409, 'No multipart upload in progress for this video', 'NO_MULTIPART_UPLOAD');
  }

  const wanted = Array.isArray(partNumbers) ? partNumbers : [];
  if (
    wanted.length === 0 ||
    wanted.length > limits.MAX_PART_URLS_PER_REQUEST ||
    new Set(wanted).size !== wanted.length
  ) {
    throw httpError(400, `partNumbers must hold 1-${limits.MAX_PART_URLS_PER_REQUEST} distinct part numbers`);
  }

  const partSize = video.multipartPartSize || limits.MULTIPART_PART_SIZE_BYTES;
  const sizes = wanted.map((n) => limits.partSizeOf(n, video.fileSize, partSize));
  if (sizes.some((size) => size === null)) {
    throw httpError(400, `Part numbers must be integers from 1 to ${limits.countParts(video.fileSize, partSize)}`);
  }

  return Promise.all(
    wanted.map(async (partNumber, i) => ({
      partNumber,
      size: sizes[i],
      url: await s3Service.presignUploadPart({
        key: video.rawS3Key,
        uploadId: video.multipartUploadId,
        partNumber,
        contentLength: sizes[i],
      }),
    }))
  );
};

/**
 * Ghép lượt tải multipart và chuyển UPLOADING → PROCESSING (gộp phần việc của
 * confirmUpload).
 *
 * Máy chủ không tin gì từ trình duyệt ở bước này: nó liệt kê các phần S3 thực sự
 * nhận được và chỉ ghép khi đủ mọi phần với đúng dung lượng đã ký. Gọi lại sau
 * khi đã ghép xong là vô hại: video đã qua UPLOADING thì trả về nguyên trạng.
 */
const completeMultipartUpload = async (videoId, userId) => {
  const video = await Video.findOne({ _id: videoId, user: userId }).select('+multipartUploadId');
  if (!video) throw httpError(404, 'Video not found or not owned by user');
  if (video.status !== 'UPLOADING') return video;
  if (!video.multipartUploadId) {
    throw httpError(409, 'No multipart upload in progress for this video', 'NO_MULTIPART_UPLOAD');
  }

  const key = video.rawS3Key;
  const uploadId = video.multipartUploadId;
  const partSize = video.multipartPartSize || limits.MULTIPART_PART_SIZE_BYTES;
  const expectedCount = limits.countParts(video.fileSize, partSize);

  let parts;
  try {
    parts = await s3Service.listParts({ key, uploadId });
  } catch (err) {
    // Lượt trước đã ghép xong nhưng chưa kịp ghi DB (máy chủ chết giữa chừng):
    // S3 không còn biết uploadId nhưng object đã có.
    if (err.name === 'NoSuchUpload' && (await s3Service.objectExists(process.env.S3_RAW_BUCKET_NAME, key))) {
      return markUploadComplete(video);
    }
    throw err;
  }

  const complete =
    parts.length === expectedCount &&
    parts.every((p, i) => p.partNumber === i + 1 && p.size === limits.partSizeOf(i + 1, video.fileSize, partSize));
  if (!complete) {
    throw httpError(400, 'Upload is incomplete: some parts are missing or have the wrong size', 'UPLOAD_INCOMPLETE');
  }

  await s3Service.completeMultipartUpload({ key, uploadId, parts });
  return markUploadComplete(video);
};

const markUploadComplete = async (video) => {
  video.status = 'PROCESSING';
  video.multipartUploadId = undefined;
  video.multipartPartSize = undefined;
  await video.save();
  return video;
};

/** Huỷ lượt tải multipart của một video nháp, bỏ qua lỗi: dọn dẹp không được chặn việc xoá. */
const abortMultipartQuietly = async (video) => {
  if (!video.multipartUploadId || !video.rawS3Key) return;
  try {
    await s3Service.abortMultipartUpload({ key: video.rawS3Key, uploadId: video.multipartUploadId });
  } catch (err) {
    console.warn(`⚠️ Failed to abort multipart upload for ${video.rawS3Key}:`, err.message);
  }
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

  // Kiểm tra quyền hội viên nếu video đặt quyền truy cập là members_only
  if (video.accessLevel === 'members_only' && !isOwner && !isAdminUser(requesterUser)) {
    let isMember = false;
    if (requesterUser && requesterUser._id) {
      const channelOwnerId = video.user._id || video.user;
      isMember = Boolean(
        await ChannelMembership.exists({
          user: requesterUser._id,
          channel: channelOwnerId,
          status: 'active',
          expiresAt: { $gt: new Date() },
          tierLevel: { $gte: video.requiredTierLevel || 1 },
        })
      );
    }
    if (!isMember) {
      const lockedObj = video.toObject ? video.toObject() : { ...video };
      lockedObj.isLocked = true;
      lockedObj.lockedReason = 'MEMBERS_ONLY';
      return lockedObj;
    }
  }

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

  if (video.isLocked) {
    throw httpError(403, 'This video is available to channel members only', 'MEMBERS_ONLY_CONTENT');
  }

  if (video.moderation && video.moderation.status === 'blocked' && !isAdminUser(requesterUser)) {
    throw httpError(403, 'This video has been removed for violating the community guidelines', 'VIDEO_REMOVED');
  }

  return video;
};

/**
 * Cấp khóa giải mã HLS AES-128 (16 bytes nhị phân) cho trình phát hợp lệ.
 *
 * The key is checked with the same rules as playback (getPlayableVideo):
 * private, members-only, unfinished, removed and under-review videos. A
 * separate, shorter list here had let anyone fetch the key of a members-only
 * or under-review video.
 */
const getVideoKey = async (videoId, requesterUser = null) => {
  await getPlayableVideo(videoId, requesterUser);

  const video = await Video.findById(videoId).select('+encryptionKey');
  if (!video || !video.encryptionKey) {
    throw httpError(404, 'No encryption key found for this video', 'KEY_NOT_FOUND');
  }

  return Buffer.from(video.encryptionKey, 'hex');
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

const COMMENT_AUTHOR_FIELDS = 'username displayName avatar';

const assertCommentId = (commentId) => {
  if (!mongoose.Types.ObjectId.isValid(commentId)) {
    const error = new Error('Invalid comment ID');
    error.statusCode = 400;
    throw error;
  }
};

/**
 * One page of a keyset (cursor) listing. Asks for one document more than the
 * page holds to learn whether another page exists; the cursor is the `_id` of
 * the last document returned. ObjectIds grow with creation time, so `_id`
 * order is posting order, and a comment added, deleted or pinned between two
 * requests does not shift the next page the way `skip` would.
 */
const cursorPage = (docs, limit) => {
  const items = docs.slice(0, limit);
  const nextCursor = docs.length > limit ? items[items.length - 1]._id : null;
  return { items, nextCursor };
};

const assertCursor = (cursor) => {
  if (cursor !== null && !mongoose.Types.ObjectId.isValid(cursor)) {
    const error = new Error('Invalid cursor');
    error.statusCode = 400;
    throw error;
  }
};

/**
 * Top-level comments of a video, newest first (enforces visibility & READY
 * status checks). The first page (no `before`) starts with the pinned
 * comment, which the pages leave out so it never appears twice. `total`
 * counts replies too: it is the number shown in the heading.
 */
const getComments = async (videoId, { limit = 20, before = null } = {}, requesterUser = null) => {
  assertCursor(before);
  const video = await getVideoById(videoId, requesterUser);
  const pinnedId = video.pinnedComment || null;

  const filter = { video: videoId, parentComment: null };
  if (pinnedId || before) {
    filter._id = {};
    if (pinnedId) filter._id.$ne = pinnedId;
    if (before) filter._id.$lt = before;
  }

  const [docs, total, pinned] = await Promise.all([
    Comment.find(filter).populate('user', COMMENT_AUTHOR_FIELDS).sort({ _id: -1 }).limit(limit + 1),
    Comment.countDocuments({ video: videoId }),
    pinnedId && !before
      ? Comment.findOne({ _id: pinnedId, video: videoId, parentComment: null }).populate('user', COMMENT_AUTHOR_FIELDS)
      : null,
  ]);
  const { items, nextCursor } = cursorPage(docs, limit);
  const allComments = pinned ? [pinned, ...items] : items;

  let finalComments = allComments;
  const authorIds = allComments.map((c) => c.user && c.user._id).filter(Boolean);
  if (authorIds.length > 0) {
    const channelOwnerId = video.user && (video.user._id || video.user);
    const activeMemberships = await ChannelMembership.find({
      channel: channelOwnerId,
      user: { $in: authorIds },
      status: 'active',
      expiresAt: { $gt: new Date() },
    }).populate('tier', 'name level badgeColor');

    if (activeMemberships.length > 0) {
      const badgeMap = new Map();
      activeMemberships.forEach((m) => {
        if (m.tier) {
          badgeMap.set(m.user.toString(), {
            name: m.tier.name,
            level: m.tier.level,
            color: m.tier.badgeColor,
          });
        }
      });

      finalComments = allComments.map((c) => {
        const obj = c.toObject ? c.toObject() : { ...c };
        if (c.user && badgeMap.has(c.user._id.toString())) {
          obj.memberBadge = badgeMap.get(c.user._id.toString());
        }
        return obj;
      });
    }
  }

  return {
    comments: finalComments,
    pinnedCommentId: pinnedId,
    total,
    nextCursor,
  };
};

/**
 * Replies to one top-level comment, oldest first so a conversation reads in
 * order; `after` is the cursor from the previous page. Applies the visibility
 * rule of the comment's video.
 */
const getReplies = async (commentId, { limit = 20, after = null } = {}, requesterUser = null) => {
  assertCommentId(commentId);
  assertCursor(after);
  const parent = await Comment.findById(commentId).select('video parentComment');
  if (!parent || parent.parentComment) {
    const error = new Error('Comment not found');
    error.statusCode = 404;
    throw error;
  }
  await getVideoById(parent.video, requesterUser);

  const filter = { parentComment: commentId };
  if (after) filter._id = { $gt: after };
  const [docs, total] = await Promise.all([
    Comment.find(filter).populate('user', COMMENT_AUTHOR_FIELDS).sort({ _id: 1 }).limit(limit + 1),
    Comment.countDocuments({ parentComment: commentId }),
  ]);
  const { items, nextCursor } = cursorPage(docs, limit);
  return { replies: items, total, nextCursor };
};

/**
 * Add a comment, or a reply when `parentId` is given (enforces visibility &
 * READY status checks). Replies are one level deep: replying to a reply files
 * the new comment under the same top-level comment.
 */
const addComment = async (videoId, userId, content, parentId = null) => {
  await getVideoById(videoId, { _id: userId });

  let parent = null;
  if (parentId) {
    assertCommentId(parentId);
    const target = await Comment.findById(parentId).select('video parentComment');
    if (!target || target.video.toString() !== videoId.toString()) {
      const error = new Error('Comment not found');
      error.statusCode = 404;
      throw error;
    }
    parent = target.parentComment || target._id;
  }

  const comment = await Comment.create({
    video: videoId,
    user: userId,
    content,
    parentComment: parent,
  });

  if (parent) await Comment.updateOne({ _id: parent }, { $inc: { replyCount: 1 } });

  return await comment.populate('user', COMMENT_AUTHOR_FIELDS);
};

/**
 * Delete a comment (Author of comment OR Video owner can delete).
 *
 * Deleting a top-level comment deletes its replies too and unpins it;
 * deleting a reply lowers its parent's reply count.
 */
const deleteComment = async (commentId, userId) => {
  const comment = await Comment.findById(commentId).populate('video', 'user pinnedComment');
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

  await removeComment(comment);
  return comment;
};

/**
 * Delete a loaded comment with everything that hangs off it, whoever asked
 * (author, video owner, or staff acting on a report). `comment.video` must be
 * populated with `pinnedComment`.
 *
 * A top-level comment takes its replies with it and is unpinned; a reply
 * lowers its parent's reply count. Open reports of the deleted comments go
 * too, as with a deleted video; resolved reports stay as the record of the
 * staff decision.
 */
const removeComment = async (comment) => {
  const commentId = comment._id;
  const removedIds = [commentId];

  await Comment.findByIdAndDelete(commentId);

  if (comment.parentComment) {
    await Comment.updateOne({ _id: comment.parentComment, replyCount: { $gt: 0 } }, { $inc: { replyCount: -1 } });
  } else {
    const replies = await Comment.find({ parentComment: commentId }).select('_id');
    removedIds.push(...replies.map((r) => r._id));
    await Comment.deleteMany({ parentComment: commentId });
    if (comment.video && comment.video.pinnedComment && comment.video.pinnedComment.toString() === commentId.toString()) {
      await Video.updateOne({ _id: comment.video._id, pinnedComment: comment.video.pinnedComment }, { $set: { pinnedComment: null } });
    }
  }
  await CommentReport.deleteMany({ comment: { $in: removedIds }, status: 'open' });
};

/**
 * Pin a top-level comment of one's own video, or unpin with null. Only the
 * owner of the video may pin; a reply cannot be pinned.
 */
const setPinnedComment = async (videoId, userId, commentId) => {
  if (!mongoose.Types.ObjectId.isValid(videoId)) {
    const error = new Error('Invalid video ID');
    error.statusCode = 400;
    throw error;
  }
  const video = await Video.findOne({ _id: videoId, user: userId }).select('_id');
  if (!video) {
    const error = new Error('Video not found or not owned by user');
    error.statusCode = 404;
    throw error;
  }

  if (commentId) {
    assertCommentId(commentId);
    const comment = await Comment.findOne({ _id: commentId, video: videoId, parentComment: null }).select('_id');
    if (!comment) {
      const error = new Error('Only a top-level comment of this video can be pinned');
      error.statusCode = 400;
      throw error;
    }
  }

  await Video.updateOne({ _id: videoId }, { $set: { pinnedComment: commentId || null } });
  return { pinnedCommentId: commentId || null };
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

  const allowedFields = ['title', 'description', 'category', 'tags', 'visibility', 'accessLevel', 'requiredTierLevel', 'hasViolence'];
  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      if (field === 'hasViolence') {
        video.hasViolence = Boolean(updateData.hasViolence);
      } else {
        video[field] = updateData[field];
      }
    }
  }

  await video.save();
  return video;
};

/**
 * Delete video (remove from DB + delete both raw & processed HLS S3 objects + comments)
 */
const deleteVideo = async (videoId, userId) => {
  const video = await Video.findOne({ _id: videoId, user: userId }).select('+multipartUploadId');

  if (!video) {
    const error = new Error('Video not found or not owned by user');
    error.statusCode = 404;
    throw error;
  }

  // 0. Huỷ lượt tải multipart đang dở: các phần đã lên S3 vẫn bị tính phí lưu trữ
  //    cho tới khi bị huỷ, và DeleteObject không đụng tới chúng.
  if (video.status === 'UPLOADING') {
    await abortMultipartQuietly(video);
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
  await CommentReport.deleteMany({ video: videoId });

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
    { returnDocument: 'after', select: 'views' }
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
  getUploadConfig,
  getMultipartPartUrls,
  completeMultipartUpload,
  getVideoById,
  getPlayableVideo,
  getVideoKey,
  getAllVideos,
  getVideosByUser,
  USER_VIDEO_SORTS,
  getRelatedVideos,
  reactionOf,
  toggleLike,
  toggleDislike,
  getComments,
  getReplies,
  addComment,
  deleteComment,
  removeComment,
  COMMENT_AUTHOR_FIELDS,
  setPinnedComment,
  updateVideo,
  deleteVideo,
  registerView,
  VIEW_DEDUPE_WINDOW_MS,
  // Xuất ra để kiểm thử việc dọn bộ nhớ chống đếm trùng
  viewDedupeCache,
  pruneViewCache,
};

