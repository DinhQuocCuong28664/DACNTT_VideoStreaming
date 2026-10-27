process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/test_video_db';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_at_least_32_characters_long_for_ci';

jest.mock('../src/config/db', () => jest.fn().mockResolvedValue({}));

const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/server');
const User = require('../src/models/User');

/**
 * GET /api/users/:id is the channel header. It carries the subscriber count
 * (public, as on YouTube) and nothing private. The mock returns only the
 * fields the controller projects, as MongoDB would.
 */
describe('GET /api/users/:id', () => {
  const stored = {
    _id: new mongoose.Types.ObjectId(),
    username: 'channel',
    displayName: 'Channel',
    email: 'owner@example.test',
    password: 'hashed-password',
    channelDescription: 'About',
    subscribers: 3,
    createdAt: new Date('2026-10-01T00:00:00Z'),
  };

  beforeEach(() => {
    jest.spyOn(User, 'findById').mockReturnValue({
      select: (fields) => {
        const picked = { _id: stored._id };
        for (const name of fields.split(/\s+/)) if (name in stored) picked[name] = stored[name];
        return Promise.resolve(User.hydrate(picked));
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the subscriber count without private fields', async () => {
    const res = await request(app).get(`/api/users/${stored._id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ username: 'channel', subscribers: 3 });
    expect(res.body.data.user).not.toHaveProperty('email');
    expect(res.body.data.user).not.toHaveProperty('password');
  });
});
