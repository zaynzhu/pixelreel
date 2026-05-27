const PROXYABLE_HOSTS = new Set([
  'image.tmdb.org',
  'media.themoviedb.org',
  'steamcdn-a.akamaihd.net',
  'cdn.cloudflare.steamstatic.com',
  'cdn.akamai.steamstatic.com',
  'shared.akamai.steamstatic.com',
  'media.rawg.io',
  'img1.doubanio.com',
  'img2.doubanio.com',
  'img3.doubanio.com',
  'r1.ykimg.com',
  'tv.puui.qpic.cn',
]);

export function proxiedImageUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!PROXYABLE_HOSTS.has(parsed.hostname)) return url;
    return `/api/search/proxy/image?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}