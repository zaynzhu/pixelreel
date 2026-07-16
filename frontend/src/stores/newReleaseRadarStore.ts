import { create } from 'zustand';
import type { RadarItem, RadarListResponse } from '../types/radar';
import { apiFetch } from '../api';
import { toast } from './toastStore';

type RadarCategory = 'now_playing' | 'upcoming' | 'on_the_air';
type RadarType = 'movie' | 'tv';
type RadarRequest = Partial<{ category: string; type: string; platform: string; page: number }>;

interface NewReleaseRadarState {
  items: RadarItem[];
  total: number;
  page: number;
  category: RadarCategory | '';
  type: RadarType | '';
  platform: string;
  loading: boolean;
  syncing: boolean;
  error: string | null;
  failedRequest: RadarRequest | null;
  lastSyncedAt: string | null;
  fetchItems: (overrides?: RadarRequest) => Promise<void>;
  retryFetch: () => Promise<void>;
  setCategory: (cat: RadarCategory | '') => void;
  setPlatform: (p: string) => void;
  triggerSync: (source?: string) => Promise<void>;
  addToLibrary: (radarItemId: number) => Promise<{ exists: boolean; recordId: number; category: string } | null>;
}

let latestNewReleaseRequest = 0;

export const useNewReleaseRadarStore = create<NewReleaseRadarState>((set, get) => ({
  items: [],
  total: 0,
  page: 1,
  category: '',
  type: '',
  platform: '',
  loading: false,
  syncing: false,
  error: null,
  failedRequest: null,
  lastSyncedAt: null,

  fetchItems: async (overrides) => {
    const requestId = ++latestNewReleaseRequest;
    const current = get();
    const { category, type, platform, page } = { ...current, ...overrides };
    const requestedPage = overrides?.page ?? page;
    const filtersChanged =
      category !== current.category ||
      type !== current.type ||
      platform !== current.platform;
    const request = { category, type, platform, page: requestedPage };
    set({
      items: filtersChanged ? [] : current.items,
      total: filtersChanged ? 0 : current.total,
      page: filtersChanged ? requestedPage : current.page,
      category: category as RadarCategory | '',
      type: type as RadarType | '',
      platform,
      loading: true,
      error: null,
      failedRequest: null,
    });
    try {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (type) params.set('type', type);
      if (platform) params.set('platform', platform);
      params.set('page', String(requestedPage));
      params.set('limit', '40');
      params.set('syncType', 'new_release'); // 新片同步的数据
      const data = await apiFetch<RadarListResponse>(`/radar?${params}`);
      if (requestId !== latestNewReleaseRequest) return;
      set({
        items: data.items,
        total: data.total,
        page: requestedPage,
        lastSyncedAt: data.lastSyncedAt,
        loading: false,
      });
    } catch (err) {
      if (requestId !== latestNewReleaseRequest) return;
      set({
        error: err instanceof Error ? err.message : '获取新片数据失败',
        failedRequest: request,
        loading: false,
      });
    }
  },

  retryFetch: async () => {
    const failedRequest = get().failedRequest;
    if (failedRequest) await get().fetchItems(failedRequest);
  },

  setCategory: (cat) => {
    get().fetchItems({ category: cat, page: 1 });
  },

  setPlatform: (p) => {
    get().fetchItems({ platform: p, page: 1 });
  },

  triggerSync: async (source) => {
    if (get().syncing) return;
    set({ syncing: true, failedRequest: null });
    try {
      const url = source ? `/radar/sync-new-releases/${source}` : '/radar/sync-new-releases';
      await apiFetch<{ taskId: string }>(url, { method: 'POST' });
      setTimeout(() => {
        get().fetchItems();
        set({ syncing: false });
      }, 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : '新片同步失败';
      set({ syncing: false, error: message, failedRequest: null });
      toast(message, 'error');
    }
  },

  addToLibrary: async (radarItemId) => {
    try {
      const result = await apiFetch<{ exists: boolean; recordId: number; category: string }>('/radar/add-to-library', {
        method: 'POST',
        body: JSON.stringify({ radarItemId }),
      });
      if (!result.exists) {
        set(state => ({
          items: state.items.map(item =>
            item.id === radarItemId ? { ...item, inLibrary: true } : item
          ),
        }));
      }
      return result;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '加入记录库失败', failedRequest: null });
      return null;
    }
  },
}));
