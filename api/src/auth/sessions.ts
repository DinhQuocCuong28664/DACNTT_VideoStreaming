import { ObjectId, type Db } from 'mongodb';
import { ROLES, type Role } from './tokens.js';
import type { SessionLookup } from '../http/middleware.js';

/** Reads the fields authentication needs, with a projection so the document stays small. */
export function mongoSessionLookup(db: Db): SessionLookup {
  const users = db.collection('users');
  return async (userId) => {
    if (!ObjectId.isValid(userId)) return null;
    const u = await users.findOne(
      { _id: new ObjectId(userId) },
      { projection: { tokenVersion: 1, role: 1, disabled: 1 } },
    );
    if (!u) return null;
    const role: Role = (ROLES as readonly unknown[]).includes(u['role']) ? (u['role'] as Role) : 'user';
    return { tokenVersion: Number(u['tokenVersion'] ?? 0), role, disabled: Boolean(u['disabled']) };
  };
}
