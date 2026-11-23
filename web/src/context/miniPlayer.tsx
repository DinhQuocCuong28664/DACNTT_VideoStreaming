import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Playback } from '../api/types';

/** What the miniplayer needs to keep playing a video after the viewer leaves its watch page. */
export interface MiniVideo {
  videoId: string;
  title: string;
  channelName: string;
  poster: string | null;
  previewVtt: string | null;
  chapters: { startSec: number; title: string }[];
  /** The grant of the watch page: reused, and renewed like there when the CDN refuses it. */
  grant: Playback;
  unlockToken: string | null;
  /** Where the watch page stopped, in seconds. */
  startAt: number;
  /** Whether the watch page was playing; the miniplayer then carries on playing. */
  playing: boolean;
}

interface MiniPlayerContext {
  video: MiniVideo | null;
  open: (video: MiniVideo) => void;
  close: () => void;
}

const Ctx = createContext<MiniPlayerContext>({ video: null, open: () => undefined, close: () => undefined });

export function MiniPlayerProvider({ children }: { children: ReactNode }) {
  const [video, setVideo] = useState<MiniVideo | null>(null);
  const open = useCallback((v: MiniVideo) => setVideo(v), []);
  const close = useCallback(() => setVideo(null), []);
  const value = useMemo(() => ({ video, open, close }), [video, open, close]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useMiniPlayer = () => useContext(Ctx);
