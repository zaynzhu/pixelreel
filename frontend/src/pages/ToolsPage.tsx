import { useEffect, useRef, useState } from 'react';
import { useI18nStore } from '../stores/i18nStore';
import { apiDownload, apiFetch } from '../api';
import { toast } from '../stores/toastStore';
import { confirmDialog } from '../components/Toast';
import { ImgWithFallback } from '../components/ImgWithFallback';
import { proxiedImageUrl } from '../imageProxy';
import { Download, ShieldCheck, Upload } from 'lucide-react';

interface SearchResult {
  id: number;
  category: 'movie' | 'tv_show';
  title: string;
  posterUrl?: string | null;
  doubanDate?: string | null;
  doubanId?: string | null;
  tmdbId?: number | null;
}

interface SearchResponse {
  results: SearchResult[];
}

interface ConvertResponse {
  success: boolean;
  newId?: string;
  error?: string;
}

interface ExportSummary {
  version: number
  recordCount: number
  platformProfileCount: number
  recordsSha256: string
}

interface LibraryExportSnapshot {
  format?: unknown
  version?: unknown
  counts?: {
    total?: unknown
    platformProfiles?: unknown
  }
  integrity?: {
    algorithm?: unknown
    recordsSha256?: unknown
  }
  records?: unknown
}

interface RestoreComparisonCounts {
  snapshotOnly: number
  different: number
  unchanged: number
  conflicts: number
  currentOnly: number
}

interface RestoreConflict {
  category: 'movie' | 'tvShow' | 'game' | 'platformProfile'
  snapshotId: string
  title: string
  currentIds: string[]
  reason: 'multipleCurrentMatches' | 'profileOwnerMismatch'
}

interface RestorePreviewResponse {
  valid: true
  readOnly: true
  snapshot: {
    format: string
    version: number
    exportedAt: string
    counts: {
      movies: number
      tvShows: number
      games: number
      platformProfiles: number
      total: number
    }
    recordsSha256: string
  }
  current: {
    counts: {
      movies: number
      tvShows: number
      games: number
      platformProfiles: number
      total: number
    }
  }
  comparison: {
    summary: RestoreComparisonCounts
    movies: RestoreComparisonCounts
    tvShows: RestoreComparisonCounts
    games: RestoreComparisonCounts
    platformProfiles: RestoreComparisonCounts
  }
  hasConflicts: boolean
  conflicts: RestoreConflict[]
  omittedConflictCount: number
}

const RESTORE_PREVIEW_MAX_BYTES = 50 * 1024 * 1024
const RESTORE_CATEGORY_KEYS = {
  movie: 'tools.restore.category.movie',
  tvShow: 'tools.restore.category.tv',
  game: 'tools.restore.category.game',
  platformProfile: 'tools.restore.category.profiles',
} as const
const RESTORE_CONFLICT_REASON_KEYS = {
  multipleCurrentMatches: 'tools.restore.conflict.multiple_matches',
  profileOwnerMismatch: 'tools.restore.conflict.owner_mismatch',
} as const

async function verifyExportSnapshot(
  blob: Blob,
  metadata: {
    exportVersion: number | null
    recordCount: number | null
    platformProfileCount: number | null
    recordsSha256: string | null
  },
): Promise<ExportSummary | null> {
  if (
    metadata.exportVersion == null
    || metadata.recordCount == null
    || metadata.platformProfileCount == null
    || !metadata.recordsSha256
  ) return null

  let snapshot: LibraryExportSnapshot
  try {
    snapshot = JSON.parse(await blob.text()) as LibraryExportSnapshot
  } catch {
    return null
  }

  const recordsJson = JSON.stringify(snapshot.records)
  if (
    snapshot.format !== 'pixelreel-library-export'
    || snapshot.version !== metadata.exportVersion
    || snapshot.counts?.total !== metadata.recordCount
    || snapshot.counts?.platformProfiles !== metadata.platformProfileCount
    || snapshot.integrity?.algorithm !== 'sha256'
    || snapshot.integrity.recordsSha256 !== metadata.recordsSha256
    || recordsJson == null
  ) return null

  const hashBytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(recordsJson),
  )
  const calculatedHash = Array.from(new Uint8Array(hashBytes))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
  if (calculatedHash !== metadata.recordsSha256) return null

  return {
    version: metadata.exportVersion,
    recordCount: metadata.recordCount,
    platformProfileCount: metadata.platformProfileCount,
    recordsSha256: calculatedHash,
  }
}

