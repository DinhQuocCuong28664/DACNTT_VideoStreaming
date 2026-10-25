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

const { handler, reconcilerHandler } = require('../src/lambda');

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
});
