import { create } from "zustand";
import type { LibraryRecord, LibraryRecordUpdateInput } from "../types/library";

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
      const response = await fetch("/api/library");
      if (!response.ok) {
        throw new Error(`获取记录库失败 (${response.status})`);
      }
      const payload = (await response.json()) as LibraryRecord[];
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
      const response = await fetch(`/api/library/${category}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`保存失败 (${response.status})`);
      }
      const updated = (await response.json()) as LibraryRecord;
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
