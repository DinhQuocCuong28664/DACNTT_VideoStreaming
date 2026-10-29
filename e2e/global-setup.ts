/**
 * Signs the test accounts in through the API and stores each session as Playwright storage
 * state (the token in localStorage), so tests start signed in without typing passwords.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FullConfig } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
export const API = (process.env['E2E_API_URL'] ?? 'https://api-v2-staging.zelostech.site').replace(/\/$/, '');
export const STATE_DIR = join(here, '.auth');
export const ROLES = ['creator', 'viewer'] as const;
export type E2eRole = (typeof ROLES)[number];
export const statePath = (role: E2eRole) => join(STATE_DIR, `${role}.json`);

interface Account { email: string; password: string; handle: string }

export default async function globalSetup(config: FullConfig): Promise<void> {
  const file = process.env['E2E_ACCOUNTS'] ?? join(here, '..', '.local-notes', 'e2e-accounts.json');
  const accounts = new Map(Object.entries(JSON.parse(readFileSync(file, 'utf8')) as Record<string, Account>));
  const origin = new URL(config.projects[0]?.use.baseURL ?? 'http://localhost:5173').origin;
  mkdirSync(STATE_DIR, { recursive: true });
  for (const role of ROLES) {
    const a = accounts.get(role);
    if (!a) throw new Error(`no ${role} account in ${file}`);
    const res = await fetch(`${API}/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ email: a.email, password: a.password }),
    });
    if (!res.ok) throw new Error(`sign-in of the ${role} test account failed: ${res.status}`);
    const { token } = (await res.json()) as { token: string };
    writeFileSync(statePath(role), JSON.stringify({ cookies: [], origins: [{ origin, localStorage: [{ name: 'zelos-token', value: token }, { name: 'vidshare-language', value: 'en' }] }] }));
  }
}
