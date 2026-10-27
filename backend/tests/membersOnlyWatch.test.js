process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/test_video_db';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_at_least_32_characters_long_for_ci';

jest.mock('../src/config/db', () => jest.fn().mockResolvedValue({}));

const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/server');
const videoService = require('../src/services/videoService');
const Video = require('../src/models/Video');
const User = require('../src/models/User');
const ChannelMembership = require('../src/models/ChannelMembership');

/**
 * A members-only video opens for a non-member as a locked page (title,
 * channel, thumbnail and a join prompt), not as an error. The service used to
 * hand the controller a plain copy of the document, so toJSON() threw and
 * every non-member got HTTP 500. These tests use real Mongoose documents,
 * which is what the plain-object mocks elsewhere could not catch.
 */
describe('members-only video', () => {
  const channel = new User({ username: 'channel', displayName: 'Channel' });
  const HLS_URL = 'https://cdn.example/videos/abc/master.m3u8';
  const THUMBNAIL_URL = 'https://cdn.example/videos/abc/thumbnail.jpg';

  const buildVideo = (fields = {}) =>
    new Video({
      title: 'Members cut',
      user: channel,
      status: 'READY',
      visibility: 'public',
      accessLevel: 'members_only',
      requiredTierLevel: 1,
      hlsUrl: HLS_URL,
      thumbnailUrl: THUMBNAIL_URL,
      multipartUploadId: 'upload-id',
      likes: [new mongoose.Types.ObjectId()],
      ...fields,
    });

  let video;
  beforeEach(() => {
    video = buildVideo();
    jest.spyOn(Video, 'findById').mockReturnValue({ populate: jest.fn().mockResolvedValue(video) });
    jest.spyOn(ChannelMembership, 'exists').mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens the watch page as locked for a guest, without the playlist URL', async () => {
    const res = await request(app).get(`/api/videos/${video._id}`);

    expect(res.status).toBe(200);
    const body = res.body.data.video;
    expect(body).toMatchObject({
      title: 'Members cut',
      isLocked: true,
      lockedReason: 'MEMBERS_ONLY',
      thumbnailUrl: THUMBNAIL_URL,
      likesCount: 1,
      viewerReaction: null,
    });
    expect(body.user).toMatchObject({ username: 'channel' });
    expect(body).not.toHaveProperty('hlsUrl');
    expect(body).not.toHaveProperty('likes');
    expect(body).not.toHaveProperty('multipartUploadId');
  });

  it('refuses playback cookies to a guest with 403 MEMBERS_ONLY_CONTENT', async () => {
    const res = await request(app).get(`/api/videos/${video._id}/playback-auth`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MEMBERS_ONLY_CONTENT');
  });

  // The visibility, status and moderation checks run before the members-only
  // check, so a non-member learns nothing more than any other stranger.
  it.each([
    ['private', { visibility: 'private' }, 404, undefined],
    ['still processing', { status: 'PROCESSING' }, 400, undefined],
    ['under review', { moderation: { status: 'flagged' } }, 403, 'VIDEO_UNDER_REVIEW'],
    ['removed', { moderation: { status: 'blocked' } }, 403, 'VIDEO_REMOVED'],
  ])('answers a %s members-only video like any other one', async (_label, fields, status, code) => {
    video = buildVideo(fields);
    Video.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(video) });
    const stranger = { _id: new mongoose.Types.ObjectId(), role: 'user' };

    const res = await request(app).get(`/api/videos/${video._id}`);

    expect(res.status).toBe(status);
    if (code) expect(res.body.code).toBe(code);
    expect(JSON.stringify(res.body)).not.toContain('Members cut');

    // A signed-in stranger gets the same answer without a membership query.
    await expect(videoService.getVideoById(video._id, stranger)).rejects.toMatchObject({ statusCode: status });
    expect(ChannelMembership.exists).not.toHaveBeenCalled();
  });

  it('plays normally for an active member', async () => {
    ChannelMembership.exists.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
    const member = { _id: new mongoose.Types.ObjectId(), role: 'user' };

    const result = await videoService.getPlayableVideo(video._id, member);
    const body = videoService.toViewerJSON(result, member);

    expect(videoService.lockReasonOf(result)).toBeNull();
    expect(body.hlsUrl).toBe(HLS_URL);
    expect(body).not.toHaveProperty('isLocked');
  });
});
