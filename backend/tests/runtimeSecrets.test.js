const { loadRuntimeSecrets, resetRuntimeSecrets } = require('../src/config/runtimeSecrets');

/**
 * The Lambda backend reads its secrets from Secrets Manager when an execution
 * environment starts, instead of carrying them as plain environment variables.
 */

const ARN = (name) => `arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:dacntt-dev/${name}-AbCdEf`;

const fakeClient = (values, { fail = null } = {}) => ({
  send: jest.fn(async (command) => {
    if (fail) throw fail;
    const id = command.input.SecretId;
    if (!(id in values)) throw Object.assign(new Error(`not found ${id}`), { name: 'ResourceNotFoundException' });
    return { SecretString: values[id] };
  }),
});

beforeEach(() => resetRuntimeSecrets());

describe('loadRuntimeSecrets', () => {
  it('reads each missing variable from the secret its *_SECRET_ARN names', async () => {
    const env = {
      MONGODB_URI_SECRET_ARN: ARN('mongodb-uri'),
      JWT_SECRET_SECRET_ARN: ARN('jwt-secret'),
    };
    const client = fakeClient({ [ARN('mongodb-uri')]: 'mongodb+srv://u:p@cluster/db', [ARN('jwt-secret')]: 'x'.repeat(64) });

    const loaded = await loadRuntimeSecrets({ env, client });

    expect(loaded.sort()).toEqual(['JWT_SECRET', 'MONGODB_URI']);
    expect(env.MONGODB_URI).toBe('mongodb+srv://u:p@cluster/db');
    expect(env.JWT_SECRET).toBe('x'.repeat(64));
    expect(client.send).toHaveBeenCalledTimes(2);
  });

  it('keeps a variable that is already set, as local .env files do', async () => {
    const env = { JWT_SECRET: 'from-dotenv-'.padEnd(40, 'z'), JWT_SECRET_SECRET_ARN: ARN('jwt-secret') };
    const client = fakeClient({ [ARN('jwt-secret')]: 'from-secrets-manager' });

    expect(await loadRuntimeSecrets({ env, client })).toEqual([]);
    expect(env.JWT_SECRET).toBe('from-dotenv-'.padEnd(40, 'z'));
    expect(client.send).not.toHaveBeenCalled();
  });

  it('reads once per execution environment and shares the load between concurrent callers', async () => {
    const env = { CLOUDFRONT_PRIVATE_KEY_SECRET_ARN: ARN('cloudfront-private-key') };
    const client = fakeClient({ [ARN('cloudfront-private-key')]: '-----BEGIN PRIVATE KEY-----' });

    await Promise.all([loadRuntimeSecrets({ env, client }), loadRuntimeSecrets({ env, client })]);
    await loadRuntimeSecrets({ env, client });

    expect(client.send).toHaveBeenCalledTimes(1);
  });

  it('sets nothing when one secret fails, and tries again on the next call', async () => {
    const env = { MONGODB_URI_SECRET_ARN: ARN('mongodb-uri'), EMAIL_APP_PASSWORD_SECRET_ARN: ARN('email-app-password') };
    const failing = fakeClient({ [ARN('mongodb-uri')]: 'mongodb://ok' }); // the email secret is missing

    await expect(loadRuntimeSecrets({ env, client: failing })).rejects.toThrow('not found');
    expect(env.MONGODB_URI).toBeUndefined();

    const working = fakeClient({ [ARN('mongodb-uri')]: 'mongodb://ok', [ARN('email-app-password')]: 'abcd efgh ijkl mnop' });
    await loadRuntimeSecrets({ env, client: working });
    expect(env.MONGODB_URI).toBe('mongodb://ok');
    expect(env.EMAIL_APP_PASSWORD).toBe('abcd efgh ijkl mnop');
  });

  it('refuses a secret without a string value', async () => {
    const env = { JWT_SECRET_SECRET_ARN: ARN('jwt-secret') };
    const client = { send: jest.fn(async () => ({ SecretBinary: Buffer.from('x') })) };

    await expect(loadRuntimeSecrets({ env, client })).rejects.toThrow('JWT_SECRET has no string value');
    expect(env.JWT_SECRET).toBeUndefined();
  });

  it('does nothing without any *_SECRET_ARN', async () => {
    const client = fakeClient({});
    expect(await loadRuntimeSecrets({ env: { NODE_ENV: 'test' }, client })).toEqual([]);
    expect(client.send).not.toHaveBeenCalled();
  });
});
