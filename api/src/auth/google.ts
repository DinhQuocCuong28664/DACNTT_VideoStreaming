/**
 * Google Identity Services ID tokens. The library checks the signature against Google's keys,
 * the issuer, the expiry and the audience (our web client id). Only verified Google mailboxes
 * are accepted, because the e-mail decides which local account a Google sign-in may claim.
 */
import { OAuth2Client } from 'google-auth-library';

export interface GoogleIdentity { sub: string; email: string; name: string; picture: string | null }
export type GoogleVerifier = (idToken: string) => Promise<GoogleIdentity | null>;

export function googleVerifier(clientId: string | undefined): GoogleVerifier {
  if (!clientId) return async () => null;
  const client = new OAuth2Client();
  return async (idToken) => {
    try {
      const ticket = await client.verifyIdToken({ idToken, audience: clientId });
      const p = ticket.getPayload();
      if (!p?.sub || !p.email || p.email_verified !== true) return null;
      return { sub: p.sub, email: p.email.toLowerCase(), name: p.name ?? p.email.split('@')[0] ?? 'Viewer', picture: p.picture ?? null };
    } catch {
      return null;
    }
  };
}