export default function ToolsPage() {
  const { t, lang } = useI18nStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [failedSearchQuery, setFailedSearchQuery] = useState<string | null>(null);
  const [resultQuery, setResultQuery] = useState('');
  const [converting, setConverting] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastExport, setLastExport] = useState<ExportSummary | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [restorePreview, setRestorePreview] = useState<RestorePreviewResponse | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [previewingRestore, setPreviewingRestore] = useState(false)
  const latestSearchRequest = useRef(0);
  const latestRestoreRequest = useRef(0)
  const restoreAbortController = useRef<AbortController | null>(null)
  const conversionRequestActive = useRef(false);

  useEffect(() => () => {
    latestSearchRequest.current++;
    latestRestoreRequest.current++
    restoreAbortController.current?.abort()
    conversionRequestActive.current = false;
  }, []);

  const handleExport = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const { blob, filename, metadata } = await apiDownload('/tools/export-library')
      const summary = await verifyExportSnapshot(blob, metadata)
      if (!summary) throw new Error(t('tools.export.verify_failed'))

      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename || 'pixelreel-library.json'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 0)
      setLastExport(summary)
      toast(t(
        'tools.export.success_summary',
        summary.recordCount,
        summary.platformProfileCount,
      ))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('tools.export.failed'), 'error')
    } finally {
      setExporting(false)
    }
  }

  const handleRestoreFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    latestRestoreRequest.current++
    restoreAbortController.current?.abort()
    restoreAbortController.current = null
    setRestoreFile(file)
    setRestorePreview(null)
    setPreviewingRestore(false)
    setRestoreError(
      file && file.size > RESTORE_PREVIEW_MAX_BYTES
        ? t('tools.restore.too_large')
        : null,
    )
  }

  const handleRestorePreview = async () => {
    if (!restoreFile || previewingRestore || restoreFile.size > RESTORE_PREVIEW_MAX_BYTES) return
    const requestId = ++latestRestoreRequest.current
    const controller = new AbortController()
    restoreAbortController.current?.abort()
    restoreAbortController.current = controller
    setPreviewingRestore(true)
    setRestoreError(null)
    setRestorePreview(null)

    const formData = new FormData()
    formData.append('file', restoreFile)
    try {
      const preview = await apiFetch<RestorePreviewResponse>('/tools/restore-preview', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })
      if (requestId !== latestRestoreRequest.current || controller.signal.aborted) return
      setRestorePreview(preview)
    } catch (reason) {
      if (requestId !== latestRestoreRequest.current || controller.signal.aborted) return
      setRestoreError(reason instanceof Error ? reason.message : t('tools.restore.failed'))
    } finally {
      if (requestId === latestRestoreRequest.current) {
        setPreviewingRestore(false)
        restoreAbortController.current = null
      }
    }
  }

  const handleSearch = async (requestedQuery = query.trim()) => {
    if (!requestedQuery) return;
    const queryChanged = requestedQuery !== resultQuery;
    const requestId = ++latestSearchRequest.current;
    setSearching(true);
    setSearched(true);
    setSearchError(null);
    setFailedSearchQuery(null);
    if (queryChanged) setResults([]);
    try {
      const data = await apiFetch<SearchResponse>(`/tools/search?query=${encodeURIComponent(requestedQuery)}`);
      if (requestId !== latestSearchRequest.current) return;
      setResults(data.results || []);
      setResultQuery(requestedQuery);
    } catch (reason) {
      if (requestId !== latestSearchRequest.current) return;
      setSearchError(reason instanceof Error ? reason.message : t('tools.convert.search_failed'));
      setFailedSearchQuery(requestedQuery);
    } finally {
      if (requestId === latestSearchRequest.current) setSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleSearch();
  };

  const handleConvert = async (record: SearchResult) => {
    if (conversionRequestActive.current) return;
    conversionRequestActive.current = true;
    const targetCategory = record.category === 'movie' ? 'tv_show' : 'movie';
    const confirmMsg = t('tools.convert.confirm');
    const recordKey = `${record.category}:${record.id}`;
    try {
      if (!(await confirmDialog(confirmMsg))) return;
      setConverting(recordKey);
      const data = await apiFetch<ConvertResponse>('/tools/convert-category', {
        method: 'POST',
        body: JSON.stringify({
          id: record.id,
          from: record.category,
          to: targetCategory,
        }),
      });
      if (data.success) {
        toast(t('tools.convert.success', String(data.newId)));
        setResults((prev) => prev.filter((item) => (
          item.id !== record.id || item.category !== record.category
        )));
      } else {
        toast(`${t('tools.convert.failed')}: ${data.error || 'Unknown error'}`, 'error');
      }
    } catch (e: any) {
      toast(`${t('tools.convert.failed')}: ${e.message}`, 'error');
    } finally {
      conversionRequestActive.current = false;
      setConverting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border border-[var(--line)] bg-[var(--surface)] p-6 relative">
        <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[var(--accent)]" />
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-[var(--accent)]" />
        <span className="section-kicker">{t('tools.kicker')}</span>
        <h1 className="text-2xl text-white font-display">{t('tools.title')}</h1>
        <p className="mt-2 text-xs text-[var(--muted)]">{t('tools.desc')}</p>
      </div>

      <section className="overflow-hidden border border-[var(--accent)]/40 bg-[var(--surface)]">
        <div className="grid gap-px bg-[var(--line)] lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="bg-[var(--surface)] p-6">
            <div className="flex items-start gap-4">
              <div className="border border-[var(--accent)] p-3 text-[var(--accent)]">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <span className="section-kicker">{t('tools.export.kicker')}</span>
                <h2 className="font-display text-2xl text-white">{t('tools.export.title')}</h2>
                <p className="mt-2 max-w-2xl text-xs leading-6 text-[var(--muted)]">{t('tools.export.desc')}</p>
              </div>
            </div>
            <div className="mt-6 grid gap-px bg-[var(--line)] sm:grid-cols-3">
              <ExportSeal label={t('tools.export.scope')} value={t('tools.export.scope_value')} />
              <ExportSeal label={t('tools.export.douban')} value={t('tools.export.douban_value')} />
              <ExportSeal label={t('tools.export.secrets')} value={t('tools.export.secrets_value')} />
            </div>
            {lastExport && (
              <div role="status" className="mt-4 border border-[var(--accent)] bg-[rgba(212,255,0,0.04)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--accent)]">
                    {t('tools.export.verified')}
                  </span>
                  <span className="font-mono text-[9px] text-[var(--muted)]">
                    V{lastExport.version} // {t(
                      'tools.export.summary',
                      lastExport.recordCount,
                      lastExport.platformProfileCount,
                    )}
                  </span>
                </div>
                <p className="mt-3 font-mono text-[8px] uppercase tracking-wider text-[var(--muted)]">
                  {t('tools.export.checksum')}
                </p>
                <code className="mt-1 block break-all font-mono text-[9px] text-white">
                  {lastExport.recordsSha256}
                </code>
              </div>
            )}
          </div>
          <div className="flex flex-col justify-between bg-[#080808] p-6">
            <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[var(--muted)]">
              {t('tools.export.format')}
            </div>
            <button type="button" onClick={() => void handleExport()} disabled={exporting} className="brutal-btn-accent mt-10 w-full justify-between">
              <span>{exporting ? t('tools.export.exporting') : t('tools.export.action')}</span>
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden border border-[var(--line)] bg-[var(--surface)]">
        <div className="grid gap-px bg-[var(--line)] lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="bg-[var(--surface)] p-6">
            <div className="flex items-start gap-4">
              <div className="border border-[var(--line)] p-3 text-white">
                <Upload className="h-6 w-6" />
              </div>
              <div>
                <span className="section-kicker">{t('tools.restore.kicker')}</span>
                <h2 className="font-display text-2xl text-white">{t('tools.restore.title')}</h2>
                <p className="mt-2 max-w-2xl text-xs leading-6 text-[var(--muted)]">
                  {t('tools.restore.desc')}
                </p>
              </div>
            </div>

            <div className="mt-5 border border-[var(--accent)]/40 bg-[rgba(212,255,0,0.04)] p-4">
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--accent)]">
                {t('tools.restore.read_only')}
              </p>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                {t('tools.restore.read_only_desc')}
              </p>
            </div>

            <label className="mt-5 block" htmlFor="restore-preview-file">
              <span className="mb-2 block font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--muted)]">
                {t('tools.restore.file_label')}
              </span>
              <input
                id="restore-preview-file"
                type="file"
                accept=".json,application/json"
                onChange={handleRestoreFileChange}
                className="tech-input w-full text-xs file:mr-4 file:border-0 file:bg-[var(--accent)] file:px-3 file:py-2 file:font-mono file:text-[9px] file:font-bold file:uppercase file:text-black"
                aria-describedby="restore-preview-file-hint"
              />
            </label>
            <p id="restore-preview-file-hint" className="mt-2 font-mono text-[9px] text-[var(--muted)]">
              {t('tools.restore.file_hint')}
            </p>
            {restoreFile && (
              <p className="mt-3 break-all text-xs text-white">
                {t(
                  'tools.restore.selected_file',
                  restoreFile.name,
                  (restoreFile.size / 1024 / 1024).toFixed(2),
                )}
              </p>
            )}
          </div>

          <div className="flex flex-col justify-between bg-[#080808] p-6">
            <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[var(--muted)]">
              {t('tools.restore.format')}
            </div>
            <button
              type="button"
              onClick={() => void handleRestorePreview()}
              disabled={!restoreFile || previewingRestore || restoreFile.size > RESTORE_PREVIEW_MAX_BYTES}
              className="brutal-btn mt-10 w-full justify-between"
            >
              <span>
                {previewingRestore ? t('tools.restore.previewing') : t('tools.restore.action')}
              </span>
              <ShieldCheck className="h-4 w-4" />
            </button>
          </div>
        </div>

        {restoreError && (
          <div role="alert" className="border-t border-red-500/50 bg-red-500/10 p-4 text-xs text-red-300">
            <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-red-400">
              {t('tools.restore.failed')}
            </div>
            <p className="mt-1 break-all">{restoreError}</p>
          </div>
        )}

        {restorePreview && (
          <div role="status" className="border-t border-[var(--line)] bg-[#080808] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="section-kicker">{t('tools.restore.verified')}</span>
                <h3 className="mt-1 font-display text-xl text-white">
                  {t(
                    'tools.restore.manifest',
                    restorePreview.snapshot.counts.total,
                    restorePreview.snapshot.counts.platformProfiles,
                    restorePreview.current.counts.total,
                    restorePreview.current.counts.platformProfiles,
                  )}
                </h3>
              </div>
              <div className="text-right font-mono text-[9px] text-[var(--muted)]">
                <div>V{restorePreview.snapshot.version}</div>
                <div className="mt-1">
                  {new Date(restorePreview.snapshot.exportedAt).toLocaleString(
                    lang === 'zh' ? 'zh-CN' : 'en-US',
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-px bg-[var(--line)] grid-cols-2 lg:grid-cols-5">
              <RestoreMetric label={t('tools.restore.snapshot_only')} value={restorePreview.comparison.summary.snapshotOnly} />
              <RestoreMetric label={t('tools.restore.different')} value={restorePreview.comparison.summary.different} />
              <RestoreMetric label={t('tools.restore.unchanged')} value={restorePreview.comparison.summary.unchanged} />
              <RestoreMetric label={t('tools.restore.conflicts')} value={restorePreview.comparison.summary.conflicts} danger={restorePreview.hasConflicts} />
              <RestoreMetric label={t('tools.restore.current_only')} value={restorePreview.comparison.summary.currentOnly} />
            </div>

            <div className="mt-5 overflow-x-auto border border-[var(--line)]">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[1.4fr_repeat(5,1fr)] gap-px bg-[var(--line)] font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--muted)]">
                  <div className="bg-[var(--surface)] p-3">{t('tools.restore.category')}</div>
                  <div className="bg-[var(--surface)] p-3 text-right">{t('tools.restore.snapshot_only')}</div>
                  <div className="bg-[var(--surface)] p-3 text-right">{t('tools.restore.different')}</div>
                  <div className="bg-[var(--surface)] p-3 text-right">{t('tools.restore.unchanged')}</div>
                  <div className="bg-[var(--surface)] p-3 text-right">{t('tools.restore.conflicts')}</div>
                  <div className="bg-[var(--surface)] p-3 text-right">{t('tools.restore.current_only')}</div>
                </div>
                {([
                  [t('tools.restore.category.movie'), restorePreview.comparison.movies],
                  [t('tools.restore.category.tv'), restorePreview.comparison.tvShows],
                  [t('tools.restore.category.game'), restorePreview.comparison.games],
                  [t('tools.restore.category.profiles'), restorePreview.comparison.platformProfiles],
                ] as Array<[string, RestoreComparisonCounts]>).map(([label, counts]) => (
                  <div key={label} className="grid grid-cols-[1.4fr_repeat(5,1fr)] gap-px border-t border-[var(--line)] bg-[var(--line)] text-xs text-white">
                    <div className="bg-[#080808] p-3 font-bold">{label}</div>
                    <div className="bg-[#080808] p-3 text-right">{counts.snapshotOnly}</div>
                    <div className="bg-[#080808] p-3 text-right">{counts.different}</div>
                    <div className="bg-[#080808] p-3 text-right">{counts.unchanged}</div>
                    <div className={counts.conflicts > 0 ? 'bg-red-500/10 p-3 text-right text-red-300' : 'bg-[#080808] p-3 text-right'}>{counts.conflicts}</div>
                    <div className="bg-[#080808] p-3 text-right">{counts.currentOnly}</div>
                  </div>
                ))}
              </div>
            </div>

            {restorePreview.hasConflicts ? (
              <div className="mt-5 border border-red-500/50 bg-red-500/10 p-4">
                <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-red-400">
                  {t('tools.restore.conflict_title')}
                </div>
                <div className="mt-3 space-y-3">
                  {restorePreview.conflicts.map(conflict => (
                    <div key={`${conflict.category}:${conflict.snapshotId}`} className="border-t border-red-500/20 pt-3 first:border-t-0 first:pt-0">
                      <div className="text-xs font-bold text-white">
                        {t(RESTORE_CATEGORY_KEYS[conflict.category])} // {conflict.title}
                      </div>
                      <p className="mt-1 text-xs text-red-200">
                        {t(RESTORE_CONFLICT_REASON_KEYS[conflict.reason])}
                      </p>
                      <p className="mt-1 font-mono text-[9px] text-[var(--muted)]">
                        {t('tools.restore.conflict_ids', conflict.currentIds.join(', '))}
                      </p>
                    </div>
                  ))}
                  {restorePreview.omittedConflictCount > 0 && (
                    <p className="font-mono text-[9px] text-red-300">
                      {t('tools.restore.conflict_omitted', restorePreview.omittedConflictCount)}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-5 border border-[var(--accent)]/40 bg-[rgba(212,255,0,0.04)] p-4 text-xs text-[var(--accent)]">
                {t('tools.restore.no_conflicts')}
              </div>
            )}

            <p className="mt-5 font-mono text-[8px] uppercase tracking-wider text-[var(--muted)]">
              {t('tools.export.checksum')}
            </p>
            <code className="mt-1 block break-all font-mono text-[9px] text-white">
              {restorePreview.snapshot.recordsSha256}
            </code>
          </div>
        )}
      </section>

      {/* Convert Record Type */}
      <div className="border border-[var(--line)] bg-[var(--surface)] p-6">
        <h2 className="text-sm font-bold text-white mb-2 font-display uppercase tracking-wider">
          {t('tools.convert.title')}
        </h2>
        <p className="text-xs text-[var(--muted)] mb-4">{t('tools.convert.desc')}</p>

        {/* Search bar */}
        <div className="flex gap-3 mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('tools.convert.search_placeholder')}
            className="tech-input flex-1"
            disabled={searching}
          />
          <button
            onClick={() => void handleSearch()}
            disabled={searching || !query.trim()}
            className="brutal-btn-accent px-6"
          >
            {searching ? t('tools.convert.searching') : t('tools.convert.search')}
          </button>
        </div>

        {/* Results */}
        {searchError && !searching && (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-4 border border-red-500/50 bg-red-500/10 p-4 text-xs text-red-300">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-red-400">
                {t('tools.convert.search_failed')}
              </div>
              <p className="mt-1 break-all">{searchError}</p>
            </div>
            <button type="button" onClick={() => void handleSearch(failedSearchQuery ?? undefined)} className="brutal-btn">
              {t('tools.convert.search_retry')}
            </button>
          </div>
        )}

        {searched && !searching && !searchError && results.length === 0 && (
          <div className="text-center py-8 text-[var(--muted)] text-xs uppercase tracking-widest">
            {t('tools.convert.no_results')}
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-3">
            {results.map((item) => {
              const posterSrc = proxiedImageUrl(item.posterUrl);
              const isConverting = converting === `${item.category}:${item.id}`;
              const targetType = item.category === 'movie' ? 'tv_show' : 'movie';

              return (
                <div
                  key={`${item.category}-${item.id}`}
                  className="flex items-center gap-4 p-3 border border-[var(--line)] bg-[var(--surface-hover)]"
                >
                  {/* Poster */}
                  <div className="w-12 h-16 flex-shrink-0 bg-[var(--surface)] overflow-hidden">
                    {posterSrc ? (
                      <ImgWithFallback
                        src={posterSrc}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        fallback={
                          <div className="w-full h-full flex items-center justify-center text-[var(--muted)] text-[8px]">
                            N/A
                          </div>
                        }
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[var(--muted)] text-[8px]">
                        N/A
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{item.title}</div>
                    <div className="flex items-center gap-2 mt-1">
                      {/* Category tag */}
                      <span
                        className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border"
                        style={{
                          color: item.category === 'movie' ? 'var(--accent)' : 'var(--accent-deep)',
                          borderColor: item.category === 'movie' ? 'var(--accent)' : 'var(--accent-deep)',
                        }}
                      >
                        {item.category === 'movie' ? 'MOVIE' : 'TV'}
                      </span>
                      {/* Source tag */}
                      {item.doubanId && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border border-[var(--line)] text-[var(--muted)]">
                          DOUBAN
                        </span>
                      )}
                      {item.tmdbId && !item.doubanId && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border border-[var(--line)] text-[var(--muted)]">
                          TMDB
                        </span>
                      )}
                      {/* Date */}
                      {item.doubanDate && (
                        <span className="text-[9px] text-[var(--muted)]">
                          {item.doubanDate}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Convert button */}
                  <button
                    onClick={() => handleConvert(item)}
                    disabled={converting !== null}
                    className={`brutal-btn px-4 text-[10px] ${
                      converting !== null ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isConverting
                      ? t('tools.convert.converting')
                      : targetType === 'tv_show'
                        ? t('tools.convert.to_tv')
                        : t('tools.convert.to_movie')}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ExportSeal({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0a0a0a] p-4">
      <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-white">{value}</div>
    </div>
  )
}

function RestoreMetric({
  label,
  value,
  danger = false,
}: {
  label: string
  value: number
  danger?: boolean
}) {
  return (
    <div className="bg-[#080808] p-4">
      <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--muted)]">{label}</div>
      <div className={`mt-2 font-display text-2xl ${danger ? 'text-red-400' : 'text-white'}`}>{value}</div>
    </div>
  )
}
