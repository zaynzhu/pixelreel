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
  failedFetch: "records" | "more" | null;
  filters: TimelineFilters;
  years: number[];
  yearsCategory: TimelineCategoryFilter | null;
  yearsLoading: boolean;
  yearsError: string | null;
  fetchRecords: (options?: {
    limit?: number;
    category?: TimelineCategoryFilter;
    year?: number | "ALL";
  }) => Promise<void>;
  fetchMore: () => Promise<void>;
  retryFetch: () => Promise<void>;
  setFilters: (filters: Partial<TimelineFilters>) => void;
  fetchYears: (category?: TimelineCategoryFilter) => Promise<void>;
};

let latestFetchRequest = 0;
let latestYearsRequest = 0;

export const useTimelineStore = create<TimelineState>((set, get) => ({
  records: [],
  nextCursor: null,
  pageSize: 96,
  loading: false,
  loadingMore: false,
  error: null,
  failedFetch: null,
  filters: { category: "all", year: "ALL" },
  years: [],
  yearsCategory: null,
  yearsLoading: false,
  yearsError: null,

  fetchRecords: async (options) => {
    const limit = Math.min(Math.max(options?.limit ?? get().pageSize, 1), 200);
    const category = options?.category ?? get().filters.category;
    const year = options?.year ?? get().filters.year;
    const current = get();
    const filtersChanged = category !== current.filters.category || year !== current.filters.year;
    const requestId = ++latestFetchRequest;
    set({
      records: filtersChanged ? [] : current.records,
      nextCursor: filtersChanged ? null : current.nextCursor,
      loading: true,
      loadingMore: false,
      error: null,
      failedFetch: null,
      pageSize: limit,
      filters: { category, year },
    });
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
        failedFetch: "records",
        loading: false,
      });
    }
  },

  fetchMore: async () => {
    const { nextCursor, loadingMore, loading, pageSize, filters } = get();
    if (!nextCursor || loadingMore || loading) return;
    const requestId = latestFetchRequest;
    const cursor = nextCursor;
    set({ loadingMore: true, error: null, failedFetch: null });
    try {
      const url = buildTimelineQuery({
        cursor,
        limit: pageSize,
        category: filters.category,
        year: filters.year,
        includeTotals: false,
      });
      const payload = await apiFetch<TimelinePageResponse>(url);
      if (requestId !== latestFetchRequest || get().nextCursor !== cursor) return;
      const seen = new Set(get().records.map(recordKey));
      const newRecords = payload.records.filter((record) => !seen.has(recordKey(record)));
      set({
        records: [...get().records, ...newRecords],
        nextCursor: payload.nextCursor,
        loadingMore: false,
      });
    } catch (err) {
      if (requestId !== latestFetchRequest) return;
      set({
        error: err instanceof Error ? err.message : "加载更多时间线失败",
        failedFetch: "more",
        loadingMore: false,
      });
    }
  },

  retryFetch: async () => {
    const failedFetch = get().failedFetch;
    if (failedFetch === "more") {
      await get().fetchMore();
      return;
    }
    if (failedFetch === "records") {
      await get().fetchRecords();
    }
  },

  setFilters: (partial) => {
    set({ filters: { ...get().filters, ...partial } });
  },

  fetchYears: async (category) => {
    const cat = category ?? get().filters.category;
    const requestId = ++latestYearsRequest;
    const current = get();
    set({
      years: current.yearsCategory === cat ? current.years : [],
      yearsCategory: cat,
      yearsLoading: true,
      yearsError: null,
    });
    try {
      const search = new URLSearchParams();
      search.set("category", cat);
      const data = await apiFetch<{ years: number[] }>(`/timeline/years?${search.toString()}`);
      if (requestId !== latestYearsRequest) return;
      set({ years: data.years, yearsLoading: false });
    } catch (err) {
      if (requestId !== latestYearsRequest) return;
      set({
        yearsError: err instanceof Error ? err.message : "获取年份列表失败",
        yearsLoading: false,
      });
    }
  },
}));
