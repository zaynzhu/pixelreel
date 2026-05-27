import { create } from 'zustand';
import type { RadarItem, RadarListResponse } from '../types/radar';
import { apiFetch } from '../api';

type RadarCategory = 'now_playing' | 'upcoming' | 'trending' | 'on_the_air';
type RadarType = 'movie' | 'tv';

interface RadarState {
  items: RadarItem[];
  total: number;
  page: number;
  category: RadarCategory | '';
  type: RadarType | '';
  platform: string;
  loading: boolean;
  syncing: boolean;
  error: string | null;
  lastSyncedAt: string | null;
  fetchItems: (overrides?: Partial<{ category: string; type: string; platform: string; page: number }>) => Promise<void>;
  setCategory: (cat: RadarCategory | '') => void;
  setType: (t: RadarType | '') => void;
  setPlatform: (p: string) => void;
  triggerSync: (source?: string) => Promise<void>;
  addToLibrary: (radarItemId: number) => Promise<{ exists: boolean; recordId: number; category: string } | null>;
}

export const useRadarStore = create<RadarState>((set, get) => ({
  items: [],
  total: 0,
  page: 1,
  category: '',
  type: '',
  platform: '',
  loading: false,
  syncing: false,
  error: null,
  lastSyncedAt: null,

  fetchItems: async (overrides) => {
    const { category, type, platform, page } = { ...get(), ...overrides };
    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (type) params.set('type', type);
      if (platform) params.set('platform', platform);
      params.set('page', String(overrides?.page ?? page));
      params.set('limit', '40');
      const data = await apiFetch<RadarListResponse>(`/radar?${params}`);
      set({
        items: data.items,
        total: data.total,
        page: overrides?.page ?? page,
        lastSyncedAt: data.lastSyncedAt,
        loading: false,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '获取雷达数据失败', loading: false });
    }
  },

  setCategory: (cat) => {
    set({ category: cat, page: 1 });
    get().fetchItems({ category: cat, page: 1 });
  },

  setType: (t) => {
    set({ type: t, page: 1 });
    get().fetchItems({ type: t, page: 1 });
  },

  setPlatform: (p) => {
    set({ platform: p, page: 1 });
    get().fetchItems({ platform: p, page: 1 });
  },

  triggerSync: async (source) => {
    if (get().syncing) return;
    set({ syncing: true });
    try {
      const url = source ? `/radar/sync/${source}` : '/radar/sync';
      await apiFetch<{ taskId: string }>(url, { method: 'POST' });
      setTimeout(() => {
        get().fetchItems();
        set({ syncing: false });
      }, 3000);
    } catch (err) {
      set({ syncing: false, error: err instanceof Error ? err.message : '同步失败' });
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
      set({ error: err instanceof Error ? err.message : '加入记录库失败' });
      return null;
    }
  },
}));