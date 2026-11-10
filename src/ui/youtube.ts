export interface YouTubeRef {
  /** 11-character video id, if the link points at a video. */
  video?: string;
  /** Playlist id, if the link has one. */
  list?: string;
  /** Start time in seconds. */
  start?: number;
}

const ID = /^[A-Za-z0-9_-]{11}$/;
const LIST = /^[A-Za-z0-9_-]{10,64}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'youtube-nocookie.com']);

/** Parses "1h2m3s", "90s" or "90" into seconds. */
function parseTime(t: string | null): number | undefined {
  if (!t) return undefined;
  if (/^\d+$/.test(t)) return +t;
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || !m[0]) return undefined;
  return (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + +(m[3] ?? 0);
}

/**
 * Understands the usual YouTube links: watch?v=, youtu.be/, /shorts/, /live/,
 * /embed/, playlists, and a bare 11-character video id. Returns null for
 * anything else.
 */
export function parseYouTube(input: string): YouTubeRef | null {
  const text = input.trim();
  if (ID.test(text)) return { video: text };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text);
  } catch {
    return null;
  }
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  let video: string | undefined;
  if (url.hostname.toLowerCase() === 'youtu.be') video = parts[0];
  else if (parts[0] === 'watch') video = url.searchParams.get('v') ?? undefined;
  else if (['shorts', 'live', 'embed', 'v'].includes(parts[0])) video = parts[1];
  const ref: YouTubeRef = {};
  if (video && ID.test(video)) ref.video = video;
  const list = url.searchParams.get('list');
  if (list && LIST.test(list)) ref.list = list;
  const start = parseTime(url.searchParams.get('t') ?? url.searchParams.get('start'));
  if (start) ref.start = start;
  return ref.video || ref.list ? ref : null;
}

/** Privacy-enhanced embed URL (youtube-nocookie.com). */
export function embedUrl(ref: YouTubeRef): string {
  const params = new URLSearchParams({ rel: '0', modestbranding: '1', playsinline: '1' });
  if (ref.start) params.set('start', String(ref.start));
  let path: string;
  if (ref.video) {
    path = ref.video;
    if (ref.list) params.set('list', ref.list);
  } else {
    path = 'videoseries';
    params.set('list', ref.list!);
  }
  return `https://www.youtube-nocookie.com/embed/${path}?${params}`;
}
