#!/usr/bin/env node
/**
 * Seeds a fresh v2 environment (docs/ops/cutover.md, step "Seed").
 *
 *   node scripts/seed.mjs role --env prod --email owner@example.com --role admin
 *     Gives an existing account a staff role. Its sessions are revoked (tokenVersion + 1),
 *     so the next sign-in carries the new role.
 *
 *   node scripts/seed.mjs demo --env prod --manifest .local-notes/demo-videos.json
 *     Creates the demo channel through the public API (once), marks its e-mail as verified and
 *     uploads every video of the manifest the way the web app does, so each one runs through
 *     the real pipeline. The manifest is a JSON array of { "file", "title", "description" }.
 *     The account's generated password is kept in .local-notes/<env>-demo-account.json
 *     (git-ignored) and never printed.
 *
 *   node scripts/seed.mjs e2e --env prod
 *     Creates the E2E test accounts (creator with the admin role, viewer) with verified e-mail
 *     and writes them to .local-notes/<env>-e2e-accounts.json, the E2E_ACCOUNTS format of
 *     e2e/global-setup.ts. Accounts that already exist in the file are kept.
 *
 *   node scripts/seed.mjs bench --env prod --count 5
 *     Creates bench.1 .. bench.N with verified e-mail for the upload burst of the measurements
 *     (an account may start 20 uploads an hour) in .local-notes/<env>-bench-accounts.json.
 *     The API allows five sign-ups an hour from one address.
 *
 *   node scripts/seed.mjs channels --env prod --manifest .local-notes/community-channels/channels.json
 *     Creates sample creator channels: account (verified e-mail), avatar, channel description and
 *     videos, all through the public API, so avatars pass the image screening and videos the real
 *     pipeline. The manifest is a JSON array of
 *       { "key", "handle", "displayName", "description", "avatar",
 *         "videos": [{ "file", "title", "description", "tags", "category" }] }
 *     with paths relative to the manifest. Progress and the generated passwords are kept in
 *     .local-notes/<env>-channel-accounts.json, so running it again only does what is left. When
 *     the sign-up limit (five an hour from one address) is reached it stops creating accounts and
 *     says so; run it again an hour later.
 *
 * The database is reached with the mongodbUri of Secrets Manager zelos-<env>/api (account B).
 * Run it only after the API host is live: every key URI the transcoder writes contains it.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, openAsBlob, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { MongoClient } from 'mongodb';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENVS = {
  staging: { api: 'https://api-v2-staging.zelostech.site', web: 'https://v2-staging.zelostech.site', db: 'zelos_staging' },
  prod: { api: 'https://api.zelostech.site', web: 'https://zelostech.site', db: 'zelos_prod' },
};
const ROLES = ['user', 'operator', 'auditor', 'admin'];

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    env: { type: 'string', default: 'staging' },
    email: { type: 'string' },
    role: { type: 'string' },
    manifest: { type: 'string' },
    count: { type: 'string', default: '5' },
  },
});
const command = positionals[0];
const env = ENVS[values.env];
if (!env) fail(`--env must be one of ${Object.keys(ENVS).join(', ')}`);

function fail(message) {
  console.error(`seed: ${message}`);
  process.exit(1);
}

async function withDb(fn) {
  const sm = new SecretsManagerClient({ region: 'ap-southeast-1' });
  const secret = await sm.send(new GetSecretValueCommand({ SecretId: `zelos-${values.env}/api` }));
  const { mongodbUri } = JSON.parse(secret.SecretString ?? '{}');
  if (!mongodbUri) fail(`zelos-${values.env}/api has no mongodbUri`);
  const client = new MongoClient(mongodbUri, { serverSelectionTimeoutMS: 15_000 });
  try {
    await client.connect();
    return await fn(client.db(env.db));
  } finally {
    await client.close();
  }
}

async function api(path, { token, body, method = 'POST' } = {}) {
  const res = await fetch(`${env.api}/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json', origin: env.web, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(`${method} ${path}: ${res.status} ${data?.error?.code ?? ''} ${data?.error?.message ?? ''}`.trim()), { status: res.status });
  }
  return data;
}

/** Sends a file to a presigned POST of the API (video or image upload). */
async function postToStorage(upload, path, type) {
  const form = new FormData();
  for (const [k, v] of Object.entries(upload.fields)) form.append(k, v);
  form.append('file', await openAsBlob(path, { type }), basename(path));
  const res = await fetch(upload.url, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`${basename(path)}: storage answered ${res.status}`);
}

