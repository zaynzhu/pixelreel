import { useMemo, useState } from "react";
import type {
  ExternalTvShowSearchResult,
  ExternalSearchResponse,
  ProviderSearchResult,
} from "../types/externalSearch";
import { apiFetch } from "../api";

const PROVIDERS = [
  { id: "tmdb", label: "TMDB" },
];

const defaultProvider = PROVIDERS[0].id;

export default function TvShowSearch() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [activeProvider, setActiveProvider] = useState(defaultProvider);
  const [data, setData] = useState<ProviderSearchResult<ExternalTvShowSearchResult> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingKey, setAddingKey] = useState<string | null>(null);

  const hasResults = useMemo(() => (data?.results?.length ?? 0) > 0, [data]);

  const search = async (nextPage = 1) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setError("请输入关键词");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = await apiFetch<ExternalSearchResponse<ExternalTvShowSearchResult>>(
        `/search/tv-shows?query=${encodeURIComponent(trimmed)}&page=${nextPage}&providers=${activeProvider}`
      );
      const providerResult = payload.providers?.[0] ?? null;
      setData(providerResult);
      setPage(providerResult?.page ?? nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "搜索失败");
    } finally {
      setLoading(false);
    }
  };

  const addToRecords = async (show: ExternalTvShowSearchResult) => {
    const key = buildTvShowKey(show);
    setAddingKey(key);
    setError(null);

    try {
      await apiFetch("/tv-shows", {
        method: "POST",
        body: JSON.stringify(show.suggestedRecord),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加失败");
    } finally {
      setAddingKey(null);
    }
  };

  const providerLabel =
    PROVIDERS.find((item) => item.id === activeProvider)?.label ?? activeProvider;

  return (
    <section className="w-full max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-semibold text-slate-900">搜索电视剧</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            onClick={() => {
              setActiveProvider(provider.id);
              setData(null);
              setPage(1);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              activeProvider === provider.id
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {provider.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`在 ${providerLabel} 搜索电视剧`}
          className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm outline-none focus:border-slate-400"
        />
        <button
          onClick={() => search(1)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          disabled={loading}
        >
          {loading ? "搜索中..." : "搜索"}
        </button>
      </div>

      {data?.message && (
        <p className="mt-3 text-sm text-amber-600">
          {data.message}
        </p>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {hasResults && (
        <div className="mt-6 space-y-4">
          {data?.results.map((show) => {
            const key = buildTvShowKey(show);
            return (
              <div
                key={key}
                className="flex gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm"
              >
                <div className="h-28 w-20 overflow-hidden rounded-lg bg-slate-100">
                  {show.posterUrl ? (
                    <img
                      src={show.posterUrl}
                      alt={show.title}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-slate-900">
                      {show.title}
                    </h3>
                    <button
                      onClick={() => addToRecords(show)}
                      className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-400 disabled:opacity-60"
                      disabled={show.alreadyAdded || addingKey === key}
                    >
                      {show.alreadyAdded
                        ? "已在记录"
                        : addingKey === key
                        ? "添加中..."
                        : "加入记录"}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {show.firstAirDate || "暂无首播日期"}
                  </p>
                  <p className="mt-2 line-clamp-3 text-sm text-slate-600">
                    {show.overview || "暂无简介"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data && data.totalPages > 1 && (
        <div className="mt-6 flex items-center gap-2">
          <button
            className="rounded-full border border-slate-200 px-3 py-1 text-xs"
            disabled={page <= 1 || loading}
            onClick={() => search(page - 1)}
          >
            上一页
          </button>
          <span className="text-xs text-slate-500">
            第 {page} / {data.totalPages} 页
          </span>
          <button
            className="rounded-full border border-slate-200 px-3 py-1 text-xs"
            disabled={page >= data.totalPages || loading}
            onClick={() => search(page + 1)}
          >
            下一页
          </button>
        </div>
      )}
    </section>
  );
}

function buildTvShowKey(show: ExternalTvShowSearchResult) {
  return (
    show.tmdbId?.toString() ||
    show.doubanId ||
    show.imdbId ||
    show.traktId ||
    show.title
  );
}