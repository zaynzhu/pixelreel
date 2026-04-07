import { create } from "zustand";
import type { ProfileSummary } from "../types/profile";

type ProfileState = {
  summary: ProfileSummary | null;
  loading: boolean;
  error: string | null;
  fetchSummary: () => Promise<void>;
};

export const useProfileStore = create<ProfileState>((set) => ({
  summary: null,
  loading: false,
  error: null,

  fetchSummary: async () => {
    set({ loading: true, error: null });
    try {
      const response = await fetch("/api/profile/summary");
      if (!response.ok) {
        throw new Error(`获取统计失败 (${response.status})`);
      }
      const payload = (await response.json()) as ProfileSummary;
      set({ summary: payload, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "获取统计失败",
        loading: false,
      });
    }
  },
}));
