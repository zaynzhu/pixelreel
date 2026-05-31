import axios from 'axios';
import { config } from '../../config';
import { RadarItemInput } from './types';

const TENCENT_API_URL = 'https://pbaccess.video.qq.com/trpc.vector_layout.page_view.PageService/getCard?video_appid=3000010&vversion_platform=2';

const TENCENT_REQUEST_BODY = {
  page_params: {
    tab_type: 'new_film',
    tab_name: '最新',
    tab_mvl_sub_mod_id: '792ac_195f1Sub_132',
    page_id: 'scms_shake',
    page_type: 'scms_shake',
    new_mark_label_enabled: '1',
  },
  page_context: { page_index: '1' },
  flip_info: {
    sub_module_id: '20190621006455',
    flip_params: {
      mvl_sub_mod_id: '20190621006455',
      page_id: 'scms_shake',
      page_type: 'scms_shake',
      source_key: '100173',
    },
  },
};

export async function fetchTencentRadar(): Promise<RadarItemInput[]> {
  try {
    const response = await axios.post(TENCENT_API_URL, TENCENT_REQUEST_BODY, {
      timeout: config.radar.requestTimeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://v.qq.com/',
      },
    });

    const cards: any[] = response.data?.data?.card?.children_list?.list?.cards ?? [];
    return cards.map((card: any) => {
      const ratingText = card.marklabel_1_prime_text ?? '';
      const ratingVal = parseFloat(ratingText);
      return {
        sourceKey: `tencent:${card.cid}`,
        source: 'tencent' as const,
        sourceId: card.cid ?? undefined,
        sourceUrl: card.video_url ?? undefined,
        type: 'movie' as const,
        title: card.title ?? '',
        titleZh: card.priority_title ?? card.title ?? undefined,
        posterPath: card.pic_276x386 ?? undefined,
        releaseDate: card.publish_date ?? undefined,
        platform: '腾讯视频',
        category: 'now_playing' as const,
        voteAverage: !isNaN(ratingVal) ? ratingVal : undefined,
      };
    });
  } catch (err: any) {
    console.error('[Radar] Tencent fetch error:', err.message);
    return [];
  }
}

export async function fetchTencentNewReleases(): Promise<RadarItemInput[]> {
  try {
    const response = await axios.post(TENCENT_API_URL, TENCENT_REQUEST_BODY, {
      timeout: config.radar.requestTimeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://v.qq.com/',
      },
    });

    const cards: any[] = response.data?.data?.card?.children_list?.list?.cards ?? [];
    return cards.map((card: any) => {
      const ratingText = card.marklabel_1_prime_text ?? '';
      const ratingVal = parseFloat(ratingText);
      return {
        sourceKey: `tencent:${card.cid}`,
        source: 'tencent' as const,
        sourceId: card.cid ?? undefined,
        sourceUrl: card.video_url ?? undefined,
        type: 'movie' as const,
        title: card.title ?? '',
        titleZh: card.priority_title ?? card.title ?? undefined,
        posterPath: card.pic_276x386 ?? undefined,
        releaseDate: card.publish_date ?? undefined,
        platform: '腾讯视频',
        category: 'upcoming' as const,
        voteAverage: !isNaN(ratingVal) ? ratingVal : undefined,
      };
    });
  } catch (err: any) {
    console.error('[Radar] Tencent new releases fetch error:', err.message);
    return [];
  }
}