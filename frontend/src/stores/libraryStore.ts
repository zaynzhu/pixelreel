import { create } from "zustand";
import type { LibraryRecord, LibraryRecordUpdateInput } from "../types/library";
import { apiFetch } from "../api";

interface PaginatedResponse {
  records: LibraryRecord[];
  nextCursor: string | null;
}

type LibraryState = {
  records: LibraryRecord[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  saving: boolean;
  error: string | null;
  fetchRecords: () => Promise<void>;
  fetchMore: () => Promise<void>;
  updateRecord: (
    category: LibraryRecord["category"],
    id: number,
    payload: LibraryRecordUpdateInput
  ) => Promise<LibraryRecord | null>;
};

export const useLibraryStore = create<LibraryState>((set, get) => ({
  records: [],
  nextCursor: null,
  loading: false,
  loadingMore: false,
  saving: false,
  error: null,

  fetchRecords: async () => {
    set({ loading: true, error: null });
    try {
      const payload = await apiFetch<PaginatedResponse>("/library");
      set({ records: payload.records, nextCursor: payload.nextCursor, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "获取记录库失败",
        loading: false,
      });
    }
  },

  fetchMore: async () => {
    const { nextCursor, loadingMore } = get();
    if (!nextCursor || loadingMore) return;
    set({ loadingMore: true });
    try {
      const payload = await apiFetch<PaginatedResponse>(
        `/library?cursor=${encodeURIComponent(nextCursor)}&limit=50`
      );
      set({
        records: [...get().records, ...payload.records],
        nextCursor: payload.nextCursor,
        loadingMore: false,
      });
    } catch (err) {
      set({ loadingMore: false });
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