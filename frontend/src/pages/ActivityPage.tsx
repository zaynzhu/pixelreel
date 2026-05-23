import ActivityFilters from '../components/ActivityFilters'
import ActivityTimeline from '../components/ActivityTimeline'
import { useI18nStore } from '../stores/i18nStore'

export function ActivityPage() {
  const { t } = useI18nStore()

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl tracking-wider text-white uppercase">{t('activity.title')}</h1>
        <p className="text-[var(--muted)] text-xs mt-1 uppercase tracking-widest">{t('activity.desc')}</p>
      </div>

      <div className="border border-[var(--line)]">
        <ActivityFilters />
        <ActivityTimeline />
      </div>
    </div>
  )
}