/** Uploads one video the way the web app does and returns its id. */
async function uploadVideo(token, path, { title, description = '' }) {
  const size = statSync(path).size;
  const { video, upload } = await api('/uploads', {
    token,
    body: { fileName: basename(path), size, contentType: 'video/mp4', title, description, visibility: 'public' },
  });
  if (upload.mode !== 'post') throw new Error(`${basename(path)}: multipart uploads are not supported here; use the web app`);
  await postToStorage(upload, path, 'video/mp4');
  await api(`/uploads/${video.id}/complete`, { token });
  return video.id;
}

async function setRole() {
  const { email, role } = values;
  if (!email || !ROLES.includes(role)) fail(`role needs --email and --role (${ROLES.join(', ')})`);
  await withDb(async (db) => {
    const r = await db.collection('users').updateOne(
      { email: email.trim().toLowerCase() },
      { $set: { role, updatedAt: new Date() }, $inc: { tokenVersion: 1 } },
    );
    if (r.matchedCount === 0) fail(`no account with ${email}; sign up on ${env.web} first`);
    console.log(`${email} is now ${role}; sign in again to use it`);
  });
}

/** Sign-up needs a date of birth (minimum age check); seed accounts are adults. */
const SEED_BIRTH_DATE = '1990-01-01';

/** The demo account of this environment, created on first use. */
async function demoSession() {
  const file = join(ROOT, '.local-notes', `${values.env}-demo-account.json`);
  if (!existsSync(file)) {
    const account = {
      email: 'demo@zelostech.site',
      handle: 'vidshare.demo',
      displayName: 'VidShare Demo',
      password: randomBytes(18).toString('base64url'),
    };
    // Saved first, so the password is never lost; removed again if the API refuses it.
    writeFileSync(file, `${JSON.stringify(account, null, 2)}\n`, { mode: 0o600 });
    await api('/auth/register', { body: { ...account, birthDate: SEED_BIRTH_DATE } }).catch((err) => {
      unlinkSync(file);
      throw err;
    });
    console.log(`created @${account.handle}`);
  }
  const { email, password } = JSON.parse(readFileSync(file, 'utf8'));
  await withDb((db) => db.collection('users').updateOne({ email }, { $set: { emailVerified: true } }));
  const { token } = await api('/auth/login', { body: { email, password } });
  return token;
}

async function uploadDemo() {
  if (!values.manifest) fail('demo needs --manifest');
  const manifestPath = resolve(values.manifest);
  const items = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const token = await demoSession();
  for (const item of items) {
    const id = await uploadVideo(token, resolve(dirname(manifestPath), item.file), item);
    console.log(`${item.title}: ${env.web}/watch/${id}`);
  }
  console.log('Uploaded; the pipeline publishes each video when its renditions are ready.');
}

/** Registers an account once, keeping its generated password in `file` under `key`. */
async function ensureAccount(file, key, profile) {
  const all = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  if (all[key]) return all[key];
  const account = { ...profile, password: randomBytes(18).toString('base64url') };
  writeFileSync(file, `${JSON.stringify({ ...all, [key]: account }, null, 2)}
`, { mode: 0o600 });
  try {
    await api('/auth/register', { body: { ...account, birthDate: SEED_BIRTH_DATE } });
  } catch (err) {
    writeFileSync(file, `${JSON.stringify(all, null, 2)}
`, { mode: 0o600 });
    throw err;
  }
  console.log(`created @${account.handle}`);
  return account;
}

