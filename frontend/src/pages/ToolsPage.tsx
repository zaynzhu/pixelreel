import { useState } from 'react';
import { useI18nStore } from '../stores/i18nStore';
import { apiFetch } from '../api';
import { toast } from '../stores/toastStore';
import { confirmDialog } from '../components/Toast';
import { ImgWithFallback } from '../components/ImgWithFallback';
import { proxiedImageUrl } from '../imageProxy';

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
  const [converting, setConverting] = useState<number | null>(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearched(true);
    try {
      const data = await apiFetch<SearchResponse>(`/tools/search?query=${encodeURIComponent(query.trim())}`);
      setResults(data.results || []);
    } catch (e: any) {
      toast(`${t('tools.convert.failed')}: ${e.message}`, 'error');
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleConvert = async (record: SearchResult) => {
    const targetCategory = record.category === 'movie' ? 'tv_show' : 'movie';
    const confirmMsg = t('tools.convert.confirm');
    if (!(await confirmDialog(confirmMsg))) return;

    setConverting(record.id);
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
        // 更新列表中的记录
        setResults((prev) =>
          prev.map((r) =>
            r.id === record.id ? { ...r, category: targetCategory } : r
          )
        );
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
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            className="brutal-btn-accent px-6"
          >
            {searching ? t('tools.convert.searching') : t('tools.convert.search')}
          </button>
        </div>

        {/* Results */}
        {searched && !searching && results.length === 0 && (
          <div className="text-center py-8 text-[var(--muted)] text-xs uppercase tracking-widest">
            {t('tools.convert.no_results')}
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-3">
            {results.map((item) => {
              const posterSrc = proxiedImageUrl(item.posterUrl);
              const isConverting = converting === item.id;
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
                    disabled={isConverting}
                    className={`brutal-btn px-4 text-[10px] ${
                      isConverting ? 'opacity-50 cursor-not-allowed' : ''
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
