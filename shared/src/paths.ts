/**
 * Object keys of one upload version. Every producer and consumer builds keys here so the
 * layout lives in one place (docs/ARCHITECTURE.md §5.1).
 */

const version = (uploadVersion: number): string => `v${uploadVersion}`;
const pad = (n: number, width: number): string => String(n).padStart(width, '0');

/** Processed bucket: everything CloudFront serves for one upload version. */
export const processedPaths = (videoId: string, uploadVersion: number) => {
  const root = `videos/${videoId}/${version(uploadVersion)}`;
  return {
    root,
    /** Wildcard resource of the signed playback policy. */
    policyResource: `videos/${videoId}/*`,
    master: `${root}/master.m3u8`,
    rungDir: (rung: string) => `${root}/${rung}`,
    mediaPlaylist: (rung: string) => `${root}/${rung}/index.m3u8`,
    thumbnail: `${root}/thumbnail.jpg`,
    previewDir: `${root}/preview`,
    previewVtt: `${root}/preview/thumbnails.vtt`,
    sprite: (n: number) => `${root}/preview/sprite_${pad(n, 3)}.jpg`,
    caption: (lang: string) => `${root}/captions/${lang}.vtt`,
  };
};

/** Segment file name inside a rung directory; chunked segments carry their chunk index. */
export const segmentName = (index: number, chunk: number | null = null): string =>
  chunk === null ? `seg_${pad(index, 5)}.ts` : `c${pad(chunk, 4)}_${pad(index, 3)}.ts`;

/** Work bucket: temporary files of one workflow run (expire after a week). */
export const workPaths = (videoId: string, uploadVersion: number) => {
  const root = `work/${videoId}/${version(uploadVersion)}`;
  return {
    root,
    plan: `${root}/plan.json`,
    audio: (kbps: number) => `${root}/audio/${kbps}k.m4a`,
    chunkResult: (index: number) => `${root}/chunks/${pad(index, 4)}.json`,
    chunkResultsPrefix: `${root}/chunks/`,
    abortMarker: `${root}/abort`,
    encodeResult: `${root}/encode.json`,
    analyseResult: `${root}/analyse.json`,
  };
};

/** Keys bucket: one AES-128 key and IV per upload version. */
export const keyObject = (videoId: string, uploadVersion: number): string => `keys/${videoId}/${version(uploadVersion)}.json`;

/**
 * Key URI written into media playlists; the player adds the playback token. The upload version
 * is part of it so a playlist of one version can never be served the key of another.
 */
export const keyUri = (apiBaseUrl: string, videoId: string, uploadVersion: number): string =>
  `${apiBaseUrl.replace(/\/+$/, '')}/v1/videos/${videoId}/key?v=${uploadVersion}`;
