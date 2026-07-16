import { create } from 'zustand'
import { apiFetch } from '../api'
import type { ActivityRecord, ActivityResponse } from '../types/activity'

interface ActivityFilters {
  action?: string
  entityType?: string
  entityId?: string
  from?: string
  to?: string
  timeRange?: string
}

interface ActivityState {
  records: ActivityRecord[]
  nextCursor: string | null
  loading: boolean
  loadingMore: boolean
  undoingIds: string[]
  error: string | null
  failedFetch: 'records' | 'more' | null
  filters: ActivityFilters

  fetchRecords: (filters?: ActivityFilters) => Promise<void>
  fetchMore: () => Promise<void>
  retryFetch: () => Promise<void>
  setFilters: (filters: ActivityFilters) => void
  undo: (id: string) => Promise<void>
  fetchEntityHistory: (entityType: string, entityId: string) => Promise<ActivityRecord[]>
}

let latestActivityRequest = 0

function filtersEqual(left: ActivityFilters, right: ActivityFilters) {
  return left.action === right.action
    && left.entityType === right.entityType
    && left.entityId === right.entityId
    && left.from === right.from
    && left.to === right.to
    && left.timeRange === right.timeRange
}

function buildActivityQuery(filters: ActivityFilters, cursor?: string | null) {
  const params = new URLSearchParams()
  if (cursor) params.set('cursor', cursor)
  if (filters.action) params.set('action', filters.action)
  if (filters.entityType) params.set('entityType', filters.entityType)
  if (filters.entityId) params.set('entityId', filters.entityId)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  params.set('limit', '50')
  return `/activity?${params.toString()}`
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  records: [],
  nextCursor: null,
  loading: false,
  loadingMore: false,
  undoingIds: [],
  error: null,
  failedFetch: null,
  filters: {},

  fetchRecords: async (filters) => {
    const nextFilters = filters ?? get().filters
    const current = get()
    const filtersChanged = !filtersEqual(nextFilters, current.filters)
    const requestId = ++latestActivityRequest
    set({
      records: filtersChanged ? [] : current.records,
      nextCursor: filtersChanged ? null : current.nextCursor,
      loading: true,
      loadingMore: false,
      error: null,
      failedFetch: null,
      filters: nextFilters,
    })
    try {
      const data = await apiFetch<ActivityResponse>(buildActivityQuery(nextFilters))
      if (requestId !== latestActivityRequest) return
      set({ records: data.records, nextCursor: data.nextCursor, loading: false })
    } catch (err: any) {
      if (requestId !== latestActivityRequest) return
      set({ error: err.message, failedFetch: 'records', loading: false })
    }
  },

  fetchMore: async () => {
    const { nextCursor, loadingMore, loading, filters } = get()
    if (!nextCursor || loadingMore || loading) return

    const cursor = nextCursor
    const requestId = latestActivityRequest
    set({ loadingMore: true, error: null, failedFetch: null })
    try {
      const data = await apiFetch<ActivityResponse>(buildActivityQuery(filters, cursor))
      if (requestId !== latestActivityRequest || get().nextCursor !== cursor) return
      set((state) => ({
        records: [...state.records, ...data.records],
        nextCursor: data.nextCursor,
        loadingMore: false,
      }))
    } catch (err: any) {
      if (requestId !== latestActivityRequest) return
      set({ error: err.message, failedFetch: 'more', loadingMore: false })
    }
  },

  retryFetch: async () => {
    const failedFetch = get().failedFetch
    if (failedFetch === 'more') {
      await get().fetchMore()
      return
    }
    if (failedFetch === 'records') {
      await get().fetchRecords()
    }
  },

  setFilters: (filters) => {
    void get().fetchRecords(filters)
  },

  undo: async (id: string) => {
    if (get().undoingIds.includes(id)) return
    set(state => ({ undoingIds: [...state.undoingIds, id] }))
    try {
      await apiFetch(`/activity/${id}/undo`, { method: 'POST' })
      set(state => ({
        records: state.records.map(record => (
          record.id === id ? { ...record, undoable: false } : record
        )),
      }))
      await get().fetchRecords()
    } finally {
      set(state => ({ undoingIds: state.undoingIds.filter(item => item !== id) }))
    }
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
