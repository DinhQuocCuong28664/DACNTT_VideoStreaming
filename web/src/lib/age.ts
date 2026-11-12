/** Youngest age allowed to create an account (privacy policy, section 8). */
export const MIN_AGE = 12;

/** Full years between `birth` (YYYY-MM-DD) and `today`; null when the date is missing or invalid. */
export function ageOn(birth: string, today: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  let age = today.getUTCFullYear() - y;
  const beforeBirthday = today.getUTCMonth() < mo - 1 || (today.getUTCMonth() === mo - 1 && today.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age < 0 ? null : age;
}

export const isOldEnough = (birth: string, today: Date = new Date()): boolean => {
  const age = ageOn(birth, today);
  return age !== null && age >= MIN_AGE;
};
