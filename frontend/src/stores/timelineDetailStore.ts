import { create } from 'zustand';
import type { LibraryRecord } from '../types/library';
import { apiFetch } from '../api';

interface DetailState {
  cache: Record<string, LibraryRecord>;
  loading: Record<string, boolean>;
  errors: Record<string, string | null>;
  fetchDetail: (category: string, id: number) => Promise<LibraryRecord | null>;
}

function detailKey(category: string, id: number): string {
  return `${category}:${id}`;
}

export const useTimelineDetailStore = create<DetailState>((set, get) => ({
  cache: {},
  loading: {},
  errors: {},

  fetchDetail: async (category: string, id: number) => {
    const key = detailKey(category, id);
    const { cache, loading } = get();

    // Return cached if available
    if (cache[key]) return cache[key];

    // Skip if already loading
    if (loading[key]) return null;

    set((state) => ({
      loading: { ...state.loading, [key]: true },
      errors: { ...state.errors, [key]: null },
    }));

    try {
      const record = await apiFetch<LibraryRecord>(`/library/${category}/${id}`);
      set((state) => ({
        cache: { ...state.cache, [key]: record },
        loading: { ...state.loading, [key]: false },
      }));
      return record;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load detail';
      set((state) => ({
        loading: { ...state.loading, [key]: false },
        errors: { ...state.errors, [key]: errorMsg },
      }));
      return null;
    }
  },
}));