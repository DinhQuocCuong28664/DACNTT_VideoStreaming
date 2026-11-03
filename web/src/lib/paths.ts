/** A same-site path that is safe to navigate to after sign-in (never //other.host). */
export const isInternalPath = (v: unknown): v is string => typeof v === 'string' && v.startsWith('/') && !v.startsWith('//');
