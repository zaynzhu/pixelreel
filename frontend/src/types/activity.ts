export type ActivityAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'TASK_START' | 'TASK_DONE' | 'TASK_FAIL' | 'TASK_CANCEL' | 'UNDO'
export type EntityType = 'MOVIE' | 'TV_SHOW' | 'GAME' | 'TASK'

export interface ActivityRecord {
  id: string
  action: ActivityAction
  entityType: EntityType
  entityId: string | null
  entityTitle: string
  oldValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  createdAt: string
  undoable: boolean
}

export interface ActivityResponse {
  records: ActivityRecord[]
  nextCursor: string | null
}
