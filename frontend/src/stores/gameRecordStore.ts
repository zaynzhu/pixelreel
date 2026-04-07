import { create } from "zustand";

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
      const response = await fetch("/api/games");
      if (!response.ok) {
        throw new Error(`获取失败 (${response.status})`);
      }
      const payload = (await response.json()) as GameRecord[];
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
      const response = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`创建失败 (${response.status})`);
      }
      const created = (await response.json()) as GameRecord;
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
      const response = await fetch(`/api/games/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`更新失败 (${response.status})`);
      }
      const updated = (await response.json()) as GameRecord;
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
      const response = await fetch(`/api/games/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`删除失败 (${response.status})`);
      }
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
