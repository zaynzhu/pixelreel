import { useMemo, useState } from "react";
import type {
  ExternalMovieSearchResult,
  ExternalSearchResponse,
  ProviderSearchResult,
} from "../types/externalSearch";
import { apiFetch } from "../api";
import { useI18nStore } from "../stores/i18nStore";

const PROVIDERS = [
  { id: "omdb", label: "OMDB" },
  { id: "tmdb", label: "TMDB" },
  { id: "douban", label: "DOUBAN" },
  { id: "imdb", label: "IMDB" },
  { id: "trakt", label: "TRAKT" },
];

const defaultProvider = PROVIDERS[0].id;

export default function MovieSearch() {
  const { t } = useI18nStore();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [activeProvider, setActiveProvider] = useState(defaultProvider);
  const [data, setData] = useState<ProviderSearchResult<ExternalMovieSearchResult> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingKey, setAddingKey] = useState<string | null>(null);

  const hasResults = useMemo(() => (data?.results?.length ?? 0) > 0, [data]);

  const search = async (nextPage = 1) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setError(t("search.empty"));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = await apiFetch<ExternalSearchResponse<ExternalMovieSearchResult>>(
        `/search/movies?query=${encodeURIComponent(trimmed)}&page=${nextPage}&providers=${activeProvider}`
      );
      const providerResult = payload.providers?.[0] ?? null;
      setData(providerResult);
      setPage(providerResult?.page ?? nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("search.failed"));
    } finally {
      setLoading(false);
    }
  };

  const addToRecords = async (movie: ExternalMovieSearchResult) => {
    const key = buildMovieKey(movie);
    setAddingKey(key);
    setError(null);

    try {
      await apiFetch("/movies", {
        method: "POST",
        body: JSON.stringify(movie.suggestedRecord),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("search.commit_failed"));
    } finally {
      setAddingKey(null);
    }
  };

  const providerLabel =
    PROVIDERS.find((item) => item.id === activeProvider)?.label ?? activeProvider;

  return (
    <section className="dash-card max-w-5xl mx-auto w-full">
      <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[var(--accent)]" />
      <h2 className="font-display text-3xl text-white">{t("search.movie.title")}</h2>
      
      <div className="mt-4 flex flex-wrap gap-2">
        {PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            onClick={() => {
              setActiveProvider(provider.id);
              setData(null);
              setPage(1);
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
            onChange={(event) => setQuery(event.target.value)}
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

      {data?.message && (
        <div className="mt-5 border-l-4 border-yellow-500 bg-yellow-500/10 px-4 py-3 text-xs text-yellow-400 font-bold uppercase">
          [WARN] {data.message}
        </div>
      )}

      {error && (
        <div className="mt-5 border-l-4 border-red-500 bg-red-500/10 px-4 py-3 text-xs text-red-400 font-bold uppercase">
          [ERR] {error}
        </div>
      )}

      {hasResults && (
        <div className="mt-8 space-y-4">
          {data?.results.map((movie) => {
            const key = buildMovieKey(movie);
            return (
              <div
                key={key}
                className="group border border-[var(--line)] bg-[var(--surface-hover)] flex gap-4 p-4 transition-all hover:border-white"
              >
                <div className="h-32 w-24 overflow-hidden bg-black border border-[var(--line)] relative shrink-0">
                  {movie.posterUrl ? (
                    <img
                      src={movie.posterUrl}
                      alt={movie.title}
                      className="h-full w-full object-cover opacity-80 mix-blend-luminosity transition-all group-hover:opacity-100 group-hover:mix-blend-normal"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center p-2 text-[10px] font-bold uppercase tracking-widest text-[var(--line)] text-center">
                      NO_IMG
                    </div>
                  )}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] pointer-events-none opacity-50" />
                </div>
                <div className="flex-1 flex flex-col justify-between overflow-hidden">
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-display text-xl text-white uppercase truncate" title={movie.title}>{movie.title}</h3>
                      <button
                        onClick={() => addToRecords(movie)}
                        className={`shrink-0 text-[10px] font-bold uppercase tracking-widest px-3 py-1 transition-all ${
                          movie.alreadyAdded 
                            ? "bg-[var(--surface)] text-[var(--muted)] border border-[var(--line)] cursor-not-allowed"
                            : addingKey === key
                            ? "bg-[var(--accent)] text-black border border-[var(--accent)]"
                            : "border border-white text-white hover:bg-white hover:text-black"
                        }`}
                        disabled={movie.alreadyAdded || addingKey === key}
                      >
                        {movie.alreadyAdded
                          ? t("search.already")
                          : addingKey === key
                          ? t("search.committing")
                          : t("search.add")}
                      </button>
                    </div>
                    <p className="mt-1 text-[10px] text-[var(--accent)] uppercase font-bold tracking-widest">
                      {t("search.release")} // {movie.releaseDate || t("search.unknown")}
                    </p>
                    <p className="mt-3 line-clamp-2 text-[10px] uppercase tracking-widest leading-relaxed text-[var(--muted)]">
                      {movie.overview || t("search.no_data")}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data && data.totalPages > 1 && (
        <div className="mt-8 flex items-center justify-between border border-[var(--line)] bg-[var(--surface-hover)] p-4">
          <button
            className="brutal-btn"
            disabled={page <= 1 || loading}
            onClick={() => search(page - 1)}
          >
            {t("search.prev")}
          </button>
          <span className="text-[10px] uppercase font-bold tracking-widest text-[var(--muted)]">
            {t("search.page", page, data.totalPages)}
          </span>
          <button
            className="brutal-btn"
            disabled={page >= data.totalPages || loading}
            onClick={() => search(page + 1)}
          >
            {t("search.next")}
          </button>
        </div>
      )}
    </section>
  );
}

function buildMovieKey(movie: ExternalMovieSearchResult) {
  return (
    movie.tmdbId?.toString() ||
    movie.doubanId ||
    movie.imdbId ||
    movie.traktId ||
    movie.title
  );
}