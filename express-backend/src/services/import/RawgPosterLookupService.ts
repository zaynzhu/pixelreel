import axios from 'axios';
import { config } from '../../config';

export function parseRawgPosterUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const results = (data as { results?: unknown }).results;
  if (!Array.isArray(results) || !results[0] || typeof results[0] !== 'object') return null;
  const image = (results[0] as { background_image?: unknown }).background_image;
  if (typeof image !== 'string' || !image.trim()) return null;
  return image.startsWith('//') ? `https:${image}` : image;
}

export async function lookupRawgPosterUrl(
  title: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!config.rawg.apiKey || !title.trim()) return null;
  try {
    const response = await axios.get(`${config.rawg.baseUrl}/games`, {
      params: { search: title, key: config.rawg.apiKey, page_size: 1 },
      signal,
    });
    return parseRawgPosterUrl(response.data);
  } catch {
    return null;
  }
}
