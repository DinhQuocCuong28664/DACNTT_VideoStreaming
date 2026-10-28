/**
 * Lambda entry point behind the Function URL. The app is built once per instance; the key
 * endpoint's application/octet-stream body is returned base64-encoded with isBase64Encoded so
 * the 16 raw bytes survive the Lambda response format.
 */
import { configure as serverlessExpress } from '@codegenie/serverless-express';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { createApp, type Log } from './app.js';
import { loadConfig } from './config.js';
import { connect } from './db.js';
import { dynamoKv } from './kv.js';
import { Tokens } from './auth/tokens.js';
import { mongoSessionLookup } from './auth/sessions.js';
import { cachedSessions } from './http/middleware.js';
import { FEATURES } from './features/index.js';

const log: Log = (entry) => console.log(JSON.stringify(entry));

type Handler = (event: unknown, context: unknown) => Promise<unknown>;
let ready: Promise<Handler> | undefined;

async function init(): Promise<Handler> {
  const arn = process.env['API_SECRET_ARN'];
  if (!arn) throw new Error('API_SECRET_ARN is not set');
  const secret = await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: arn }));
  const config = loadConfig(process.env, secret.SecretString ?? '{}');
  const db = await connect(config.secrets.mongodbUri, config.dbName, config.mongoPoolSize);
  const app = createApp({
    config,
    db,
    kv: dynamoKv(),
    tokens: new Tokens(config.secrets.jwtSecret),
    sessions: cachedSessions(mongoSessionLookup(db)),
    log,
    now: () => new Date(),
  }, FEATURES);
  return serverlessExpress({ app, binarySettings: { contentTypes: ['application/octet-stream', 'image/*'] } }) as unknown as Handler;
}

export const handler: Handler = async (event, context) => {
  ready ??= init().catch((err: unknown) => { ready = undefined; throw err; });
  return (await ready)(event, context);
};
