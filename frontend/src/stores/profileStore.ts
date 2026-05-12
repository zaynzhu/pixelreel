import { create } from "zustand";
import type { ProfileSummary } from "../types/profile";
import { apiFetch } from "../api";

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
      const payload = await apiFetch<ProfileSummary>("/profile/summary");
      set({ summary: payload, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "获取统计失败",
        loading: false,
      });
    }
  },
}));