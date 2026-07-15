import { useActivityStore } from '../stores/activityStore'
import { useI18nStore } from '../stores/i18nStore'

interface TabOption {
  label: string
  value?: string
}

function useEntityTabs(): TabOption[] {
  const { t } = useI18nStore()
  return [
    { label: t('activity.all') },
    { label: t('activity.movie'), value: 'MOVIE' },
    { label: t('activity.tv'), value: 'TV_SHOW' },
    { label: t('activity.game'), value: 'GAME' },
  ]
}

function useActionTabs(): TabOption[] {
  const { t } = useI18nStore()
  return [
    { label: t('activity.all') },
    { label: t('activity.data_change'), value: 'DATA_CHANGE' },
    { label: t('activity.task'), value: 'TASK' },
  ]
}

function useTimeTabs(): TabOption[] {
  const { t } = useI18nStore()
  return [
    { label: t('activity.all') },
    { label: t('activity.today'), value: 'today' },
    { label: t('activity.7d'), value: '7d' },
    { label: t('activity.30d'), value: '30d' },
  ]
}

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
  const entityTabs = useEntityTabs()
  const actionTabs = useActionTabs()
  const timeTabs = useTimeTabs()
  const currentActionValue = filters.entityType === 'TASK' ? 'TASK' : filters.action

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
        activeValue={currentActionValue}
        onChange={(value) => setFilters(value === 'TASK'
          ? { ...filters, action: undefined, entityType: 'TASK' }
          : {
            ...filters,
            action: value,
            entityType: filters.entityType === 'TASK' ? undefined : filters.entityType,
          })}
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
