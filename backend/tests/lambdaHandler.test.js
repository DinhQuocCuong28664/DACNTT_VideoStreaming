process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/test_video_db';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_at_least_32_characters_long_for_ci';

const mongoose = require('mongoose');

// Mock connectDB
jest.mock('../src/config/db', () => jest.fn().mockResolvedValue({}));

// Mock videoReconciler
jest.mock('../src/services/videoReconciler', () => ({
  reconcileStuckVideos: jest.fn().mockResolvedValue({
    stuckProcessing: 1,
    deletedDrafts: 2,
    orphanedUploads: 0,
  }),
}));

const { handler, reconcilerHandler, isScheduledEvent } = require('../src/lambda');
const { reconcileStuckVideos } = require('../src/services/videoReconciler');

// The event EventBridge delivers for a `rate(...)` schedule rule.
const scheduledEvent = {
  version: '0',
  id: '53dc4d37-cffa-4f76-80c9-8b7d4a4d2eaa',
  'detail-type': 'Scheduled Event',
  source: 'aws.events',
  account: '123456789012',
  time: '2026-10-27T07:35:00Z',
  region: 'ap-southeast-1',
  resources: ['arn:aws:events:ap-southeast-1:123456789012:rule/dacntt-dev-reconciler-schedule'],
  detail: {},
};

describe('AWS Lambda Handlers', () => {
  beforeAll(() => {
    // Mock mongoose readyState as 1 (connected)
    Object.defineProperty(mongoose.connection, 'readyState', {
      value: 1,
      configurable: true,
    });
  });

  it('xử lý HTTP request qua Lambda Function URL (GET /health)', async () => {
    const mockEvent = {
      version: '2.0',
      routeKey: '$default',
      rawPath: '/health',
      rawQueryString: '',
      headers: {
        host: 'api.zelostech.site',
        'user-agent': 'Jest-Test',
      },
      requestContext: {
        http: {
          method: 'GET',
          path: '/health',
          protocol: 'HTTP/1.1',
          sourceIp: '127.0.0.1',
          userAgent: 'Jest-Test',
        },
      },
      isBase64Encoded: false,
    };

    const mockContext = {
      callbackWaitsForEmptyEventLoop: true,
    };

    const response = await handler(mockEvent, mockContext);

    expect(mockContext.callbackWaitsForEmptyEventLoop).toBe(false);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.database).toBe('connected');
    expect(body.message).toContain('DACNTT Video Streaming API is running');
    expect(body.version).toBe('1.0.0');
  });

  it('xử lý EventBridge scheduled trigger cho reconcilerHandler', async () => {
    const mockContext = {
      callbackWaitsForEmptyEventLoop: true,
    };

    const response = await reconcilerHandler({}, mockContext);

    expect(mockContext.callbackWaitsForEmptyEventLoop).toBe(false);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.stuckProcessing).toBe(1);
    expect(body.deletedDrafts).toBe(2);
  });

  it('routes a scheduled EventBridge event sent to the main handler to the reconciler', async () => {
    reconcileStuckVideos.mockClear();
    const mockContext = { callbackWaitsForEmptyEventLoop: true };

    const response = await handler(scheduledEvent, mockContext);

    expect(reconcileStuckVideos).toHaveBeenCalledTimes(1);
    expect(mockContext.callbackWaitsForEmptyEventLoop).toBe(false);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ stuckProcessing: 1, deletedDrafts: 2, orphanedUploads: 0 });
  });

  it('does not run the reconciler for an HTTP request', async () => {
    reconcileStuckVideos.mockClear();
    const response = await handler(
      {
        version: '2.0',
        routeKey: '$default',
        rawPath: '/health',
        rawQueryString: '',
        headers: { host: 'api.zelostech.site' },
        requestContext: { http: { method: 'GET', path: '/health', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1' } },
        isBase64Encoded: false,
      },
      {}
    );

    expect(response.statusCode).toBe(200);
    expect(reconcileStuckVideos).not.toHaveBeenCalled();
  });

  it('recognises only EventBridge scheduled events', () => {
    expect(isScheduledEvent(scheduledEvent)).toBe(true);
    expect(isScheduledEvent({ ...scheduledEvent, 'detail-type': 'Object Created' })).toBe(false);
    expect(isScheduledEvent({ source: 'aws.events' })).toBe(false);
    expect(isScheduledEvent(null)).toBe(false);
    expect(isScheduledEvent({ requestContext: { http: { method: 'GET' } } })).toBe(false);
  });
});
