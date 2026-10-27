/**
 * The Lambda handler loads the secrets before anything that needs them:
 * connectDB reads MONGODB_URI, and server.js checks MONGODB_URI and JWT_SECRET
 * when it loads (config/validateEnv.js).
 */

const mockSecrets = {
  'arn:test:mongodb-uri': 'mongodb://from-secrets-manager/db',
  'arn:test:jwt-secret': 'j'.repeat(64),
};
const mockSeen = { connectDB: null, serverLoad: null };

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({
    send: jest.fn(async (command) => ({ SecretString: mockSecrets[command.input.SecretId] })),
  })),
  GetSecretValueCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

jest.mock('../src/config/db', () =>
  jest.fn(async () => {
    mockSeen.connectDB = process.env.MONGODB_URI;
  })
);

jest.mock('../src/server', () => {
  mockSeen.serverLoad = process.env.JWT_SECRET;
  const express = require('express');
  const app = express();
  app.get('/health', (req, res) => res.json({ ok: true }));
  return app;
});

jest.mock('../src/services/videoReconciler', () => ({ reconcileStuckVideos: jest.fn(async () => ({})) }));

describe('Lambda handler with secrets from Secrets Manager', () => {
  const saved = {};
  const names = ['MONGODB_URI', 'JWT_SECRET', 'MONGODB_URI_SECRET_ARN', 'JWT_SECRET_SECRET_ARN'];

  beforeAll(() => {
    for (const n of names) saved[n] = process.env[n];
    delete process.env.MONGODB_URI;
    delete process.env.JWT_SECRET;
    process.env.MONGODB_URI_SECRET_ARN = 'arn:test:mongodb-uri';
    process.env.JWT_SECRET_SECRET_ARN = 'arn:test:jwt-secret';
  });

  afterAll(() => {
    for (const n of names) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
  });

  it('connects and loads the app only after the secrets are in process.env', async () => {
    const { handler } = require('../src/lambda');
    expect(mockSeen.serverLoad).toBeNull(); // server.js is not required at module load any more

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
    expect(mockSeen.connectDB).toBe(mockSecrets['arn:test:mongodb-uri']);
    expect(mockSeen.serverLoad).toBe(mockSecrets['arn:test:jwt-secret']);
  });
});
