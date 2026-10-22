/**
 * When a play counts as a view.
 *
 * A view needs VIEW_SECONDS of the video actually watched, or the whole video
 * when it is shorter than that. "Watched" is the playback time that went by
 * while the video was playing, summed over the session, not the position of
 * the playhead: seeking to 0:31 and playing for a second must not count, and
 * pausing does not lose what was already watched.
 */
export const VIEW_SECONDS = 30;

/**
 * The largest step between two `timeupdate` events that still counts as
 * playback. Browsers fire `timeupdate` every 0.25 s or so; at 2x speed a step
 * is about 0.5 s. A larger jump forward is a seek, and a step backwards is a
 * seek or a loop restart, so neither adds watched time.
 */
const MAX_PLAYBACK_STEP = 1.5;

/**
 * A short video counts once all but this many seconds were watched. The last
 * `timeupdate` before `ended` often stops a fraction short of the duration
 * (2.95 of a 3-second clip), so demanding the exact duration would miss real
 * views.
 */
const END_TOLERANCE = 0.5;

/** Seconds of watching that make a view for a video of this duration. */
export const viewThreshold = (duration, seconds = VIEW_SECONDS) => {
  const d = Number(duration);
  if (!Number.isFinite(d) || d <= 0) return seconds;
  if (d >= seconds) return seconds;
  return Math.max(0, d - END_TOLERANCE);
};

/**
 * Watched time after one `timeupdate`.
 *
 * @param {number} watched  seconds watched so far
 * @param {number} lastTime playhead at the previous event, or null at the start
 * @param {number} time     playhead now
 * @param {boolean} playing whether the video was playing (not paused or seeking)
 */
export const addWatched = (watched, lastTime, time, playing) => {
  if (!playing || lastTime === null || lastTime === undefined) return watched;
  const step = time - lastTime;
  if (step <= 0 || step > MAX_PLAYBACK_STEP) return watched;
  return watched + step;
};

/** Whether enough has been watched to count a view. */
export const reachedView = (watched, duration, seconds = VIEW_SECONDS) =>
  watched >= viewThreshold(duration, seconds);
