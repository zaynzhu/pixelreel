import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useActivityStore } from '../stores/activityStore'
import { useI18nStore } from '../stores/i18nStore'
import { toast } from '../stores/toastStore'
import type { ActivityAction, ActivityRecord } from '../types/activity'

interface ActivityTimelineProps {
  /** 只展示特定实体的活动记录 */
  entityType?: string
  /** 实体 ID */
  entityId?: string
  /** 紧凑模式：更小的间距和字号 */
  compact?: boolean
}

const ACTION_COLORS: Record<ActivityAction, string> = {
  CREATE: '#66ff66',
  UPDATE: '#d4ff00',
  DELETE: '#ff4444',
  TASK_START: '#888888',
  TASK_DONE: '#44aaff',
  TASK_FAIL: '#ff4444',
  TASK_CANCEL: '#ff8800',
  UNDO: '#ff8800',
}

/** 格式化时间为 MM-DD HH:mm */
function formatTime(iso: string): string {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

/** 截断过长的值 */
function truncate(val: unknown, max = 30): string {
  const s = String(val ?? '')
  return s.length > max ? s.slice(0, max) + '...' : s
}

/** 渲染变更摘要 */
function renderChangeSummary(record: ActivityRecord): React.ReactNode {
  const { action, oldValues, newValues, metadata } = record

  if (action === 'UPDATE' || action === 'UNDO') {
    if (!oldValues || !newValues) return null
    const keys = [...new Set([...Object.keys(oldValues), ...Object.keys(newValues)])]
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {keys.map((key) => (
          <span key={key} className="text-[10px]">
            <span className="text-[var(--muted)]">{key}</span>{' '}
            <span className="text-red-400 line-through">{truncate(oldValues[key])}</span>
            <span className="text-[var(--muted)]"> → </span>
            <span className="text-[var(--accent)]">{truncate(newValues[key])}</span>
          </span>
        ))}
      </div>
    )
  }

  if (action === 'CREATE') {
    if (!newValues) return null
    const parts: string[] = []
    if (newValues.status) parts.push(`status: ${newValues.status}`)
    if (newValues.rating != null) parts.push(`rating: ${newValues.rating}`)
    return (
      <span className="text-[10px] text-[var(--muted)]">
        {parts.join(' | ') || '-'}
      </span>
    )
  }

  if (action === 'DELETE') {
    if (!oldValues) return null
    const parts: string[] = []
    if (oldValues.rating != null) parts.push(`rating: ${oldValues.rating}`)
    if (oldValues.shortReview) parts.push(`review: ${truncate(oldValues.shortReview, 20)}`)
    return (
      <span className="text-[10px] text-[var(--muted)]">
        {parts.join(' | ') || '-'}
      </span>
    )
  }

  if (action === 'TASK_START') {
    return <span className="text-[10px] text-[var(--muted)]">TASK_START</span>
  }

  if (action === 'TASK_DONE' || action === 'TASK_FAIL' || action === 'TASK_CANCEL') {
    if (!metadata) return null
    const parts: string[] = []
    if (metadata.total != null) parts.push(`total: ${metadata.total}`)
    if (metadata.imported != null) parts.push(`imported: ${metadata.imported}`)
    if (metadata.skipped != null) parts.push(`skipped: ${metadata.skipped}`)
    if (metadata.processed != null) parts.push(`processed: ${metadata.processed}`)
    if (metadata.error) parts.push(`error: ${truncate(metadata.error, 40)}`)
    return (
      <span className="text-[10px] text-[var(--muted)]">
        {parts.join(' | ') || '-'}
      </span>
    )
  }

  return null
}

