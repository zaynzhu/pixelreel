import { create } from "zustand";
import type {
  LibraryCategory,
  LibraryRecord,
  LibraryRecordUpdateInput,
  LibraryReviewFilter,
  LibrarySourceFilter,
  RecordStatus,
} from "../types/library";
import { apiFetch } from "../api";

interface PaginatedResponse {
  records: LibraryRecord[];
  nextCursor: string | null;
  totals?: {
    total: number;
    rated: number;
    reviewed: number;
    completed: number;
  };
}

type LibraryState = {
  records: LibraryRecord[];
  nextCursor: string | null;
  pageSize: number;
  totals: { total: number; rated: number; reviewed: number; completed: number };
  loading: boolean;
  loadingMore: boolean;
  saving: boolean;
  error: string | null;
  filterCategory: "all" | LibraryCategory;
  filterStatus: "all" | RecordStatus;
  filterQuery: string;
  filterSource: LibrarySourceFilter;
  filterReview: LibraryReviewFilter;
  fetchRecords: (options?: {
    limit?: number;
    category?: "all" | LibraryCategory;
    status?: "all" | RecordStatus;
    query?: string;
    source?: LibrarySourceFilter;
    review?: LibraryReviewFilter;
  }) => Promise<void>;
  fetchMore: () => Promise<void>;
  updateRecord: (
    category: LibraryRecord["category"],
    id: number,
    payload: LibraryRecordUpdateInput
  ) => Promise<LibraryRecord | null>;
};

let latestFetchRequest = 0;

function recordKey(record: LibraryRecord) {
  return `${record.category}:${record.id}`;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  records: [],
  nextCursor: null,
  pageSize: 50,
  totals: { total: 0, rated: 0, reviewed: 0, completed: 0 },
  loading: false,
  loadingMore: false,
  saving: false,
  error: null,
  filterCategory: "all",
  filterStatus: "all",
  filterQuery: "",
  filterSource: "all",
  filterReview: "all",

  fetchRecords: async (options) => {
    const limit = Math.min(Math.max(options?.limit ?? get().pageSize, 1), 200);
    const category = options?.category ?? get().filterCategory;
    const status = options?.status ?? get().filterStatus;
    const filterQuery = options?.query ?? get().filterQuery;
    const source = options?.source ?? get().filterSource;
    const review = options?.review ?? get().filterReview;
    const query = new URLSearchParams({ limit: String(limit) });
    if (category !== "all") query.set("category", category);
    if (status !== "all") query.set("status", status);
    if (filterQuery) query.set("query", filterQuery);
    if (source !== "all") query.set("source", source);
    if (review !== "all") query.set("review", review);
    const requestId = ++latestFetchRequest;
    set({
      loading: true,
      error: null,
      nextCursor: null,
      pageSize: limit,
      filterCategory: category,
      filterStatus: status,
      filterQuery,
      filterSource: source,
      filterReview: review,
    });
    try {
      const payload = await apiFetch<PaginatedResponse>(`/library?${query.toString()}`);
      if (requestId !== latestFetchRequest) return;
      set({
        records: payload.records,
        nextCursor: payload.nextCursor,
        totals: payload.totals ?? get().totals,
        loading: false,
      });
    } catch (err) {
      if (requestId !== latestFetchRequest) return;
      set({
        error: err instanceof Error ? err.message : "获取记录库失败",
        loading: false,
      });
    }
  },

  fetchMore: async () => {
    const {
      nextCursor,
      loadingMore,
      loading,
      pageSize,
      filterCategory,
      filterStatus,
      filterQuery,
      filterSource,
      filterReview,
    } = get();
    if (!nextCursor || loadingMore || loading) return;
    const cursor = nextCursor;
    set({ loadingMore: true, error: null });
    try {
      const query = new URLSearchParams({
        cursor,
        limit: String(pageSize),
        includeTotals: "false",
      });
      if (filterCategory !== "all") query.set("category", filterCategory);
      if (filterStatus !== "all") query.set("status", filterStatus);
      if (filterQuery) query.set("query", filterQuery);
      if (filterSource !== "all") query.set("source", filterSource);
      if (filterReview !== "all") query.set("review", filterReview);
      const payload = await apiFetch<PaginatedResponse>(`/library?${query.toString()}`);
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
        error: err instanceof Error ? err.message : "加载更多记录失败",
        loadingMore: false,
      });
    }
  },

  updateRecord: async (category, id, payload) => {
    set({ saving: true, error: null });
    try {
      const updated = await apiFetch<LibraryRecord>(`/library/${category}/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      set({
        records: get().records.map((record) =>
          record.id === id && record.category === category ? updated : record
        ),
        saving: false,
      });
      return updated;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "保存失败",
        saving: false,
      });
      return null;
    }
  },
}));
