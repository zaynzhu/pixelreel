import axios from 'axios';
import { config } from '../../config';
import { RadarItemInput } from './types';

export async function fetchYoukuRadar(): Promise<RadarItemInput[]> {
  try {
    const url = 'https://search.youku.com/api/search';
    const response = await axios.get(url, {
      params: { keyword: '电影', cate: 96, order: 1, pg: 1, pz: 30 },
      timeout: config.radar.requestTimeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.youku.com/',
      },
    });

    const components: any[] = response.data?.pageComponentList ?? [];
    return components
      .filter((c: any) => c.commonData?.showId)
      .map((c: any) => {
        const d = c.commonData;
        return {
          sourceKey: `youku:${d.showId}`,
          source: 'youku' as const,
          sourceId: d.showId,
          sourceUrl: d.leftButtonDTO?.action?.value ?? undefined,
          type: 'movie' as const,
          title: d.titleDTO?.displayName ?? '',
          titleZh: d.titleDTO?.displayName ?? undefined,
          posterPath: d.posterDTO?.vThumbUrl ?? undefined,
          releaseDate: undefined,
          platform: '优酷',
          category: 'now_playing' as const,
          voteAverage: undefined,
        };
      });
  } catch (err: any) {
    console.error('[Radar] Youku fetch error:', err.message);
    return [];
  }
}