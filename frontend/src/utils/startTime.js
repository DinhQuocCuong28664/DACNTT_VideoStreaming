/**
 * The `t` query parameter of a watch link: where playback should start.
 *
 * Accepts the forms people paste from YouTube: plain seconds (`90`), seconds
 * with a unit (`90s`) and hours/minutes/seconds (`1h2m3s`, `2m`, `1m30s`).
 * Returns whole seconds, or null when the value is missing or not one of
 * those forms, so a bad link simply starts at the beginning.
 */
export const parseStartTime = (raw) => {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim().toLowerCase();
  if (value === '') return null;
  if (/^\d+$/.test(value)) return Number(value);

  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match) return null;
  const [, hours = '0', minutes = '0', seconds = '0'] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
};

/**
 * Adds `t=<whole seconds>` to a watch link. Zero or less leaves the link
 * as it is, since the video starts at the beginning anyway.
 */
export const withStartTime = (url, seconds) => {
  const whole = Math.floor(Number(seconds) || 0);
  const result = new URL(url);
  if (whole > 0) result.searchParams.set('t', String(whole));
  else result.searchParams.delete('t');
  return result.toString();
};