async function e2eAccounts() {
  const file = join(ROOT, '.local-notes', `${values.env}-e2e-accounts.json`);
  const creator = await ensureAccount(file, 'creator', { email: 'e2e.creator@zelostech.site', handle: 'e2e.creator', displayName: 'E2E Creator' });
  const viewer = await ensureAccount(file, 'viewer', { email: 'e2e.viewer@zelostech.site', handle: 'e2e.viewer', displayName: 'E2E Viewer' });
  await withDb(async (db) => {
    const users = db.collection('users');
    await users.updateMany({ email: { $in: [creator.email, viewer.email] } }, { $set: { emailVerified: true } });
    // The admin tests run as the creator, as on staging.
    await users.updateOne({ email: creator.email, role: { $ne: 'admin' } }, { $set: { role: 'admin', updatedAt: new Date() }, $inc: { tokenVersion: 1 } });
  });
  console.log(`E2E_ACCOUNTS=${file}`);
}

async function benchAccounts() {
  const file = join(ROOT, '.local-notes', `${values.env}-bench-accounts.json`);
  const made = [];
  for (let i = 1; i <= Number(values.count); i++) {
    made.push(await ensureAccount(file, `bench${i}`, { email: `bench.${i}@zelostech.site`, handle: `bench.${i}`, displayName: `Bench ${i}` }));
  }
  await withDb((db) => db.collection('users').updateMany({ email: { $in: made.map((a) => a.email) } }, { $set: { emailVerified: true } }));
  console.log(`${made.length} bench accounts in ${file}`);
}

const IMAGE_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

async function seedChannels() {
  if (!values.manifest) fail('channels needs --manifest');
  const manifestPath = resolve(values.manifest);
  const base = dirname(manifestPath);
  const channels = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const file = join(ROOT, '.local-notes', `${values.env}-channel-accounts.json`);
  const readState = () => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {});
  const saveState = (state) => writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });

  // 1. Accounts, until the sign-up limit stops us.
  let limited = false;
  for (const c of channels) {
    if (readState()[c.key]) continue;
    try {
      await ensureAccount(file, c.key, { email: `${c.handle}@zelostech.site`, handle: c.handle, displayName: c.displayName });
    } catch (err) {
      if (err.status !== 429) throw err;
      limited = true;
      break;
    }
  }
  const made = channels.filter((c) => readState()[c.key]);
  await withDb((db) => db.collection('users').updateMany({ email: { $in: made.map((c) => readState()[c.key].email) } }, { $set: { emailVerified: true } }));

  // 2. Avatar, description and videos of every account that exists.
  for (const c of made) {
    const state = readState();
    const account = state[c.key];
    const { token } = await api('/auth/login', { body: { email: account.email, password: account.password } });
    if (!account.avatarDone && c.avatar) {
      const path = resolve(base, c.avatar);
      const type = IMAGE_TYPES[path.slice(path.lastIndexOf('.')).toLowerCase()];
      if (!type) fail(`${c.avatar}: use a JPEG or PNG avatar`);
      const { uploadId, upload } = await api('/images/uploads', { token, body: { contentType: type, size: statSync(path).size } });
      await postToStorage(upload, path, type);
      await api('/me/avatar', { token, method: 'PUT', body: { uploadId } });
      await api('/me/profile', { token, method: 'PATCH', body: { description: c.description ?? '' } });
      account.avatarDone = true;
      saveState({ ...readState(), [c.key]: account });
    }
    account.videos ??= {};
    for (const v of c.videos ?? []) {
      if (account.videos[v.file]) continue;
      const id = await uploadVideo(token, resolve(base, v.file), v);
      if (v.tags || v.category) await api(`/videos/${id}`, { token, method: 'PATCH', body: { tags: v.tags ?? [], category: v.category ?? null } });
      account.videos[v.file] = id;
      saveState({ ...readState(), [c.key]: account });
      console.log(`@${c.handle} ${v.title}: ${env.web}/watch/${id}`);
    }
  }
  const left = channels.length - made.length;
  console.log(left === 0
    ? `All ${channels.length} channels are seeded; the pipeline publishes each video when it is ready.`
    : `${made.length}/${channels.length} channels exist${limited ? '; the sign-up limit was reached' : ''}. Run again in an hour for the other ${left}.`);
}

if (command === 'role') await setRole();
else if (command === 'channels') await seedChannels();
else if (command === 'bench') await benchAccounts();
else if (command === 'e2e') await e2eAccounts();
else if (command === 'demo') await uploadDemo();
else fail('usage: seed.mjs role|demo|e2e|bench|channels --env staging|prod ...');
