/**
 * Outgoing e-mail through Gmail SMTP. Gmail allows about 500 messages a day, so a daily cap
 * counted in DynamoDB keeps the account below that; over the cap a message is dropped with a
 * log line. Callers never fail a request because mail failed.
 */
import nodemailer from 'nodemailer';
import type { Kv } from '../kv.js';

export interface Message { to: string; subject: string; text: string }
export interface Mailer { send(message: Message): Promise<boolean> }

export const DAILY_MAIL_CAP = 400;

export function gmailMailer(user: string, password: string): Mailer {
  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass: password } });
  return {
    async send(m) {
      await transport.sendMail({ from: `Zelos <${user}>`, to: m.to, subject: m.subject, text: m.text });
      return true;
    },
  };
}

/** Wraps a mailer with the daily cap and turns failures into `false`. */
export function cappedMailer(inner: Mailer, kv: Kv, table: string, log: (e: Record<string, unknown>) => void, now: () => Date, cap = DAILY_MAIL_CAP): Mailer {
  return {
    async send(m) {
      const day = now().toISOString().slice(0, 10);
      const end = new Date(`${day}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 2);
      const count = await kv.increment(table, `mail-day#${day}`, end);
      if (count > cap) {
        log({ level: 'warn', msg: 'daily mail cap reached, message dropped', subject: m.subject });
        return false;
      }
      try {
        return await inner.send(m);
      } catch (err) {
        log({ level: 'error', msg: 'mail failed', subject: m.subject, error: err instanceof Error ? err.message : String(err) });
        return false;
      }
    },
  };
}

/** Collects messages instead of sending them (tests and local runs). */
export function memoryMailer(): Mailer & { sent: Message[] } {
  const sent: Message[] = [];
  return { sent, async send(m) { sent.push(m); return true; } };
}
