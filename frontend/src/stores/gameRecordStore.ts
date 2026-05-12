import { create } from "zustand";
import { apiFetch } from "../api";

export type RecordStatus = "UNSET" | "WANT" | "IN_PROGRESS" | "DONE";

export type GameRecord = {
  id: number;
  rawgId?: number | null;
  steamAppId?: number | null;
  xboxId?: string | null;
  psnId?: string | null;
  title: string;
  posterUrl?: string | null;
  status: RecordStatus;
  rating?: number | null;
  shortReview?: string | null;
};

export type GameRecordInput = Omit<GameRecord, "id">;

type GameRecordState = {
  records: GameRecord[];
  loading: boolean;
  error: string | null;
  fetchRecords: () => Promise<void>;
  createRecord: (payload: GameRecordInput) => Promise<GameRecord | null>;
  updateRecord: (id: number, payload: Partial<GameRecordInput>) => Promise<GameRecord | null>;
  removeRecord: (id: number) => Promise<void>;
  setStatus: (id: number, status: RecordStatus) => Promise<void>;
};

export const useGameRecordStore = create<GameRecordState>((set, get) => ({
  records: [],
  loading: false,
  error: null,

  fetchRecords: async () => {
    set({ loading: true, error: null });
    try {
      const payload = await apiFetch<GameRecord[]>("/games");
      set({ records: payload, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "获取失败",
        loading: false,
      });
    }
  },

  createRecord: async (payload) => {
    set({ loading: true, error: null });
    try {
      const created = await apiFetch<GameRecord>("/games", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      set({ records: [created, ...get().records], loading: false });
      return created;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "创建失败",
        loading: false,
      });
      return null;
    }
  },

  updateRecord: async (id, payload) => {
    set({ loading: true, error: null });
    try {
      const updated = await apiFetch<GameRecord>(`/games/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      set({
        records: get().records.map((record) =>
          record.id === id ? updated : record
        ),
        loading: false,
      });
      return updated;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "更新失败",
        loading: false,
      });
      return null;
    }
  },

  removeRecord: async (id) => {
    set({ loading: true, error: null });
    try {
      await apiFetch<void>(`/games/${id}`, { method: "DELETE" });
      set({
        records: get().records.filter((record) => record.id !== id),
        loading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "删除失败",
        loading: false,
      });
    }
  },

  setStatus: async (id, status) => {
    await get().updateRecord(id, { status });
  },
}));