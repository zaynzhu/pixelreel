import { useEffect, useRef, useState } from 'react';
import { useI18nStore } from '../stores/i18nStore';
import { apiDownload, apiFetch } from '../api';
import { toast } from '../stores/toastStore';
import { confirmDialog } from '../components/Toast';
import { ImgWithFallback } from '../components/ImgWithFallback';
import { proxiedImageUrl } from '../imageProxy';
import { Download, ShieldCheck } from 'lucide-react';

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

export default function ToolsPage() {
  const { t } = useI18nStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [failedSearchQuery, setFailedSearchQuery] = useState<string | null>(null);
  const [resultQuery, setResultQuery] = useState('');
  const [converting, setConverting] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [exporting, setExporting] = useState(false);
  const latestSearchRequest = useRef(0);

  useEffect(() => () => {
    latestSearchRequest.current++;
  }, []);

  const handleExport = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const { blob, filename } = await apiDownload('/tools/export-library')
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename || 'pixelreel-library.json'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 0)
      toast(t('tools.export.success'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('tools.export.failed'), 'error')
    } finally {
      setExporting(false)
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
    const targetCategory = record.category === 'movie' ? 'tv_show' : 'movie';
    const confirmMsg = t('tools.convert.confirm');
    if (!(await confirmDialog(confirmMsg))) return;

    const recordKey = `${record.category}:${record.id}`;
    setConverting(recordKey);
    try {
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
