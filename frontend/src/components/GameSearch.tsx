import { useMemo, useRef, useState } from "react";
import type {
  ExternalGameSearchResult,
  ExternalSearchResponse,
  GameDetail,
  ProviderSearchResult,
} from "../types/externalSearch";
import { apiFetch } from "../api";
import { useI18nStore } from "../stores/i18nStore";

const PROVIDERS = [
  {
    id: "rawg",
    label: "RAWG",
    placeholder: "QUERY RAWG DATABASE",
    description: "Recommended node for general game telemetry.",
  },
  {
    id: "steam",
    label: "STEAM",
    placeholder: "QUERY STEAM STORE",
    description: "Direct access to Steam Application records.",
  },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

const defaultProvider = PROVIDERS[0].id;

export default function GameSearch() {
  const { t } = useI18nStore();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [activeProvider, setActiveProvider] = useState<ProviderId>(defaultProvider);
  const [data, setData] = useState<ProviderSearchResult<ExternalGameSearchResult> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<GameDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const latestSearchRequest = useRef(0);
  const latestDetailRequest = useRef(0);

  const hasResults = useMemo(() => (data?.results?.length ?? 0) > 0, [data]);
  const activeProviderConfig =
    PROVIDERS.find((item) => item.id === activeProvider) ?? PROVIDERS[0];

  const search = async (nextPage = 1) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setError(t("search.empty"));
      return;
    }

    const requestId = ++latestSearchRequest.current;
    latestDetailRequest.current++;
    setLoading(true);
    setError(null);
    setExpandedKey(null);
    setDetail(null);
    setDetailLoading(false);

    try {
      const payload = await apiFetch<ExternalSearchResponse<ExternalGameSearchResult>>(
        `/search/games?query=${encodeURIComponent(trimmed)}&page=${nextPage}&providers=${activeProvider}`
      );
      if (requestId !== latestSearchRequest.current) return;
      const providerResult = payload.providers?.[0] ?? null;
      setData(providerResult);
      setPage(providerResult?.page ?? nextPage);
    } catch (err) {
      if (requestId !== latestSearchRequest.current) return;
      setError(err instanceof Error ? err.message : t("search.failed"));
    } finally {
      if (requestId === latestSearchRequest.current) setLoading(false);
    }
  };

  const toggleDetail = async (game: ExternalGameSearchResult) => {
    const key = buildGameKey(game);
    const requestId = ++latestDetailRequest.current;
    if (expandedKey === key) {
      setExpandedKey(null);
      setDetail(null);
      setDetailLoading(false);
      return;
    }

    setExpandedKey(key);
    setDetail(null);
    setDetailLoading(false);

    // 根据可用的 ID 选择详情接口
    let detailUrl: string | null = null;
    if (game.rawgId) {
      detailUrl = `/search/rawg/${game.rawgId}`;
    } else if (game.steamAppId) {
      detailUrl = `/search/steam/${game.steamAppId}`;
    }
    if (!detailUrl) return;

    setDetailLoading(true);
    try {
      const result = await apiFetch<GameDetail>(detailUrl);
      if (requestId !== latestDetailRequest.current) return;
      setDetail(result);
    } catch {
      // 静默失败
    } finally {
      if (requestId === latestDetailRequest.current) setDetailLoading(false);
    }
  };

  const addToRecords = async (game: ExternalGameSearchResult) => {
    const key = buildGameKey(game);
    setAddingKey(key);
    setError(null);

    try {
      await apiFetch("/games", {
        method: "POST",
        body: JSON.stringify(game.suggestedRecord),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("search.commit_failed"));
    } finally {
      setAddingKey(null);
    }
  };

  return (
    <section className="dash-card max-w-5xl mx-auto w-full">
      <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[var(--accent)]" />
      <h2 className="font-display text-3xl text-white">{t("search.game.title")}</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            type="button"
            onClick={() => {
              latestSearchRequest.current++;
              latestDetailRequest.current++;
              setActiveProvider(provider.id);
              setData(null);
              setPage(1);
              setError(null);
              setExpandedKey(null);
              setDetail(null);
              setLoading(false);
              setDetailLoading(false);
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
          /// {activeProviderConfig.description}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={activeProviderConfig.placeholder}
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
          {data?.results.map((game) => {
            const key = buildGameKey(game);
            const isExpanded = expandedKey === key;
            return (
              <div key={key} className="border border-[var(--line)] bg-[var(--surface-hover)] transition-all hover:border-white">
                <div
                  className="group flex gap-4 p-4 cursor-pointer"
                  onClick={() => toggleDetail(game)}
                >
                  <div className="h-32 w-24 overflow-hidden bg-black border border-[var(--line)] relative shrink-0">
                    {game.posterUrl ? (
                      <img
                        src={game.posterUrl}
                        alt={game.title}
                        className="h-full w-full object-cover opacity-80 mix-blend-luminosity transition-all group-hover:opacity-100 group-hover:mix-blend-normal"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[#0a0a0a] relative overflow-hidden">
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)', backgroundSize: '12px 12px' }} />
                        <span className="text-2xl font-display font-bold opacity-15 text-[#8888ff]">{game.title.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] pointer-events-none opacity-50" />
                  </div>
                  <div className="flex-1 flex flex-col justify-between overflow-hidden">
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-display text-xl text-white uppercase truncate" title={game.title}>{game.title}</h3>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            addToRecords(game);
                          }}
                          className={`shrink-0 text-[10px] font-bold uppercase tracking-widest px-3 py-1 transition-all ${
                            game.alreadyAdded
                              ? "bg-[var(--surface)] text-[var(--muted)] border border-[var(--line)] cursor-not-allowed"
                              : addingKey === key
                              ? "bg-[var(--accent)] text-black border border-[var(--accent)]"
                              : "border border-white text-white hover:bg-white hover:text-black"
                          }`}
                          disabled={game.alreadyAdded || addingKey === key}
                        >
                          {game.alreadyAdded
                            ? t("search.already")
                            : addingKey === key
                            ? t("search.committing")
                            : t("search.add")}
                        </button>
                      </div>
                      <p className="mt-1 text-[10px] text-[var(--accent)] uppercase font-bold tracking-widest">
                        {t("search.release")} // {game.releaseDate || t("search.unknown")}
                      </p>
                      <p className="mt-3 line-clamp-2 text-[10px] uppercase tracking-widest leading-relaxed text-[var(--muted)]">
                        {game.overview || t("search.no_data")}
                      </p>
                    </div>
                    {(game.rawgId || game.steamAppId) && (
                      <p className="mt-2 text-[10px] text-[var(--muted)] uppercase tracking-widest">
                        {isExpanded ? "▼" : "▶"} {game.rawgId ? `RAWG #${game.rawgId}` : `STEAM #${game.steamAppId}`}
                      </p>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-[var(--line)] px-4 py-4 bg-[var(--surface)]">
                    {detailLoading ? (
                      <p className="text-[10px] uppercase tracking-widest text-[var(--muted)]">
                        {t("search.detail.loading")}
                      </p>
                    ) : detail ? (
                      <div className="space-y-4">
                        <div className="space-y-3">
                          {detail.rating && (
                            <DetailRow label={t("search.detail.rating")} value={detail.rating} />
                          )}
                          {detail.metacritic && (
                            <DetailRow label="METACRITIC" value={detail.metacritic} />
                          )}
                          {detail.genre && (
                            <DetailRow label={t("search.detail.genre")} value={detail.genre} />
                          )}
                          {detail.developer && (
                            <DetailRow label="DEVELOPER" value={detail.developer} />
                          )}
                          {detail.publisher && (
                            <DetailRow label="PUBLISHER" value={detail.publisher} />
                          )}
                          {detail.platform && (
                            <DetailRow label="PLATFORM" value={detail.platform} />
                          )}
                          {detail.playtime && (
                            <DetailRow label="PLAYTIME" value={detail.playtime} />
                          )}
                          {detail.esrbRating && (
                            <DetailRow label="ESRB" value={detail.esrbRating} />
                          )}
                          {detail.description && (
                            <DetailRow label={t("search.detail.plot")} value={detail.description.slice(0, 300) + (detail.description.length > 300 ? '...' : '')} />
                          )}
                        </div>
                        {detail.screenshots && detail.screenshots.length > 0 && (
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--muted)] mb-2">SCREENSHOTS</p>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                              {detail.screenshots.map((url, i) => (
                                <img
                                  key={i}
                                  src={url}
                                  alt={`Screenshot ${i + 1}`}
                                  className="h-32 shrink-0 object-cover border border-[var(--line)] opacity-80 hover:opacity-100 transition-opacity"
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : game.rawgId ? (
                      <p className="text-[10px] uppercase tracking-widest text-[var(--muted)]">
                        {t("search.no_data")}
                      </p>
                    ) : null}
                  </div>
                )}
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-[10px] uppercase font-bold tracking-widest text-[var(--accent)] shrink-0 w-24">
        {label}
      </span>
      <span className="text-[10px] uppercase tracking-widest text-white leading-relaxed">
        {value}
      </span>
    </div>
  );
}

function buildGameKey(game: ExternalGameSearchResult) {
  return (
    game.rawgId?.toString() ||
    game.steamAppId?.toString() ||
    game.xboxId ||
    game.psnId ||
    game.title
  );
}
