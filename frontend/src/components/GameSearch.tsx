import { useMemo, useState } from "react";
import type {
  ExternalGameSearchResult,
  ExternalSearchResponse,
  ProviderSearchResult,
} from "../types/externalSearch";

const PROVIDERS = [
  { id: "steam", label: "Steam" },
  { id: "xbox", label: "Xbox" },
  { id: "psn", label: "PSN" },
  { id: "switch", label: "Switch" },
];

const defaultProvider = PROVIDERS[0].id;

export default function GameSearch() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [activeProvider, setActiveProvider] = useState(defaultProvider);
  const [data, setData] = useState<ProviderSearchResult<ExternalGameSearchResult> | null>(null);
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
      const response = await fetch(
        `/api/search/games?query=${encodeURIComponent(trimmed)}&page=${nextPage}&providers=${activeProvider}`
      );
      if (!response.ok) {
        throw new Error(`搜索失败 (${response.status})`);
      }
      const payload = (await response.json()) as ExternalSearchResponse<ExternalGameSearchResult>;
      const providerResult = payload.providers?.[0] ?? null;
      setData(providerResult);
      setPage(providerResult?.page ?? nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "搜索失败");
    } finally {
      setLoading(false);
    }
  };

  const addToRecords = async (game: ExternalGameSearchResult) => {
    const key = buildGameKey(game);
    setAddingKey(key);
    setError(null);

    try {
      const response = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(game.suggestedRecord),
      });

      if (!response.ok) {
        throw new Error(`添加失败 (${response.status})`);
      }
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
      <h2 className="text-2xl font-semibold text-slate-900">搜索游戏</h2>
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
          placeholder={`在 ${providerLabel} 搜索游戏`}
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
          {data?.results.map((game) => {
            const key = buildGameKey(game);
            return (
              <div
                key={key}
                className="flex gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm"
              >
                <div className="h-28 w-20 overflow-hidden rounded-lg bg-slate-100">
                  {game.posterUrl ? (
                    <img
                      src={game.posterUrl}
                      alt={game.title}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-slate-900">
                      {game.title}
                    </h3>
                    <button
                      onClick={() => addToRecords(game)}
                      className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-400 disabled:opacity-60"
                      disabled={game.alreadyAdded || addingKey === key}
                    >
                      {game.alreadyAdded
                        ? "已在记录"
                        : addingKey === key
                        ? "添加中..."
                        : "加入记录"}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {game.releaseDate || "暂无发售日期"}
                  </p>
                  <p className="mt-2 line-clamp-3 text-sm text-slate-600">
                    {game.overview || "暂无简介"}
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

function buildGameKey(game: ExternalGameSearchResult) {
  return (
    game.steamAppId?.toString() ||
    game.xboxId ||
    game.psnId ||
    game.rawgId?.toString() ||
    game.title
  );
}
