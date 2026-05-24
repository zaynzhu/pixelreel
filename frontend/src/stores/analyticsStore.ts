import { create } from "zustand"
import type { AnalyticsData } from "../types/analytics"
import { apiFetch } from "../api"

type AnalyticsState = {
  data: AnalyticsData | null
  year: number
  loading: boolean
  error: string | null
  setYear: (year: number) => void
  fetchAnalytics: (year?: number) => Promise<void>
}

export const useAnalyticsStore = create<AnalyticsState>((set, get) => ({
  data: null,
  year: new Date().getFullYear(),
  loading: false,
  error: null,

  setYear: (year) => set({ year }),

  fetchAnalytics: async (year) => {
    const y = year ?? get().year
    set({ loading: true, error: null, year: y })
    try {
      const payload = await apiFetch<AnalyticsData>(`/analytics?year=${y}`)
      set({ data: payload, loading: false })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "获取分析数据失败",
        loading: false,
      })
    }
  },
}))
