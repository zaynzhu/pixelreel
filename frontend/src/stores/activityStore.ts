import { create } from 'zustand'
import { apiFetch } from '../api'
import type { ActivityRecord, ActivityResponse } from '../types/activity'

interface ActivityFilters {
  action?: string
  entityType?: string
  entityId?: string
  from?: string
  to?: string
}

interface ActivityState {
  records: ActivityRecord[]
  nextCursor: string | null
  loading: boolean
  loadingMore: boolean
  error: string | null
  filters: ActivityFilters

  fetchRecords: () => Promise<void>
  fetchMore: () => Promise<void>
  setFilters: (filters: ActivityFilters) => void
  undo: (id: string) => Promise<void>
  fetchEntityHistory: (entityType: string, entityId: string) => Promise<ActivityRecord[]>
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  records: [],
  nextCursor: null,
  loading: false,
  loadingMore: false,
  error: null,
  filters: {},

  fetchRecords: async () => {
    set({ loading: true, error: null })
    try {
      const { filters } = get()
      const params = new URLSearchParams()
      if (filters.action) params.set('action', filters.action)
      if (filters.entityType) params.set('entityType', filters.entityType)
      if (filters.entityId) params.set('entityId', filters.entityId)
      if (filters.from) params.set('from', filters.from)
      if (filters.to) params.set('to', filters.to)
      params.set('limit', '50')

      const data = await apiFetch<ActivityResponse>(`/activity?${params.toString()}`)
      set({ records: data.records, nextCursor: data.nextCursor, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  fetchMore: async () => {
    const { nextCursor, loadingMore, filters } = get()
    if (!nextCursor || loadingMore) return

    set({ loadingMore: true })
    try {
      const params = new URLSearchParams()
      params.set('cursor', nextCursor)
      params.set('limit', '50')
      if (filters.action) params.set('action', filters.action)
      if (filters.entityType) params.set('entityType', filters.entityType)
      if (filters.entityId) params.set('entityId', filters.entityId)
      if (filters.from) params.set('from', filters.from)
      if (filters.to) params.set('to', filters.to)

      const data = await apiFetch<ActivityResponse>(`/activity?${params.toString()}`)
      set((state) => ({
        records: [...state.records, ...data.records],
        nextCursor: data.nextCursor,
        loadingMore: false,
      }))
    } catch (err: any) {
      set({ error: err.message, loadingMore: false })
    }
  },

  setFilters: (filters) => {
    set({ filters })
    get().fetchRecords()
  },

  undo: async (id: string) => {
    await apiFetch(`/activity/${id}/undo`, { method: 'POST' })
    get().fetchRecords()
  },

  fetchEntityHistory: async (entityType: string, entityId: string) => {
    const params = new URLSearchParams()
    params.set('entityType', entityType)
    params.set('entityId', entityId)
    params.set('limit', '50')
    const data = await apiFetch<ActivityResponse>(`/activity?${params.toString()}`)
    return data.records
  },
}))
