const mongoose = require('mongoose');
const subscriptionService = require('../src/services/subscriptionService');
const Subscription = require('../src/models/Subscription');
const User = require('../src/models/User');
const Video = require('../src/models/Video');

jest.mock('../src/models/Subscription');
jest.mock('../src/models/User');
jest.mock('../src/models/Video');

describe('Subscription Service Tests', () => {
  const subscriberId = new mongoose.Types.ObjectId();
  const channelId = new mongoose.Types.ObjectId();

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('subscribe()', () => {
    it('rejects subscribing to your own channel with 400', async () => {
      await expect(subscriptionService.subscribe(subscriberId, subscriberId)).rejects.toMatchObject({
        statusCode: 400,
        errorCode: 'SELF_SUBSCRIPTION',
      });
    });

    it('rejects if target channel does not exist with 404', async () => {
      User.exists.mockResolvedValue(null);

      await expect(subscriptionService.subscribe(subscriberId, channelId)).rejects.toMatchObject({
        statusCode: 404,
        errorCode: 'CHANNEL_NOT_FOUND',
      });
    });

    it('creates subscription and updates subscriber count', async () => {
      User.exists.mockResolvedValue({ _id: channelId });
      Subscription.create.mockResolvedValue({ subscriber: subscriberId, channel: channelId });
      Subscription.countDocuments.mockResolvedValue(10);
      User.findByIdAndUpdate.mockResolvedValue({ _id: channelId, subscribers: 10 });

      const result = await subscriptionService.subscribe(subscriberId, channelId);

      expect(Subscription.create).toHaveBeenCalledWith({ subscriber: subscriberId, channel: channelId });
      expect(Subscription.countDocuments).toHaveBeenCalledWith({ channel: channelId });
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(channelId, { subscribers: 10 });
      expect(result).toEqual({ isSubscribed: true, subscribersCount: 10 });
    });

    it('handles duplicate subscription gracefully (idempotency)', async () => {
      User.exists.mockResolvedValue({ _id: channelId });
      const dupError = new Error('E11000 duplicate key');
      dupError.code = 11000;
      Subscription.create.mockRejectedValue(dupError);
      Subscription.countDocuments.mockResolvedValue(10);
      User.findByIdAndUpdate.mockResolvedValue({ _id: channelId, subscribers: 10 });

      const result = await subscriptionService.subscribe(subscriberId, channelId);
      expect(Subscription.countDocuments).toHaveBeenCalledWith({ channel: channelId });
      expect(result).toEqual({ isSubscribed: true, subscribersCount: 10 });
    });
  });

  describe('unsubscribe()', () => {
    it('rejects unsubscribing from self with 400', async () => {
      await expect(subscriptionService.unsubscribe(subscriberId, subscriberId)).rejects.toMatchObject({
        statusCode: 400,
        errorCode: 'SELF_UNSUBSCRIPTION',
      });
    });

    it('removes subscription and updates subscriber count', async () => {
      Subscription.findOneAndDelete.mockResolvedValue({ subscriber: subscriberId, channel: channelId });
      Subscription.countDocuments.mockResolvedValue(9);
      User.findByIdAndUpdate.mockResolvedValue({ _id: channelId, subscribers: 9 });

      const result = await subscriptionService.unsubscribe(subscriberId, channelId);

      expect(Subscription.findOneAndDelete).toHaveBeenCalledWith({ subscriber: subscriberId, channel: channelId });
      expect(Subscription.countDocuments).toHaveBeenCalledWith({ channel: channelId });
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(channelId, { subscribers: 9 });
      expect(result).toEqual({ isSubscribed: false, subscribersCount: 9 });
    });

    it('returns isSubscribed: false even if not currently subscribed', async () => {
      Subscription.findOneAndDelete.mockResolvedValue(null);
      Subscription.countDocuments.mockResolvedValue(0);
      User.findByIdAndUpdate.mockResolvedValue({ _id: channelId, subscribers: 0 });

      const result = await subscriptionService.unsubscribe(subscriberId, channelId);

      expect(Subscription.findOneAndDelete).toHaveBeenCalledWith({ subscriber: subscriberId, channel: channelId });
      expect(Subscription.countDocuments).toHaveBeenCalledWith({ channel: channelId });
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(channelId, { subscribers: 0 });
      expect(result).toEqual({ isSubscribed: false, subscribersCount: 0 });
    });
  });

  describe('getSubscriptionStatus()', () => {
    it('returns false for guest viewer without error', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ _id: channelId, subscribers: 42 }),
      });

      const result = await subscriptionService.getSubscriptionStatus(null, channelId);
      expect(result).toEqual({ isSubscribed: false, subscribersCount: 42 });
    });

    it('returns true if authenticated viewer is subscribed', async () => {
      Subscription.exists.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ _id: channelId, subscribers: 42 }),
      });

      const result = await subscriptionService.getSubscriptionStatus(subscriberId, channelId);
      expect(result).toEqual({ isSubscribed: true, subscribersCount: 42 });
    });
  });

  describe('getSubscriptionFeed()', () => {
    it('returns empty videos if user subscribes to no channels', async () => {
      Subscription.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([]),
      });

      const result = await subscriptionService.getSubscriptionFeed(subscriberId);
      expect(result.videos).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });

    it('queries public ready videos from followed channels', async () => {
      const channel1 = new mongoose.Types.ObjectId();
      const channel2 = new mongoose.Types.ObjectId();

      Subscription.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([{ channel: channel1 }, { channel: channel2 }]),
      });

      const mockVideos = [
        { _id: new mongoose.Types.ObjectId(), title: 'Video 1', user: channel1 },
        { _id: new mongoose.Types.ObjectId(), title: 'Video 2', user: channel2 },
      ];

      const chain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue(mockVideos),
      };

      Video.find.mockReturnValue(chain);
      Video.countDocuments.mockResolvedValue(2);

      const result = await subscriptionService.getSubscriptionFeed(subscriberId, { page: 1, limit: 10 });

      // Flagged videos are under review and answer 403 when played, so the
      // feed hides them as every other public listing does.
      expect(Video.find).toHaveBeenCalledWith({
        user: { $in: [channel1, channel2] },
        status: 'READY',
        visibility: 'public',
        'moderation.status': { $nin: ['flagged', 'blocked'] },
      });
      expect(Video.countDocuments).toHaveBeenCalledWith(Video.find.mock.calls[0][0]);
      expect(result.videos).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
    });
  });
});
