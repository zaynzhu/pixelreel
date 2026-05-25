import { create } from "zustand";
import type { TimelineRecord, TimelineCategoryFilter, TimelinePageResponse } from "../types/timeline";
import { apiFetch } from "../api";

function buildTimelineQuery(params: {
  cursor?: string | null;
  limit: number;
  category: TimelineCategoryFilter;
  year: number | "ALL";
  includeTotals: boolean;
}) {
  const search = new URLSearchParams();
  search.set("limit", String(params.limit));
  search.set("category", params.category);
  search.set("includeTotals", String(params.includeTotals));
  if (params.cursor) search.set("cursor", params.cursor);
  if (params.year !== "ALL") search.set("year", String(params.year));
  return `/timeline?${search.toString()}`;
}

function recordKey(record: TimelineRecord) {
  return `${record.category}:${record.id}`;
}

type TimelineFilters = {
  category: TimelineCategoryFilter;
  year: number | "ALL";
};

type TimelineState = {
  records: TimelineRecord[];
  nextCursor: string | null;
  pageSize: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  filters: TimelineFilters;
  years: number[];
  yearsLoading: boolean;
  yearsError: string | null;
  fetchRecords: (options?: {
    limit?: number;
    category?: TimelineCategoryFilter;
    year?: number | "ALL";
  }) => Promise<void>;
  fetchMore: () => Promise<void>;
  setFilters: (filters: Partial<TimelineFilters>) => void;
  fetchYears: (category?: TimelineCategoryFilter) => Promise<void>;
};

let latestFetchRequest = 0;

export const useTimelineStore = create<TimelineState>((set, get) => ({
  records: [],
  nextCursor: null,
  pageSize: 96,
  loading: false,
  loadingMore: false,
  error: null,
  filters: { category: "all", year: "ALL" },
  years: [],
  yearsLoading: false,
  yearsError: null,

  fetchRecords: async (options) => {
    const limit = Math.min(Math.max(options?.limit ?? get().pageSize, 1), 200);
    const category = options?.category ?? get().filters.category;
    const year = options?.year ?? get().filters.year;
    const requestId = ++latestFetchRequest;
    set({ loading: true, error: null, pageSize: limit, filters: { category, year } });
    try {
      const url = buildTimelineQuery({
        limit,
        category,
        year,
        includeTotals: true,
      });
      const payload = await apiFetch<TimelinePageResponse>(url);
      if (requestId !== latestFetchRequest) return;
      set({
        records: payload.records,
        nextCursor: payload.nextCursor,
        loading: false,
      });
    } catch (err) {
      if (requestId !== latestFetchRequest) return;
      set({
        error: err instanceof Error ? err.message : "获取时间线失败",
        loading: false,
      });
    }
  },

  fetchMore: async () => {
    const { nextCursor, loadingMore, loading, pageSize, filters } = get();
    if (!nextCursor || loadingMore || loading) return;
    const cursor = nextCursor;
    set({ loadingMore: true, error: null });
    try {
      const url = buildTimelineQuery({
        cursor,
        limit: pageSize,
        category: filters.category,
        year: filters.year,
        includeTotals: false,
      });
      const payload = await apiFetch<TimelinePageResponse>(url);
      if (get().nextCursor !== cursor) {
        set({ loadingMore: false });
        return;
      }
      const seen = new Set(get().records.map(recordKey));
      const newRecords = payload.records.filter((record) => !seen.has(recordKey(record)));
      set({
        records: [...get().records, ...newRecords],
        nextCursor: payload.nextCursor,
        loadingMore: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "加载更多时间线失败",
        loadingMore: false,
      });
    }
  },

  setFilters: (partial) => {
    set({ filters: { ...get().filters, ...partial } });
  },

  fetchYears: async (category) => {
    const cat = category ?? get().filters.category;
    set({ yearsLoading: true, yearsError: null });
    try {
      const search = new URLSearchParams();
      search.set("category", cat);
      const data = await apiFetch<{ years: number[] }>(`/timeline/years?${search.toString()}`);
      set({ years: data.years, yearsLoading: false });
    } catch (err) {
      set({
        yearsError: err instanceof Error ? err.message : "获取年份列表失败",
        yearsLoading: false,
      });
    }
  },
}));