const mongoose = require('mongoose');
const commentReportService = require('../src/services/commentReportService');
const videoService = require('../src/services/videoService');
const Video = require('../src/models/Video');
const Comment = require('../src/models/Comment');
const CommentReport = require('../src/models/CommentReport');

jest.mock('../src/models/Video');
jest.mock('../src/models/Comment');
jest.mock('../src/models/CommentReport');
jest.mock('../src/models/Report');
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
    lean: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};

describe('Comment reports', () => {
  const ownerId = id();
  const authorId = id();
  const reporter = { _id: id(), role: 'user' };
  const staff = { _id: id(), role: 'operator' };
  const videoId = id();
  const playable = (extra = {}) => ({
    _id: videoId,
    user: { _id: ownerId },
    visibility: 'public',
    status: 'READY',
    moderation: { status: 'approved' },
    ...extra,
  });

  afterEach(() => jest.clearAllMocks());

  describe('reportComment', () => {
    const commentId = id();

    beforeEach(() => {
      Comment.findById.mockReturnValue(chain({ _id: commentId, video: videoId, user: authorId }));
      Video.findById.mockReturnValue(chain(playable()));
      CommentReport.create.mockResolvedValue({});
      Comment.updateOne.mockResolvedValue({});
    });

    it('files a report and counts it on the comment', async () => {
      const result = await commentReportService.reportComment(commentId.toString(), reporter, {
        reason: 'spam',
        details: '  link farm  ',
      });

      expect(CommentReport.create).toHaveBeenCalledWith({
        comment: commentId,
        video: videoId,
        reporter: reporter._id,
        reason: 'spam',
        details: 'link farm',
      });
      expect(Comment.updateOne).toHaveBeenCalledWith({ _id: commentId }, { $inc: { openReports: 1 } });
      expect(result).toEqual({ alreadyReported: false });
    });

    it('treats a second open report by the same person as already reported', async () => {
      CommentReport.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));

      const result = await commentReportService.reportComment(commentId.toString(), reporter, { reason: 'spam' });

      expect(result).toEqual({ alreadyReported: true });
      expect(Comment.updateOne).not.toHaveBeenCalled();
    });

    it('refuses a reason outside the list', async () => {
      await expect(
        commentReportService.reportComment(commentId.toString(), reporter, { reason: 'boring' })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(CommentReport.create).not.toHaveBeenCalled();
    });

    it('refuses a report of one\'s own comment', async () => {
      await expect(
        commentReportService.reportComment(commentId.toString(), { _id: authorId, role: 'user' }, { reason: 'spam' })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('applies the visibility rule of the video', async () => {
      Video.findById.mockReturnValue(chain(playable({ visibility: 'private' })));

      await expect(
        commentReportService.reportComment(commentId.toString(), reporter, { reason: 'spam' })
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(CommentReport.create).not.toHaveBeenCalled();
    });

    it('returns 404 for a comment that is gone', async () => {
      Comment.findById.mockReturnValue(chain(null));
      await expect(
        commentReportService.reportComment(commentId.toString(), reporter, { reason: 'spam' })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('listReportedComments', () => {
    it('lists comments with open reports, most reported first, with counts per reason', async () => {
      const c1 = id();
      const query = chain([{ _id: c1, content: 'buy now', openReports: 3 }]);
      Comment.find.mockReturnValue(query);
      Comment.countDocuments.mockResolvedValue(1);
      CommentReport.aggregate.mockResolvedValue([
        { _id: { comment: c1, reason: 'spam' }, count: 2 },
        { _id: { comment: c1, reason: 'harassment' }, count: 1 },
      ]);

      const result = await commentReportService.listReportedComments({ page: 1, limit: 20 });

      expect(Comment.find).toHaveBeenCalledWith({ openReports: { $gt: 0 } });
      expect(query.sort).toHaveBeenCalledWith({ openReports: -1, _id: -1 });
      expect(result.comments[0].reportReasons).toEqual({ spam: 2, harassment: 1 });
      expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1, pages: 1 });
    });
  });

  describe('resolveCommentReports', () => {
    const commentId = id();
    const loaded = () => ({
      _id: commentId,
      content: 'rude words',
      user: authorId,
      parentComment: null,
      video: { _id: videoId, user: ownerId, pinnedComment: null },
    });

    beforeEach(() => {
      Comment.findById.mockReturnValue(chain(loaded()));
      CommentReport.updateMany.mockResolvedValue({ modifiedCount: 2 });
      Comment.updateOne.mockResolvedValue({});
    });

    it('dismisses the open reports and recounts the comment', async () => {
      CommentReport.countDocuments.mockResolvedValue(0);

      const result = await commentReportService.resolveCommentReports(commentId.toString(), staff, { decision: 'dismiss' });

      expect(CommentReport.updateMany).toHaveBeenCalledWith(
        { comment: commentId, status: 'open' },
        { $set: expect.objectContaining({ status: 'dismissed', resolvedBy: staff._id }) }
      );
      expect(Comment.updateOne).toHaveBeenCalledWith({ _id: commentId }, { $set: { openReports: 0 } });
      expect(Comment.findByIdAndDelete).not.toHaveBeenCalled();
      expect(result).toEqual({ decision: 'dismiss', resolved: 2 });
    });

    it('removes the comment and keeps its text in the actioned reports', async () => {
      const remove = jest.spyOn(videoService, 'removeComment').mockResolvedValue();

      const result = await commentReportService.resolveCommentReports(commentId.toString(), staff, { decision: 'remove' });

      expect(CommentReport.updateMany).toHaveBeenCalledWith(
        { comment: commentId, status: 'open' },
        {
          $set: expect.objectContaining({
            status: 'actioned',
            resolvedBy: staff._id,
            commentText: 'rude words',
            commentAuthor: authorId,
          }),
        }
      );
      expect(remove).toHaveBeenCalledWith(expect.objectContaining({ _id: commentId }));
      expect(result).toEqual({ decision: 'remove', resolved: 2 });
      remove.mockRestore();
    });

    it('refuses an unknown decision', async () => {
      await expect(
        commentReportService.resolveCommentReports(commentId.toString(), staff, { decision: 'ban' })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('returns 404 for a comment that is gone', async () => {
      Comment.findById.mockReturnValue(chain(null));
      await expect(
        commentReportService.resolveCommentReports(commentId.toString(), staff, { decision: 'dismiss' })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('removeComment', () => {
    beforeEach(() => {
      Comment.findByIdAndDelete.mockResolvedValue({});
      Comment.deleteMany.mockResolvedValue({});
      Comment.updateOne.mockResolvedValue({});
      CommentReport.deleteMany.mockResolvedValue({});
      Video.updateOne.mockResolvedValue({});
    });

    it('drops the open reports of a comment and of its replies', async () => {
      const topId = id();
      const replyId = id();
      Comment.find.mockReturnValue(chain([{ _id: replyId }]));

      await videoService.removeComment({
        _id: topId,
        parentComment: null,
        video: { _id: videoId, user: ownerId, pinnedComment: null },
      });

      expect(Comment.deleteMany).toHaveBeenCalledWith({ parentComment: topId });
      expect(CommentReport.deleteMany).toHaveBeenCalledWith({ comment: { $in: [topId, replyId] }, status: 'open' });
    });
  });
});
