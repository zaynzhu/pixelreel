import { create } from "zustand";
import type { LibraryRecord, LibraryRecordUpdateInput } from "../types/library";
import { apiFetch } from "../api";

type LibraryState = {
  records: LibraryRecord[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  fetchRecords: () => Promise<void>;
  updateRecord: (
    category: LibraryRecord["category"],
    id: number,
    payload: LibraryRecordUpdateInput
  ) => Promise<LibraryRecord | null>;
};

export const useLibraryStore = create<LibraryState>((set, get) => ({
  records: [],
  loading: false,
  saving: false,
  error: null,

  fetchRecords: async () => {
    set({ loading: true, error: null });
    try {
      const payload = await apiFetch<LibraryRecord[]>("/library");
      set({ records: payload, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "获取记录库失败",
        loading: false,
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