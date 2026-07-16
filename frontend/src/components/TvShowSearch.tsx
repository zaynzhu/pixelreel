import { useMemo, useRef, useState } from "react";
import type {
  ExternalTvShowSearchResult,
  ExternalSearchResponse,
  ProviderSearchResult,
} from "../types/externalSearch";
import { apiFetch } from "../api";
import { useI18nStore } from "../stores/i18nStore";
import { proxiedImageUrl } from "../imageProxy";

const PROVIDERS = [
  { id: "tmdb", label: "TMDB" },
  { id: "douban", label: "DOUBAN" },
];

const defaultProvider = PROVIDERS[0].id;

export default function TvShowSearch() {
  const { t } = useI18nStore();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [activeProvider, setActiveProvider] = useState(defaultProvider);
  const [data, setData] = useState<ProviderSearchResult<ExternalTvShowSearchResult> | null>(null);
  const [resultContext, setResultContext] = useState<{ query: string; provider: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());
  const latestSearchRequest = useRef(0);
  const addContextVersion = useRef(0);
  const addRequestActive = useRef(false);

  const visibleData = useMemo(
    () => resultContext?.query === query.trim() && resultContext.provider === activeProvider ? data : null,
    [activeProvider, data, query, resultContext]
  );
  const hasResults = (visibleData?.results?.length ?? 0) > 0;

  const search = async (nextPage = 1) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setError(t("search.empty"));
      return;
    }

    const requestId = ++latestSearchRequest.current;
    const requestedProvider = activeProvider;
    setLoading(true);
    setError(null);

    try {
      const payload = await apiFetch<ExternalSearchResponse<ExternalTvShowSearchResult>>(
        `/search/tv-shows?query=${encodeURIComponent(trimmed)}&page=${nextPage}&providers=${activeProvider}`
      );
      if (requestId !== latestSearchRequest.current) return;
      const providerResult = payload.providers?.[0] ?? null;
      setData(providerResult);
      setResultContext({ query: trimmed, provider: requestedProvider });
      setPage(providerResult?.page ?? nextPage);
    } catch (err) {
      if (requestId !== latestSearchRequest.current) return;
      setError(err instanceof Error ? err.message : t("search.failed"));
    } finally {
      if (requestId === latestSearchRequest.current) setLoading(false);
    }
  };

  const addToRecords = async (show: ExternalTvShowSearchResult) => {
    if (addRequestActive.current) return;
    const key = buildTvShowKey(show);
    const contextVersion = addContextVersion.current;
    addRequestActive.current = true;
    setAddingKey(key);
    setError(null);

    try {
      await apiFetch("/tv-shows", {
        method: "POST",
        body: JSON.stringify(show.suggestedRecord),
      });
      setAddedKeys((current) => new Set(current).add(key));
    } catch (err) {
      if (contextVersion === addContextVersion.current) {
        setError(err instanceof Error ? err.message : t("search.commit_failed"));
      }
    } finally {
      addRequestActive.current = false;
      setAddingKey((current) => current === key ? null : current);
    }
  };

  const providerLabel =
    PROVIDERS.find((item) => item.id === activeProvider)?.label ?? activeProvider;

  return (
    <section className="dash-card max-w-5xl mx-auto w-full">
      <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[var(--accent)]" />
      <h2 className="font-display text-3xl text-white">{t("search.tv.title")}</h2>
      
      <div className="mt-4 flex flex-wrap gap-2">
        {PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            onClick={() => {
              latestSearchRequest.current++;
              addContextVersion.current++;
              setActiveProvider(provider.id);
              setData(null);
              setResultContext(null);
              setPage(1);
              setError(null);
              setLoading(false);
            }}
            className={activeProvider === provider.id ? "brutal-btn-accent" : "brutal-btn"}
          >
            {provider.label}
          </button>
        ))}
      </div>

      <div className="mt-6 border border-[var(--line)] bg-[var(--surface-hover)] p-5 relative">
        <div className="absolute top-0 right-0 w-8 h-1 bg-[var(--accent)] opacity-50" />
        <p className="mb-3 text-[10px] uppercase font-bold text-[var(--muted)] tracking-widest">
          /// {t("search.query_node")} {providerLabel}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={query}
            onChange={(event) => {
              latestSearchRequest.current++;
              addContextVersion.current++;
              setQuery(event.target.value);
              setLoading(false);
              setError(null);
            }}
            placeholder="INPUT QUERY"
            className="tech-input flex-1"
          />
          <button
            onClick={() => search(1)}
            className="brutal-btn-accent"
            disabled={loading}
          >
            {loading ? t("search.btn.searching") : t("search.btn.exec")}
          </button>
        </div>
      </div>

      {visibleData?.message && (
        <div className="mt-5 border-l-4 border-yellow-500 bg-yellow-500/10 px-4 py-3 text-xs text-yellow-400 font-bold uppercase">
          [WARN] {visibleData.message}
        </div>
      )}

      {error && (
        <div className="mt-5 border-l-4 border-red-500 bg-red-500/10 px-4 py-3 text-xs text-red-400 font-bold uppercase">
          [ERR] {error}
        </div>
      )}

      {hasResults && (
        <div className="mt-8 space-y-4">
          {visibleData?.results.map((show) => {
            const key = buildTvShowKey(show);
            const isAdded = show.alreadyAdded || addedKeys.has(key);
            return (
              <div
                key={key}
                className="group border border-[var(--line)] bg-[var(--surface-hover)] flex gap-4 p-4 transition-all hover:border-white"
              >
                <div className="h-32 w-24 overflow-hidden bg-black border border-[var(--line)] relative shrink-0">
                  {proxiedImageUrl(show.posterUrl) ? (
                    <img
                      src={proxiedImageUrl(show.posterUrl)!}
                      alt={show.title}
                      className="h-full w-full object-cover opacity-80 mix-blend-luminosity transition-all group-hover:opacity-100 group-hover:mix-blend-normal"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[#0a0a0a] relative overflow-hidden">
                      <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)', backgroundSize: '12px 12px' }} />
                      <span className="text-2xl font-display font-bold opacity-15 text-[var(--accent-deep)]">{show.title.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] pointer-events-none opacity-50" />
                </div>
                <div className="flex-1 flex flex-col justify-between overflow-hidden">
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-display text-xl text-white uppercase truncate" title={show.title}>{show.title}</h3>
                      <button
                        onClick={() => addToRecords(show)}
                        className={`shrink-0 text-[10px] font-bold uppercase tracking-widest px-3 py-1 transition-all ${
                          isAdded
                            ? "bg-[var(--surface)] text-[var(--muted)] border border-[var(--line)] cursor-not-allowed"
                            : addingKey === key
                            ? "bg-[var(--accent)] text-black border border-[var(--accent)]"
                            : addingKey !== null
                            ? "bg-[var(--surface)] text-[var(--muted)] border border-[var(--line)] cursor-not-allowed"
                            : "border border-white text-white hover:bg-white hover:text-black"
                        }`}
                        disabled={isAdded || addingKey !== null}
                      >
                        {isAdded
                          ? t("search.already")
                          : addingKey === key
                          ? t("search.committing")
                          : t("search.add")}
                      </button>
                    </div>
                    <p className="mt-1 text-[10px] text-[var(--accent)] uppercase font-bold tracking-widest">
                      {t("search.first_air")} // {show.firstAirDate || t("search.unknown")}
                    </p>
                    <p className="mt-3 line-clamp-2 text-[10px] uppercase tracking-widest leading-relaxed text-[var(--muted)]">
                      {show.overview || t("search.no_data")}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {visibleData && visibleData.totalPages > 1 && (
        <div className="mt-8 flex items-center justify-between border border-[var(--line)] bg-[var(--surface-hover)] p-4">
          <button
            className="brutal-btn"
            disabled={page <= 1 || loading}
            onClick={() => search(page - 1)}
          >
            {t("search.prev")}
          </button>
          <span className="text-[10px] uppercase font-bold tracking-widest text-[var(--muted)]">
            {t("search.page", page, visibleData.totalPages)}
          </span>
          <button
            className="brutal-btn"
            disabled={page >= visibleData.totalPages || loading}
            onClick={() => search(page + 1)}
          >
            {t("search.next")}
          </button>
        </div>
      )}
    </section>
  );
}

function buildTvShowKey(show: ExternalTvShowSearchResult) {
  if (show.tmdbId != null) return `tmdb:${show.tmdbId}`;
  if (show.doubanId) return `douban:${show.doubanId}`;
  if (show.imdbId) return `imdb:${show.imdbId}`;
  if (show.traktId) return `trakt:${show.traktId}`;
  return `${show.provider}:title:${show.title}`;
}
