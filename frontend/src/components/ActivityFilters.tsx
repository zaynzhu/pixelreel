import { useActivityStore } from '../stores/activityStore'

interface TabOption {
  label: string
  value?: string
}

const entityTabs: TabOption[] = [
  { label: '全部' },
  { label: '电影', value: 'MOVIE' },
  { label: '剧集', value: 'TV_SHOW' },
  { label: '游戏', value: 'GAME' },
]

const actionTabs: TabOption[] = [
  { label: '全部' },
  { label: '数据变更', value: 'UPDATE' },
  { label: '任务', value: 'TASK_DONE' },
]

const timeTabs: TabOption[] = [
  { label: '全部' },
  { label: '今天', value: 'today' },
  { label: '7天', value: '7d' },
  { label: '30天', value: '30d' },
]

function toFromTime(value?: string): string | undefined {
  if (!value) return undefined
  const now = new Date()
  if (value === 'today') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return d.toISOString()
  }
  if (value === '7d') {
    return new Date(now.getTime() - 7 * 86400000).toISOString()
  }
  if (value === '30d') {
    return new Date(now.getTime() - 30 * 86400000).toISOString()
  }
  return undefined
}

function TabGroup({
  options,
  activeValue,
  onChange,
}: {
  options: TabOption[]
  activeValue?: string
  onChange: (value?: string) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      {options.map((opt) => {
        const isActive = opt.value === activeValue || (!opt.value && !activeValue)
        return (
          <button
            key={opt.label}
            onClick={() => onChange(opt.value)}
            className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider border transition-colors ${
              isActive
                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                : 'border-[var(--line)] text-[var(--muted)] hover:text-white hover:border-[var(--muted)]'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export default function ActivityFilters() {
  const filters = useActivityStore((s) => s.filters)
  const setFilters = useActivityStore((s) => s.setFilters)

  // 从 filters.from 反推出 time tab 值
  const currentTimeValue = (() => {
    if (!filters.from) return undefined
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    if (filters.from === today) return 'today'
    const d7 = new Date(now.getTime() - 7 * 86400000).toISOString()
    if (Math.abs(new Date(filters.from).getTime() - new Date(d7).getTime()) < 1000) return '7d'
    const d30 = new Date(now.getTime() - 30 * 86400000).toISOString()
    if (Math.abs(new Date(filters.from).getTime() - new Date(d30).getTime()) < 1000) return '30d'
    return undefined
  })()

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-4 py-2.5">
      <TabGroup
        options={entityTabs}
        activeValue={filters.entityType}
        onChange={(value) => setFilters({ ...filters, entityType: value })}
      />
      <div className="h-4 w-px bg-[var(--line)]" />
      <TabGroup
        options={actionTabs}
        activeValue={filters.action}
        onChange={(value) => setFilters({ ...filters, action: value })}
      />
      <div className="h-4 w-px bg-[var(--line)]" />
      <TabGroup
        options={timeTabs}
        activeValue={currentTimeValue}
        onChange={(value) => setFilters({ ...filters, from: toFromTime(value) })}
      />
    </div>
  )
}
