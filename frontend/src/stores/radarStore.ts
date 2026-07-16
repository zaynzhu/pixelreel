import { create } from 'zustand';
import type { RadarItem, RadarListResponse } from '../types/radar';
import { apiFetch } from '../api';
import { toast } from './toastStore';
import { useTaskStore } from './taskStore';
import { useI18nStore } from './i18nStore';

type RadarCategory = 'now_playing' | 'upcoming' | 'trending' | 'on_the_air';
type RadarType = 'movie' | 'tv';
type RadarRequest = Partial<{ category: string; type: string; platform: string; page: number }>;

interface RadarState {
  items: RadarItem[];
  total: number;
  page: number;
  category: RadarCategory | '';
  type: RadarType | '';
  platform: string;
  loading: boolean;
  syncing: boolean;
  syncTaskId: string | null;
  addingIds: number[];
  error: string | null;
  failedRequest: RadarRequest | null;
  lastSyncedAt: string | null;
  fetchItems: (overrides?: RadarRequest) => Promise<void>;
  retryFetch: () => Promise<void>;
  setCategory: (cat: RadarCategory | '') => void;
  setType: (t: RadarType | '') => void;
  setPlatform: (p: string) => void;
  triggerSync: (source?: string) => Promise<void>;
  finishSync: (error?: string) => void;
  addToLibrary: (radarItemId: number) => Promise<{ exists: boolean; recordId: number; category: string } | null>;
}

let latestRadarRequest = 0;
const activeRadarAdds = new Set<number>();

export const useRadarStore = create<RadarState>((set, get) => ({
  items: [],
  total: 0,
  page: 1,
  category: '',
  type: '',
  platform: '',
  loading: false,
  syncing: false,
  syncTaskId: null,
  addingIds: [],
  error: null,
  failedRequest: null,
  lastSyncedAt: null,

  fetchItems: async (overrides) => {
    const requestId = ++latestRadarRequest;
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
      params.set('syncType', 'popular'); // 热门同步的数据
      const data = await apiFetch<RadarListResponse>(`/radar?${params}`);
      if (requestId !== latestRadarRequest) return;
      set({
        items: data.items,
        total: data.total,
        page: requestedPage,
        lastSyncedAt: data.lastSyncedAt,
        loading: false,
      });
    } catch (err) {
      if (requestId !== latestRadarRequest) return;
      set({
        error: err instanceof Error ? err.message : '获取雷达数据失败',
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

  setType: (t) => {
    get().fetchItems({ type: t, page: 1 });
  },

  setPlatform: (p) => {
    get().fetchItems({ platform: p, page: 1 });
  },

  triggerSync: async (source) => {
    if (get().syncing) return;
    const taskState = useTaskStore.getState();
    if (!taskState.initialized || taskState.pollError !== null) {
      toast(useI18nStore.getState().t('task.panel.unavailable_hint'), 'error');
      return;
    }
    set({ syncing: true, error: null, failedRequest: null });
    try {
      const url = source ? `/radar/sync/${source}` : '/radar/sync';
      const { taskId } = await apiFetch<{ taskId: string }>(url, { method: 'POST' });
      set({ syncTaskId: taskId });
      await useTaskStore.getState().pollTasks();
    } catch (err) {
      const message = err instanceof Error ? err.message : '同步失败';
      set({ syncing: false, syncTaskId: null, error: message, failedRequest: null });
      toast(message, 'error');
    }
  },

  finishSync: (error) => {
    set({
      syncing: false,
      syncTaskId: null,
      error: error ?? null,
      failedRequest: null,
    });
    if (error) toast(error, 'error');
  },

  addToLibrary: async (radarItemId) => {
    if (activeRadarAdds.has(radarItemId)) return null;
    activeRadarAdds.add(radarItemId);
    set(state => ({ addingIds: [...state.addingIds, radarItemId] }));
    try {
      const result = await apiFetch<{ exists: boolean; recordId: number; category: string }>('/radar/add-to-library', {
        method: 'POST',
        body: JSON.stringify({ radarItemId }),
      });
      set(state => ({
        items: state.items.map(item =>
          item.id === radarItemId ? { ...item, inLibrary: true } : item
        ),
      }));
      return result;
    } catch (err) {
      toast(err instanceof Error ? err.message : '加入记录库失败', 'error');
      return null;
    } finally {
      activeRadarAdds.delete(radarItemId);
      set(state => ({ addingIds: state.addingIds.filter(id => id !== radarItemId) }));
    }
  },
}));
