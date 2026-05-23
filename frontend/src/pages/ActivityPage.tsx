import { ActivityFilters } from '../components/ActivityFilters'
import { ActivityTimeline } from '../components/ActivityTimeline'

export function ActivityPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl tracking-wider text-white uppercase">Activity Log</h1>
        <p className="text-[var(--muted)] text-xs mt-1 uppercase tracking-widest">操作记录</p>
      </div>

      <div className="border border-[var(--line)]">
        <ActivityFilters />
        <ActivityTimeline />
      </div>
    </div>
  )
}
