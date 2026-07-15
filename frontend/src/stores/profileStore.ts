import { create } from "zustand";
import type { ProfileSummary } from "../types/profile";
import { apiFetch } from "../api";

type ProfileState = {
  summary: ProfileSummary | null;
  loading: boolean;
  error: string | null;
  fetchSummary: () => Promise<void>;
};

let latestProfileRequest = 0;

export const useProfileStore = create<ProfileState>((set) => ({
  summary: null,
  loading: false,
  error: null,

  fetchSummary: async () => {
    const requestId = ++latestProfileRequest;
    set({ loading: true, error: null });
    try {
      const payload = await apiFetch<ProfileSummary>("/profile/summary");
      if (requestId !== latestProfileRequest) return;
      set({ summary: payload, loading: false });
    } catch (err) {
      if (requestId !== latestProfileRequest) return;
      set({
        error: err instanceof Error ? err.message : "获取统计失败",
        loading: false,
      });
    }
  },
}));