export default function ActivityTimeline({ entityType, entityId, compact }: ActivityTimelineProps) {
  const store = useActivityStore()
  const { t } = useI18nStore()
  // entity-specific 模式用本地状态，不污染全局 store
  const [entityRecords, setEntityRecords] = useState<ActivityRecord[]>([])
  const [entityLoading, setEntityLoading] = useState(false)
  const [entityError, setEntityError] = useState<string | null>(null)
  const latestEntityRequest = useRef(0)

  const isEntityMode = !!entityId
  const records = isEntityMode ? entityRecords : store.records
  const loading = isEntityMode ? entityLoading : store.loading
  const error = isEntityMode ? entityError : store.error

  const loadEntityHistory = useCallback(async () => {
    if (!entityId) return
    const requestId = ++latestEntityRequest.current
    setEntityLoading(true)
    setEntityError(null)
    setEntityRecords([])
    try {
      const nextRecords = await store.fetchEntityHistory(entityType || '', entityId)
      if (requestId !== latestEntityRequest.current) return
      setEntityRecords(nextRecords)
    } catch (reason) {
      if (requestId !== latestEntityRequest.current) return
      setEntityError(reason instanceof Error ? reason.message : t('activity.load_error'))
    } finally {
      if (requestId === latestEntityRequest.current) setEntityLoading(false)
    }
  }, [entityId, entityType, store.fetchEntityHistory, t])

  // entity 模式：加载特定条目历史
  useEffect(() => {
    void loadEntityHistory()
    return () => {
      latestEntityRequest.current += 1
    }
  }, [loadEntityHistory])

  // 全局模式：初始加载
  useEffect(() => {
    if (!isEntityMode) void store.fetchRecords()
  }, [store.fetchRecords, isEntityMode])

  // 无限滚动哨兵
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isEntityMode) return
    const sentinel = sentinelRef.current
    if (!sentinel || !store.nextCursor) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && store.nextCursor && !store.loadingMore) {
          void store.fetchMore()
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [store.nextCursor, store.loadingMore, store.fetchMore, isEntityMode])

  // 处理撤销
  const handleUndo = async (id: string) => {
    try {
      if (isEntityMode) {
        await store.undo(id)
        // 重新加载实体历史
        if (entityId) {
          store.fetchEntityHistory(entityType || '', entityId).then((r) => setEntityRecords(r))
        }
      } else {
        await store.undo(id)
      }
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : t('activity.undo_failed'), 'error')
    }
  }

  const showUndo = !entityId

  return (
    <div className="font-['JetBrains_Mono',monospace]">
      {/* 加载状态 */}
      {loading && records.length === 0 && (
        <div className="border border-[var(--line)] p-6 text-center text-[10px] text-[var(--accent)] uppercase tracking-[0.3em] font-bold relative overflow-hidden">
          <div className="absolute inset-0 bg-[var(--accent)]/10 animate-pulse" />
          <span className="relative z-10">{t('activity.loading')}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-4 border border-[var(--accent-deep)] bg-[rgba(255,68,0,0.08)] px-4 py-3 text-[10px] text-[var(--accent-deep)]">
          <span>{error || t('activity.load_error')}</span>
          <button
            type="button"
            onClick={() => isEntityMode ? void loadEntityHistory() : void store.retryFetch()}
            disabled={!isEntityMode && !store.failedFetch}
            className="brutal-btn shrink-0 px-3 text-[9px]"
          >
            {t('activity.retry')}
          </button>
        </div>
      )}

      {/* 空状态 */}
      {!loading && !error && records.length === 0 && (
        <div className="text-[10px] text-[var(--muted)] uppercase tracking-widest p-6 text-center">
          {t('activity.empty')}
        </div>
      )}

      {/* 记录列表 */}
      <div className={compact ? 'space-y-1' : 'space-y-2'}>
        {records.map((record) => (
          <ActivityRow
            key={record.id}
            record={record}
            compact={compact}
            showUndo={showUndo}
            onUndo={handleUndo}
          />
        ))}
      </div>

      {/* 无限滚动哨兵 */}
      {!isEntityMode && store.nextCursor && !store.failedFetch && <div ref={sentinelRef} className="h-1" />}

      {/* 加载更多提示 */}
      {!isEntityMode && store.loadingMore && (
        <div className="text-center text-[10px] text-[var(--muted)] uppercase tracking-widest py-4">
          {t('activity.loading_more')}
        </div>
      )}
    </div>
  )
}

// action 到 i18n key 的映射
const ACTION_I18N_MAP = {
  CREATE: 'activity.created',
  UPDATE: 'activity.updated',
  DELETE: 'activity.deleted',
  TASK_START: 'activity.task_start',
  TASK_DONE: 'activity.task_done',
  TASK_FAIL: 'activity.task_fail',
  TASK_CANCEL: 'activity.task_cancel',
  UNDO: 'activity.undone',
} as const;

/** 单条活动记录行 */
function ActivityRow({
  record,
  compact,
  showUndo,
  onUndo,
}: {
  record: ActivityRecord
  compact?: boolean
  showUndo: boolean
  onUndo: (id: string) => void
}) {
  const { t } = useI18nStore()
  const actionColor = ACTION_COLORS[record.action]
  const actionLabel = t(ACTION_I18N_MAP[record.action])
  const detailPath = record.action !== 'DELETE' && record.entityId
    ? entityDetailPath(record.entityType, record.entityId)
    : null

  return (
    <div
      className={`group flex items-start gap-3 border border-[var(--line)] bg-[var(--surface)] transition-colors hover:bg-[var(--surface-hover)] ${
        compact ? 'px-3 py-2' : 'px-4 py-3'
      }`}
    >
      {/* 时间 */}
      <span
        className={`shrink-0 text-[var(--muted)] tabular-nums ${
          compact ? 'text-[9px]' : 'text-[10px]'
        }`}
      >
        {formatTime(record.createdAt)}
      </span>

      {/* 操作徽章 */}
      <span
        className={`shrink-0 font-bold uppercase tracking-wider border ${
          compact ? 'text-[8px] px-1.5 py-0.5' : 'text-[9px] px-2 py-0.5'
        }`}
        style={{
          color: actionColor,
          borderColor: `${actionColor}4d`,
          background: `${actionColor}1a`,
        }}
      >
        {actionLabel}
      </span>

      {/* 实体标题 */}
      {detailPath ? (
        <Link
          to={detailPath}
          className={`shrink-0 truncate max-w-[200px] font-bold text-white hover:text-[var(--accent)] ${
            compact ? 'text-[10px]' : 'text-[11px]'
          }`}
        >
          {record.entityTitle}
        </Link>
      ) : (
        <span className={`shrink-0 truncate max-w-[200px] font-bold text-white ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
          {record.entityTitle}
        </span>
      )}

      {/* 变更摘要 */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {renderChangeSummary(record)}
      </div>

      {/* 撤销按钮 */}
      {showUndo && record.undoable && (
        <button
          onClick={() => onUndo(record.id)}
          className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-[var(--muted)] border border-[var(--line)] px-2 py-0.5 opacity-0 group-hover:opacity-100 hover:text-[var(--accent)] hover:border-[var(--accent)]/50 transition-all"
        >
          {t('activity.undo')}
        </button>
      )}
    </div>
  )
}

function entityDetailPath(entityType: string, entityId: string) {
  const categories: Record<string, string> = {
    MOVIE: 'movie',
    TV_SHOW: 'tv_show',
    GAME: 'game',
  }
  const category = categories[entityType]
  return category ? `/library/${category}/${entityId}` : null
}
