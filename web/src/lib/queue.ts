/**
 * Play order of a playlist on the watch page: the list as it is, or shuffled with the video
 * being watched first, and what comes after a video, with or without looping.
 */

/** Fisher-Yates shuffle of everything but `first`, which leads the order. */
export function shuffleOrder(ids: readonly string[], first: string, random: () => number = Math.random): string[] {
  const rest = ids.filter((id) => id !== first);
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    // splice keeps to array methods: swap the items at i and j.
    const [a] = rest.splice(i, 1, rest.at(j) ?? '');
    rest.splice(j, 1, a ?? '');
  }
  return ids.includes(first) ? [first, ...rest] : rest;
}

/**
 * The video after `current`: null at the end unless looping, when the order starts again. A video
 * that is not in the order (opened from elsewhere) is followed by the first one.
 */
export function nextInQueue(order: readonly string[], current: string, loop: boolean): string | null {
  if (order.length === 0) return null;
  const i = order.indexOf(current);
  if (i === -1) return order[0] ?? null;
  if (i < order.length - 1) return order[i + 1] ?? null;
  return loop && order.length > 1 ? (order[0] ?? null) : null;
}

/** "3 / 12", or null when the video is not in the order. */
export function queuePosition(order: readonly string[], current: string): { index: number; total: number } | null {
  const i = order.indexOf(current);
  return i === -1 ? null : { index: i + 1, total: order.length };
}
