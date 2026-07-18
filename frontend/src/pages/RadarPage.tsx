import { useEffect, useRef } from 'react';
import { useNewReleaseRadarStore } from '../stores/newReleaseRadarStore';
import { useI18nStore } from '../stores/i18nStore';
import { useTaskStore } from '../stores/taskStore';
import { toast } from '../stores/toastStore';
import { proxiedImageUrl } from '../imageProxy';
import { ImgWithFallback } from '../components/ImgWithFallback';
import type { RadarItem } from '../types/radar';

const CATEGORIES = ['now_playing', 'upcoming', 'on_the_air'] as const;
const PLATFORMS = ['', 'Netflix', 'Disney+', 'Apple TV+', 'Max', '优酷', '腾讯视频'];

function formatSyncTime(iso: string | null, t: ReturnType<typeof useI18nStore.getState>['t']) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return t('radar.time.justNow');
  if (diff < 3600000) return t('radar.time.minutesAgo', Math.floor(diff / 60000));
  if (diff < 86400000) return t('radar.time.hoursAgo', Math.floor(diff / 3600000));
  return t('radar.time.daysAgo', Math.floor(diff / 86400000));
}

export default function RadarPage() {
  const { items, total, page, category, platform, loading, syncing, syncTaskId, addingIds, error, failedRequest, lastSyncedAt, fetchItems, retryFetch, setCategory, setPlatform, triggerSync, finishSync, addToLibrary } = useNewReleaseRadarStore();
  const tasks = useTaskStore(state => state.tasks);
  const taskStateReady = useTaskStore(state => state.initialized && state.pollError === null);
  const { t } = useI18nStore();
  const runningSyncTask = tasks.some(task => task.type === 'new-release-radar-sync' && task.status === 'running');
  const syncInProgress = syncing || runningSyncTask;
  const wasSyncingRef = useRef(false);

  useEffect(() => { fetchItems(); }, []);

  useEffect(() => {
    if (!syncTaskId) return;
    const task = tasks.find(item => item.taskId === syncTaskId);
    if (!task || task.status === 'running') return;
    finishSync(task.status === 'completed' ? undefined : task.error || t('radar.new_release_sync_failed'));
  }, [finishSync, syncTaskId, t, tasks]);

  useEffect(() => {
    const wasSyncing = wasSyncingRef.current;
    wasSyncingRef.current = syncInProgress;
    if (wasSyncing && !syncInProgress) void fetchItems();
  }, [fetchItems, syncInProgress]);

  const handleAddToLibrary = async (item: RadarItem) => {
    if (item.inLibrary) return;
    const result = await addToLibrary(item.id);
    if (result) toast(t('radar.inLibrary'));
  };

  const justWatchUrl = (item: RadarItem) =>
    item.sourceUrl || `https://www.justwatch.com/cn/搜索?q=${encodeURIComponent(item.titleZh || item.title)}`;

  const catLabel = (cat: string) => {
    const map: Record<string, string> = {
      now_playing: t('radar.nowPlaying'),
      upcoming: t('radar.upcoming'),
      on_the_air: t('radar.onTheAir'),
    };
    return map[cat] ?? cat;
  };

  return (
    <div>
      {/* Header */}
      <section className="border border-[var(--line)] bg-[var(--surface)] px-6 py-8 sm:px-8">
        <span className="section-kicker">RADAR</span>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="font-display text-3xl text-white">{t('radar.heading')}</h2>
          <div className="flex items-center gap-4 text-xs text-[var(--muted)]">
            <span>{t('radar.lastSync')}: {formatSyncTime(lastSyncedAt, t)}</span>
            <button
              onClick={() => triggerSync()}
              disabled={!taskStateReady || syncInProgress}
              className="brutal-btn-accent px-3 py-1 text-xs"
            >
              {syncInProgress ? t('radar.syncing') : t('radar.refresh')}
            </button>
          </div>
        </div>
      </section>

      {/* Category tabs — 无 trending */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => setCategory('' as any)}
          className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${
            category === '' ? 'bg-[var(--accent)] text-black' : 'border border-[var(--line)] text-[var(--muted)] hover:text-white'
          }`}
        >
          {t('radar.all')}
        </button>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${
              category === cat ? 'bg-[var(--accent)] text-black' : 'border border-[var(--line)] text-[var(--muted)] hover:text-white'
            }`}
          >
            {catLabel(cat)}
          </button>
        ))}
      </div>

      {/* Platform chips */}
      <div className="mt-3 flex flex-wrap gap-2">
        {PLATFORMS.map(p => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition-all ${
              platform === p ? 'bg-[var(--accent-deep)] text-white' : 'border border-[var(--line)] text-[var(--muted)] hover:text-white'
            }`}
          >
            {p || t('radar.all')}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-4 border border-red-500/50 bg-red-500/10 p-4 text-xs text-red-300">
          <div>
            <p className="font-bold uppercase tracking-widest">{t('radar.loadError')}</p>
            <p className="mt-1 text-[10px] text-[var(--muted)]">{error}</p>
          </div>
          {failedRequest && (
            <button type="button" onClick={() => void retryFetch()} disabled={loading} className="brutal-btn">
              {t('radar.retry')}
            </button>
          )}
        </div>
      )}

      {/* Card grid */}
      {loading ? (
        <p className="mt-8 text-center text-sm text-[var(--muted)]">{t('radar.loadingSync')}</p>
      ) : items.length === 0 && !error ? (
        <p className="mt-8 text-center text-sm text-[var(--muted)]">{t('radar.noResults')}</p>
      ) : items.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map(item => (
            <div key={item.id} className="group border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
              <div className="relative aspect-[2/3] overflow-hidden bg-[var(--surface-hover)]">
                <ImgWithFallback
                  src={proxiedImageUrl(item.posterPath) ?? ''}
                  alt={item.titleZh || item.title}
                  className="h-full w-full object-cover transition-all group-hover:opacity-80"
                  fallback={
                    <div className="flex h-full w-full items-center justify-center bg-[#0a0a0a] relative overflow-hidden">
                      <span className="text-[10px] text-[var(--accent)] font-mono uppercase tracking-widest animate-pulse">
                        {item.type === 'tv' ? 'TV' : 'FILM'}
                      </span>
                    </div>
                  }
                />
                {item.platform && (
                  <span className="absolute top-2 left-2 neo-badge text-[9px]">{item.platform}</span>
                )}
                {item.voteAverage && (
                  <span className="absolute top-2 right-2 neo-badge-accent text-[9px]">
                    {typeof item.voteAverage === 'number' ? item.voteAverage.toFixed(1) : item.voteAverage}
                  </span>
                )}
              </div>
              <div className="p-3">
                <p className="truncate text-sm font-bold text-white">{item.titleZh || item.title}</p>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--muted)]">
                  {item.releaseDate && <span>{item.releaseDate}</span>}
                  <span className="neo-badge">{t(`radar.sourceTag.${item.source}` as any)}</span>
                </div>
                <div className="mt-2 flex gap-2">
                  {item.inLibrary ? (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {t('radar.inLibrary')}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleAddToLibrary(item)}
                      disabled={addingIds.includes(item.id)}
                      className="brutal-btn-accent px-2 py-1 text-[10px]"
                    >
                      {addingIds.includes(item.id) ? t('radar.addingToLibrary') : t('radar.addToLibrary')}
                    </button>
                  )}
                  <a
                    href={justWatchUrl(item)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="brutal-btn px-2 py-1 text-[10px]"
                  >
                    {t('radar.whereToWatch')}
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Pagination */}
      {total > 40 && (
        <div className="mt-6 flex justify-center gap-4">
          <button
            onClick={() => fetchItems({ page: page - 1 })}
            disabled={page <= 1 || loading}
            className="brutal-btn px-4 py-2 text-xs"
          >
            ←
          </button>
          <span className="flex items-center text-xs text-[var(--muted)]">
            {page} / {Math.ceil(total / 40)}
          </span>
          <button
            onClick={() => fetchItems({ page: page + 1 })}
            disabled={page * 40 >= total || loading}
            className="brutal-btn px-4 py-2 text-xs"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
