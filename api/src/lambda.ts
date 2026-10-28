/**
 * Lambda entry point behind the Function URL. The app is built once per instance; the key
 * endpoint's application/octet-stream body is returned base64-encoded with isBase64Encoded so
 * the 16 raw bytes survive the Lambda response format.
 */
import { configure as serverlessExpress } from '@codegenie/serverless-express';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { createApp, type Log } from './app.js';
import { loadConfig } from './config.js';
import { connect, ensureIndexes } from './db.js';
import { dynamoKv } from './kv.js';
import { Tokens } from './auth/tokens.js';
import { mongoSessionLookup } from './auth/sessions.js';
import { cachedSessions } from './http/middleware.js';
import { FEATURES } from './features/index.js';
import { bcryptPasswords } from './auth/passwords.js';
import { googleVerifier } from './auth/google.js';
import { cappedMailer, gmailMailer, memoryMailer } from './services/mail.js';
import { s3Storage } from './services/storage.js';
import { cloudFrontCdn } from './services/cdn.js';
import { dynamoActivity } from './services/activity.js';
import { eventBridgeScheduler } from './services/scheduler.js';
import { rekognitionScreener } from './services/images.js';

const log: Log = (entry) => console.log(JSON.stringify(entry));

type Handler = (event: unknown, context: unknown) => Promise<unknown>;
let ready: Promise<Handler> | undefined;

async function init(): Promise<Handler> {
  const arn = process.env['API_SECRET_ARN'];
  if (!arn) throw new Error('API_SECRET_ARN is not set');
  const secret = await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: arn }));
  const config = loadConfig(process.env, secret.SecretString ?? '{}');
  const db = await connect(config.secrets.mongodbUri, config.dbName, config.mongoPoolSize);
  await ensureIndexes(db);
  const kv = dynamoKv();
  const now = () => new Date();
  const { smtpUser, smtpPassword } = config.secrets;
  const mailer = smtpUser && smtpPassword ? gmailMailer(smtpUser, smtpPassword) : memoryMailer();
  const app = createApp({
    config,
    db,
    kv,
    tokens: new Tokens(config.secrets.jwtSecret),
    sessions: cachedSessions(mongoSessionLookup(db)),
    log,
    now,
    passwords: bcryptPasswords(),
    google: googleVerifier(config.secrets.googleClientId),
    mail: cappedMailer(mailer, kv, config.tables.rateLimits, log, now),
    storage: s3Storage(),
    activity: dynamoActivity(config.tables),
    scheduler: eventBridgeScheduler(config.schedule),
    screenImage: rekognitionScreener(),
    cdn: cloudFrontCdn(config.cdnBaseUrl, config.secrets.cloudfrontKeyPairId, config.secrets.cloudfrontPrivateKey),
  }, FEATURES);
  return serverlessExpress({ app, binarySettings: { contentTypes: ['application/octet-stream', 'image/*'] } }) as unknown as Handler;
}

export const handler: Handler = async (event, context) => {
  ready ??= init().catch((err: unknown) => { ready = undefined; throw err; });
  return (await ready)(event, context);
};
