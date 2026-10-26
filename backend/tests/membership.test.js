const mongoose = require('mongoose');
const membershipService = require('../src/services/membershipService');
const videoService = require('../src/services/videoService');
const MembershipTier = require('../src/models/MembershipTier');
const ChannelMembership = require('../src/models/ChannelMembership');
const User = require('../src/models/User');
const Video = require('../src/models/Video');

jest.mock('../src/models/MembershipTier');
jest.mock('../src/models/ChannelMembership');
jest.mock('../src/models/User');
jest.mock('../src/models/Video');

describe('Channel Membership Service Tests', () => {
  const userId = new mongoose.Types.ObjectId();
  const channelId = new mongoose.Types.ObjectId();
  const tierId = new mongoose.Types.ObjectId();

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getChannelTiers()', () => {
    it('rejects if channel ID is missing with 400', async () => {
      await expect(membershipService.getChannelTiers(null)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('rejects if target channel does not exist with 404', async () => {
      User.exists.mockResolvedValue(null);
      await expect(membershipService.getChannelTiers(channelId)).rejects.toMatchObject({
        statusCode: 404,
        errorCode: 'CHANNEL_NOT_FOUND',
      });
    });

    it('returns default tier if creator has not configured custom tiers', async () => {
      User.exists.mockResolvedValue({ _id: channelId });
      MembershipTier.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([]),
      });

      const tiers = await membershipService.getChannelTiers(channelId);
      expect(tiers).toHaveLength(1);
      expect(tiers[0].isDefault).toBe(true);
      expect(tiers[0].price).toBe(50000);
      expect(tiers[0].name).toContain('Fan Cứng');
    });

    it('returns active creator tiers when configured', async () => {
      User.exists.mockResolvedValue({ _id: channelId });
      const customTiers = [
        { _id: tierId, name: 'VIP Gold', price: 100000, level: 2, isActive: true },
      ];
      MembershipTier.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(customTiers),
      });

      const tiers = await membershipService.getChannelTiers(channelId);
      expect(tiers).toEqual(customTiers);
    });
  });

  describe('createOrUpdateTier()', () => {
    it('rejects non-owner with 403', async () => {
      const strangerUser = { _id: new mongoose.Types.ObjectId() };
      await expect(
        membershipService.createOrUpdateTier(channelId, { name: 'VIP', price: 50000 }, strangerUser)
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: 'FORBIDDEN',
      });
    });

    it('rejects missing name or price with 400', async () => {
      const ownerUser = { _id: channelId };
      await expect(
        membershipService.createOrUpdateTier(channelId, { name: '', price: 'invalid' }, ownerUser)
      ).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('creates a new tier successfully for channel owner', async () => {
      const ownerUser = { _id: channelId };
      const createdTier = { _id: tierId, name: 'Silver Member', price: 30000, level: 1 };
      MembershipTier.create.mockResolvedValue(createdTier);

      const result = await membershipService.createOrUpdateTier(
        channelId,
        { name: 'Silver Member', price: 30000, level: 1 },
        ownerUser
      );

      expect(MembershipTier.create).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: channelId,
          name: 'Silver Member',
          price: 30000,
        })
      );
      expect(result).toEqual(createdTier);
    });
  });

  describe('joinMembership()', () => {
    it('rejects joining your own channel with 400 SELF_MEMBERSHIP', async () => {
      await expect(
        membershipService.joinMembership(channelId, channelId, tierId)
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: 'SELF_MEMBERSHIP',
      });
    });

    it('rejects if target channel does not exist with 404', async () => {
      User.exists.mockResolvedValue(null);
      await expect(
        membershipService.joinMembership(userId, channelId, tierId)
      ).rejects.toMatchObject({
        statusCode: 404,
        errorCode: 'CHANNEL_NOT_FOUND',
      });
    });

    it('upserts channel membership with 30-day validity', async () => {
      User.exists.mockResolvedValue({ _id: channelId });
      const mockTier = { _id: tierId, name: 'VIP Gold', level: 2, price: 100000 };
      MembershipTier.findOne.mockResolvedValue(mockTier);

      const mockMembership = {
        _id: new mongoose.Types.ObjectId(),
        user: userId,
        channel: channelId,
        tier: mockTier,
        status: 'active',
      };

      ChannelMembership.findOneAndUpdate.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockMembership),
      });

      const result = await membershipService.joinMembership(userId, channelId, tierId);

      expect(ChannelMembership.findOneAndUpdate).toHaveBeenCalledWith(
        { user: userId, channel: channelId },
        expect.objectContaining({
          $set: expect.objectContaining({
            tier: tierId,
            tierLevel: 2,
            status: 'active',
            autoRenew: true,
          }),
        }),
        expect.any(Object)
      );

      expect(result.isMember).toBe(true);
      expect(result.membership).toEqual(mockMembership);
    });
  });

  describe('cancelMembership()', () => {
    it('cancels active membership', async () => {
      ChannelMembership.findOneAndUpdate.mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        status: 'cancelled',
      });

      const result = await membershipService.cancelMembership(userId, channelId);
      expect(result.isMember).toBe(false);
    });

    it('returns isMember: false when no active membership found', async () => {
      ChannelMembership.findOneAndUpdate.mockResolvedValue(null);
      const result = await membershipService.cancelMembership(userId, channelId);
      expect(result.isMember).toBe(false);
    });
  });

  describe('getMembershipStatus()', () => {
    it('returns false for guest viewer without error', async () => {
      const result = await membershipService.getMembershipStatus(null, channelId);
      expect(result.isMember).toBe(false);
      expect(result.membership).toBeNull();
    });

    it('returns true and tier details for active member', async () => {
      const mockTier = { _id: tierId, name: 'Fan Cứng', level: 1 };
      const mockMembership = { _id: new mongoose.Types.ObjectId(), tier: mockTier, status: 'active' };

      ChannelMembership.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockMembership),
      });

      const result = await membershipService.getMembershipStatus(userId, channelId);
      expect(result.isMember).toBe(true);
      expect(result.tier).toEqual(mockTier);
    });
  });

  describe('getChannelMembers()', () => {
    it('rejects unauthorized viewer with 403', async () => {
      const strangerUser = { _id: new mongoose.Types.ObjectId(), role: 'user' };
      await expect(
        membershipService.getChannelMembers(channelId, strangerUser)
      ).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('returns active members roster and authoritative count for owner', async () => {
      const ownerUser = { _id: channelId, role: 'user' };
      const mockMembers = [{ _id: new mongoose.Types.ObjectId(), user: { username: 'john' } }];

      const chain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
      };
      chain.populate.mockReturnValueOnce(chain).mockResolvedValueOnce(mockMembers);

      ChannelMembership.find.mockReturnValue(chain);
      ChannelMembership.countDocuments.mockResolvedValue(1);

      const result = await membershipService.getChannelMembers(channelId, ownerUser);

      expect(result.members).toEqual(mockMembers);
      expect(result.totalActiveMembers).toBe(1);
    });
  });

  describe('Gated Video Playback in videoService', () => {
    it('locks members_only video for non-members in getVideoById', async () => {
      const mockVideo = {
        _id: new mongoose.Types.ObjectId(),
        title: 'Exclusive Behind the Scenes',
        user: { _id: channelId },
        visibility: 'public',
        accessLevel: 'members_only',
        requiredTierLevel: 1,
        status: 'READY',
        toObject: () => ({
          _id: new mongoose.Types.ObjectId(),
          title: 'Exclusive Behind the Scenes',
          user: { _id: channelId },
          visibility: 'public',
          accessLevel: 'members_only',
        }),
      };

      Video.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue(mockVideo),
      });

      ChannelMembership.exists.mockResolvedValue(false);

      const guestUser = { _id: new mongoose.Types.ObjectId() };
      const result = await videoService.getVideoById(mockVideo._id, guestUser);

      expect(result.isLocked).toBe(true);
      expect(result.lockedReason).toBe('MEMBERS_ONLY');
    });

    it('throws 403 MEMBERS_ONLY_CONTENT in getPlayableVideo when video is locked', async () => {
      const mockVideo = {
        _id: new mongoose.Types.ObjectId(),
        title: 'Exclusive Behind the Scenes',
        user: { _id: channelId },
        visibility: 'public',
        accessLevel: 'members_only',
        requiredTierLevel: 1,
        status: 'READY',
        toObject: () => ({
          _id: new mongoose.Types.ObjectId(),
          title: 'Exclusive Behind the Scenes',
          user: { _id: channelId },
          accessLevel: 'members_only',
        }),
      };

      Video.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue(mockVideo),
      });

      ChannelMembership.exists.mockResolvedValue(false);

      const guestUser = { _id: new mongoose.Types.ObjectId() };
      await expect(videoService.getPlayableVideo(mockVideo._id, guestUser)).rejects.toMatchObject({
        statusCode: 403,
        errorCode: 'MEMBERS_ONLY_CONTENT',
      });
    });

    it('allows channel owner to play members_only video freely', async () => {
      const mockVideo = {
        _id: new mongoose.Types.ObjectId(),
        title: 'Exclusive Behind the Scenes',
        user: { _id: channelId },
        visibility: 'public',
        accessLevel: 'members_only',
        status: 'READY',
        toObject: () => mockVideo,
      };

      Video.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue(mockVideo),
      });

      const ownerUser = { _id: channelId };
      const result = await videoService.getPlayableVideo(mockVideo._id, ownerUser);

      expect(result.isLocked).toBeUndefined();
      expect(result.title).toBe('Exclusive Behind the Scenes');
    });
  });
});
