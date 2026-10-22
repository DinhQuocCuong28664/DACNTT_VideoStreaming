const mongoose = require('mongoose');
const videoService = require('../src/services/videoService');
const Video = require('../src/models/Video');
const Comment = require('../src/models/Comment');

jest.mock('../src/models/Video');
jest.mock('../src/models/Comment');
jest.mock('../src/services/s3Service');

const id = () => new mongoose.Types.ObjectId();

/** A Mongoose query chain that resolves to `value` whatever is chained. */
const chain = (value) => {
  const query = {
    populate: jest.fn(() => query),
    sort: jest.fn(() => query),
    skip: jest.fn(() => query),
    limit: jest.fn(() => query),
    select: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};

describe('Comment threads and pinning', () => {
  const ownerId = id();
  const viewerId = id();
  const videoId = id();
  const playable = (extra = {}) => ({
    _id: videoId,
    user: { _id: ownerId },
    visibility: 'public',
    status: 'READY',
    moderation: { status: 'approved' },
    pinnedComment: null,
    ...extra,
  });

  afterEach(() => jest.clearAllMocks());

  describe('getComments', () => {
    it('lists top-level comments newest first and counts replies in the total', async () => {
      Video.findById.mockReturnValue(chain(playable()));
      const query = chain([{ _id: 'c1' }]);
      Comment.find.mockReturnValue(query);
      Comment.countDocuments.mockResolvedValue(4);

      const result = await videoService.getComments(videoId.toString(), { limit: 20 }, null);

      expect(Comment.find).toHaveBeenCalledWith({ video: videoId.toString(), parentComment: null });
      expect(query.sort).toHaveBeenCalledWith({ _id: -1 });
      expect(query.limit).toHaveBeenCalledWith(21);
      expect(result).toEqual({ comments: [{ _id: 'c1' }], pinnedCommentId: null, total: 4, nextCursor: null });
    });

    it('returns the last id as the cursor when another page exists', async () => {
      Video.findById.mockReturnValue(chain(playable()));
      Comment.find.mockReturnValue(chain([{ _id: 'c3' }, { _id: 'c2' }, { _id: 'c1' }]));
      Comment.countDocuments.mockResolvedValue(3);

      const result = await videoService.getComments(videoId.toString(), { limit: 2 }, null);

      expect(result.comments).toEqual([{ _id: 'c3' }, { _id: 'c2' }]);
      expect(result.nextCursor).toBe('c2');
    });

    it('puts the pinned comment first on the first page and keeps it out of the pages', async () => {
      const pinnedId = id();
      Video.findById.mockReturnValue(chain(playable({ pinnedComment: pinnedId })));
      Comment.find.mockReturnValue(chain([{ _id: 'newest' }]));
      Comment.findOne.mockReturnValue(chain({ _id: pinnedId }));
      Comment.countDocuments.mockResolvedValue(2);

      const result = await videoService.getComments(videoId.toString(), { limit: 20 }, null);

      expect(Comment.find).toHaveBeenCalledWith({ video: videoId.toString(), parentComment: null, _id: { $ne: pinnedId } });
      expect(result.comments.map((c) => String(c._id))).toEqual([String(pinnedId), 'newest']);
      expect(result.pinnedCommentId).toBe(pinnedId);
    });

    it('continues before the cursor without repeating the pinned comment', async () => {
      const pinnedId = id();
      const cursor = id().toString();
      Video.findById.mockReturnValue(chain(playable({ pinnedComment: pinnedId })));
      Comment.find.mockReturnValue(chain([{ _id: 'older' }]));
      Comment.countDocuments.mockResolvedValue(30);

      const result = await videoService.getComments(videoId.toString(), { limit: 20, before: cursor }, null);

      expect(Comment.find).toHaveBeenCalledWith({
        video: videoId.toString(),
        parentComment: null,
        _id: { $ne: pinnedId, $lt: cursor },
      });
      expect(Comment.findOne).not.toHaveBeenCalled();
      expect(result.comments).toEqual([{ _id: 'older' }]);
    });

    it('refuses a malformed cursor', async () => {
      await expect(videoService.getComments(videoId.toString(), { before: 'nope' }, null)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('applies the visibility rule of the video', async () => {
      Video.findById.mockReturnValue(chain(playable({ visibility: 'private' })));
      await expect(videoService.getComments(videoId.toString(), {}, { _id: viewerId })).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('getReplies', () => {
    it('returns the replies of a top-level comment oldest first', async () => {
      const parentId = id();
      Comment.findById.mockReturnValue(chain({ _id: parentId, video: videoId, parentComment: null }));
      Video.findById.mockReturnValue(chain(playable()));
      const replies = chain([{ _id: 'r1' }, { _id: 'r2' }]);
      Comment.find.mockReturnValue(replies);
      Comment.countDocuments.mockResolvedValue(2);

      const result = await videoService.getReplies(parentId.toString(), { limit: 20 }, null);

      expect(Comment.find).toHaveBeenCalledWith({ parentComment: parentId.toString() });
      expect(replies.sort).toHaveBeenCalledWith({ _id: 1 });
      expect(result).toEqual({ replies: [{ _id: 'r1' }, { _id: 'r2' }], total: 2, nextCursor: null });
    });

    it('continues after the cursor', async () => {
      const parentId = id();
      const cursor = id().toString();
      Comment.findById.mockReturnValue(chain({ _id: parentId, video: videoId, parentComment: null }));
      Video.findById.mockReturnValue(chain(playable()));
      Comment.find.mockReturnValue(chain([]));
      Comment.countDocuments.mockResolvedValue(20);

      await videoService.getReplies(parentId.toString(), { limit: 20, after: cursor }, null);

      expect(Comment.find).toHaveBeenCalledWith({ parentComment: parentId.toString(), _id: { $gt: cursor } });
    });

    it('treats a reply id as not found, since replies have no replies', async () => {
      Comment.findById.mockReturnValue(chain({ _id: id(), video: videoId, parentComment: id() }));
      await expect(videoService.getReplies(id().toString(), {}, null)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('refuses a malformed id', async () => {
      await expect(videoService.getReplies('not-an-id', {}, null)).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('addComment', () => {
    const created = (doc) => ({ ...doc, populate: jest.fn().mockResolvedValue(doc) });

    beforeEach(() => {
      Video.findById.mockReturnValue(chain(playable()));
      Comment.create.mockImplementation(async (doc) => created(doc));
      Comment.updateOne.mockResolvedValue({});
    });

    it('adds a top-level comment without a parent', async () => {
      await videoService.addComment(videoId.toString(), viewerId, 'Nice video');

      expect(Comment.create).toHaveBeenCalledWith({ video: videoId.toString(), user: viewerId, content: 'Nice video', parentComment: null });
      expect(Comment.updateOne).not.toHaveBeenCalled();
    });

    it('files a reply under its top-level comment and counts it', async () => {
      const topId = id();
      Comment.findById.mockReturnValue(chain({ _id: topId, video: videoId, parentComment: null }));

      await videoService.addComment(videoId.toString(), viewerId, 'Agreed', topId.toString());

      expect(Comment.create).toHaveBeenCalledWith(expect.objectContaining({ parentComment: topId }));
      expect(Comment.updateOne).toHaveBeenCalledWith({ _id: topId }, { $inc: { replyCount: 1 } });
    });

    it('files a reply to a reply under the same top-level comment', async () => {
      const topId = id();
      Comment.findById.mockReturnValue(chain({ _id: id(), video: videoId, parentComment: topId }));

      await videoService.addComment(videoId.toString(), viewerId, 'Me too', id().toString());

      expect(Comment.create).toHaveBeenCalledWith(expect.objectContaining({ parentComment: topId }));
      expect(Comment.updateOne).toHaveBeenCalledWith({ _id: topId }, { $inc: { replyCount: 1 } });
    });

    it('refuses a parent that belongs to another video', async () => {
      Comment.findById.mockReturnValue(chain({ _id: id(), video: id(), parentComment: null }));

      await expect(videoService.addComment(videoId.toString(), viewerId, 'Hi', id().toString())).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(Comment.create).not.toHaveBeenCalled();
    });
  });

  describe('deleteComment', () => {
    beforeEach(() => {
      Comment.findByIdAndDelete.mockResolvedValue({});
      Comment.deleteMany.mockResolvedValue({});
      Comment.updateOne.mockResolvedValue({});
      Video.updateOne.mockResolvedValue({});
    });

    it('deletes the replies of a top-level comment and unpins it', async () => {
      const commentId = id();
      Comment.findById.mockReturnValue(
        chain({ _id: commentId, user: viewerId, parentComment: null, video: { _id: videoId, user: ownerId, pinnedComment: commentId } })
      );

      await videoService.deleteComment(commentId.toString(), ownerId);

      expect(Comment.deleteMany).toHaveBeenCalledWith({ parentComment: commentId.toString() });
      expect(Video.updateOne).toHaveBeenCalledWith({ _id: videoId, pinnedComment: commentId }, { $set: { pinnedComment: null } });
    });

    it('lowers the reply count when a reply is deleted', async () => {
      const topId = id();
      Comment.findById.mockReturnValue(
        chain({ _id: id(), user: viewerId, parentComment: topId, video: { _id: videoId, user: ownerId, pinnedComment: null } })
      );

      await videoService.deleteComment(id().toString(), viewerId);

      expect(Comment.updateOne).toHaveBeenCalledWith({ _id: topId, replyCount: { $gt: 0 } }, { $inc: { replyCount: -1 } });
      expect(Comment.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('setPinnedComment', () => {
    beforeEach(() => Video.updateOne.mockResolvedValue({}));

    it('lets the owner pin a top-level comment of the video', async () => {
      const commentId = id();
      Video.findOne.mockReturnValue(chain({ _id: videoId }));
      Comment.findOne.mockReturnValue(chain({ _id: commentId }));

      const result = await videoService.setPinnedComment(videoId.toString(), ownerId, commentId.toString());

      expect(Video.findOne).toHaveBeenCalledWith({ _id: videoId.toString(), user: ownerId });
      expect(Comment.findOne).toHaveBeenCalledWith({ _id: commentId.toString(), video: videoId.toString(), parentComment: null });
      expect(Video.updateOne).toHaveBeenCalledWith({ _id: videoId.toString() }, { $set: { pinnedComment: commentId.toString() } });
      expect(result.pinnedCommentId).toBe(commentId.toString());
    });

    it('unpins with null', async () => {
      Video.findOne.mockReturnValue(chain({ _id: videoId }));

      await videoService.setPinnedComment(videoId.toString(), ownerId, null);

      expect(Comment.findOne).not.toHaveBeenCalled();
      expect(Video.updateOne).toHaveBeenCalledWith({ _id: videoId.toString() }, { $set: { pinnedComment: null } });
    });

    it('refuses anyone but the owner', async () => {
      Video.findOne.mockReturnValue(chain(null));

      await expect(videoService.setPinnedComment(videoId.toString(), viewerId, id().toString())).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(Video.updateOne).not.toHaveBeenCalled();
    });

    it('refuses a reply or a comment of another video', async () => {
      Video.findOne.mockReturnValue(chain({ _id: videoId }));
      Comment.findOne.mockReturnValue(chain(null));

      await expect(videoService.setPinnedComment(videoId.toString(), ownerId, id().toString())).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(Video.updateOne).not.toHaveBeenCalled();
    });
  });
});
