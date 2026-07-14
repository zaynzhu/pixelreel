import { useState, useRef, useEffect } from "react"
import { useI18nStore } from "../stores/i18nStore"
import { apiFetch } from "../api"
import { ImgWithFallback } from "./ImgWithFallback"
import type { LibraryRecord, LibraryCategory } from "../types/library"
import type {
  ExternalMovieSearchResult,
  ExternalTvShowSearchResult,
  ExternalGameSearchResult,
  ExternalSearchResponse,
  ImdbDetail,
  GameDetail,
} from "../types/externalSearch"
import { proxiedImageUrl } from "../imageProxy"

// ── 类型定义 ──

interface SearchResult {
  provider: string
  title: string
  posterUrl?: string | null
  releaseDate?: string | null
  overview?: string | null
  voteAverage?: number | null
  tmdbId?: number | null
  imdbId?: string | null
  doubanId?: string | null
  traktId?: string | null
  rawgId?: number | null
  steamAppId?: number | null
}

interface RescrapeModalProps {
  record: LibraryRecord
  onClose: () => void
  onUpdated: () => void
}

// ── 来源配置 ──

const PROVIDERS_BY_CATEGORY: Record<LibraryCategory, { id: string; label: string }[]> = {
  movie: [
    { id: "tmdb", label: "TMDB" },
    { id: "omdb", label: "OMDB" },
    { id: "douban", label: "DOUBAN" },
    { id: "imdb", label: "IMDB" },
    { id: "trakt", label: "TRAKT" },
  ],
  tv_show: [
    { id: "tmdb", label: "TMDB" },
    { id: "douban", label: "DOUBAN" },
  ],
  game: [
    { id: "rawg", label: "RAWG" },
    { id: "steam", label: "STEAM" },
  ],
}

// ── 主组件 ──

export default function RescrapeModal({ record, onClose, onUpdated }: RescrapeModalProps) {
  const { t } = useI18nStore()
  const inputRef = useRef<HTMLInputElement>(null)

  const providers = PROVIDERS_BY_CATEGORY[record.category]
  const [query, setQuery] = useState(record.title)
  const [selectedProviders, setSelectedProviders] = useState<string[]>(
    providers.map((p) => p.id)
  )
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [detailLoading, setDetailLoading] = useState<string | null>(null)

  // 自动聚焦搜索框
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // ESC 关闭
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [onClose])

  // 切换来源选中状态
  const toggleProvider = (id: string) => {
    setSelectedProviders((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    )
  }

  // 构建结果唯一 key
  const buildResultKey = (r: SearchResult) =>
    String(r.tmdbId ?? r.doubanId ?? r.imdbId ?? r.traktId ?? r.rawgId ?? r.steamAppId ?? r.title)

  // ── 搜索 ──

  const handleSearch = async () => {
    const trimmed = query.trim()
    if (!trimmed || selectedProviders.length === 0) return

    setSearching(true)
    setError(null)
    setResults([])

    try {
      const providerParam = selectedProviders.join(",")

      if (record.category === "movie") {
        const payload = await apiFetch<ExternalSearchResponse<ExternalMovieSearchResult>>(
          `/search/movies?query=${encodeURIComponent(trimmed)}&providers=${providerParam}`
        )
        const flat = (payload.providers ?? []).flatMap((p) =>
          p.results.map(mapMovieResult)
        )
        setResults(flat)
      } else if (record.category === "tv_show") {
        const payload = await apiFetch<ExternalSearchResponse<ExternalTvShowSearchResult>>(
          `/search/tv-shows?query=${encodeURIComponent(trimmed)}&providers=${providerParam}`
        )
        const flat = (payload.providers ?? []).flatMap((p) =>
          p.results.map(mapTvShowResult)
        )
        setResults(flat)
      } else {
        const payload = await apiFetch<ExternalSearchResponse<ExternalGameSearchResult>>(
          `/search/games?query=${encodeURIComponent(trimmed)}&providers=${providerParam}`
        )
        const flat = (payload.providers ?? []).flatMap((p) =>
          p.results.map(mapGameResult)
        )
        setResults(flat)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("lib.rescrape.failed"))
    } finally {
      setSearching(false)
    }
  }

  // ── 映射搜索结果 ──

  const mapMovieResult = (r: ExternalMovieSearchResult): SearchResult => ({
    provider: r.provider,
    title: r.title,
    posterUrl: r.posterUrl,
    releaseDate: r.releaseDate,
    overview: r.overview,
    tmdbId: r.tmdbId,
    imdbId: r.imdbId,
    doubanId: r.doubanId,
    traktId: r.traktId,
  })

  const mapTvShowResult = (r: ExternalTvShowSearchResult): SearchResult => ({
    provider: r.provider,
    title: r.title,
    posterUrl: r.posterUrl,
    releaseDate: r.firstAirDate,
    overview: r.overview,
    tmdbId: r.tmdbId,
    imdbId: r.imdbId,
    doubanId: r.doubanId,
    traktId: r.traktId,
  })

  const mapGameResult = (r: ExternalGameSearchResult): SearchResult => ({
    provider: r.provider,
    title: r.title,
    posterUrl: r.posterUrl,
    releaseDate: r.releaseDate,
    overview: r.overview,
    rawgId: r.rawgId,
    steamAppId: r.steamAppId,
  })

  // ── 选择结果 → 获取详情 → 更新记录 ──

  const handleSelect = async (result: SearchResult) => {
    const key = buildResultKey(result)
    setDetailLoading(key)
    setError(null)

    try {
      // 1. 获取详情
      let detailUrl: string | null = null
      if (record.category === "game") {
        if (result.rawgId) detailUrl = `/search/rawg/${result.rawgId}`
        else if (result.steamAppId) detailUrl = `/search/steam/${result.steamAppId}`
      } else {
        if (result.tmdbId) detailUrl = `/search/tmdb/${result.tmdbId}`
        else if (result.imdbId) detailUrl = `/search/imdb/${result.imdbId}`
        else if (result.doubanId) detailUrl = `/search/douban/${result.doubanId}`
      }

      let detail: ImdbDetail | GameDetail | null = null
      if (detailUrl) {
        detail = await apiFetch<ImdbDetail | GameDetail>(detailUrl)
      }

      // 2. 构建更新数据（保留用户个人数据）
      const updateData = buildUpdateData(record, result, detail)

      // 3. PUT 更新
      const endpoint = getUpdateEndpoint(record.category, record.id)
      setUpdating(true)
      await apiFetch(endpoint, {
        method: "PUT",
        body: JSON.stringify(updateData),
      })

      // 4. 关闭并回调
      onUpdated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t("lib.rescrape.failed"))
    } finally {
      setDetailLoading(null)
      setUpdating(false)
    }
  }

  // ── 构建更新数据 ──

  const buildUpdateData = (
    rec: LibraryRecord,
    result: SearchResult,
    detail: ImdbDetail | GameDetail | null
  ) => {
    // 保留用户个人数据
    const base: Record<string, unknown> = {
      status: rec.status,
      rating: rec.rating,
      shortReview: rec.shortReview,
    }

    if (rec.category === "game") {
      // 游戏更新
      const gameDetail = detail as GameDetail | null
      return {
        ...base,
        title: gameDetail?.title || result.title,
        posterUrl: gameDetail?.posterUrl || result.posterUrl || null,
        ...(result.rawgId != null ? { rawgId: result.rawgId } : {}),
        ...(result.steamAppId != null ? { steamAppId: result.steamAppId } : {}),
      }
    }

    // 电影 / 剧集更新
    const movieDetail = detail as ImdbDetail | null
    const isTv = rec.category === "tv_show"
    const dateField = isTv ? "firstAirDate" : "releaseDate"

    return {
      ...base,
      title: movieDetail?.title || result.title,
      posterUrl: movieDetail?.posterUrl || result.posterUrl || null,
      [dateField]: result.releaseDate || null,
      overview: movieDetail?.plot || result.overview || null,
      // 外部 ID
      ...(result.tmdbId != null ? { tmdbId: result.tmdbId } : {}),
      ...(result.imdbId != null ? { imdbId: result.imdbId } : {}),
      ...(result.doubanId != null ? { doubanId: result.doubanId } : {}),
      ...(result.traktId != null ? { traktId: result.traktId } : {}),
      // TMDB 原始字段
      tmdbTitle: result.tmdbId ? (movieDetail?.title || result.title) : rec.tmdbTitle,
      tmdbPosterUrl: result.tmdbId ? (movieDetail?.posterUrl || result.posterUrl || null) : rec.tmdbPosterUrl,
      tmdbReleaseDate: result.tmdbId ? result.releaseDate : rec.tmdbReleaseDate,
      tmdbOverview: result.tmdbId ? (movieDetail?.plot || result.overview || null) : rec.tmdbOverview,
      tmdbVoteAverage: result.tmdbId && movieDetail?.imdbRating
        ? parseFloat(movieDetail.imdbRating) || null
        : rec.tmdbVoteAverage,
    }
  }

  const getUpdateEndpoint = (category: LibraryCategory, id: number) => {
    switch (category) {
      case "movie": return `/movies/${id}`
      case "tv_show": return `/tv-shows/${id}`
      case "game": return `/games/${id}`
    }
  }

  // ── 渲染 ──

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-2xl max-h-[80vh] border border-[var(--line)] bg-[var(--surface)] shadow-[0_0_60px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden">
        {/* 角落装饰 */}
        <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[var(--accent)]" />
        <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-[var(--accent)]" />
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-[var(--accent)]" />
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[var(--accent)]" />

        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line)]">
          <div className="flex items-center gap-2">
            <span className="text-[var(--accent)] text-sm">&#x21BB;</span>
            <h2 className="font-display text-lg text-white uppercase tracking-wider">
              {t("lib.rescrape.title")}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[var(--muted)] hover:text-white transition-colors text-sm"
          >
            &#x2715;
          </button>
        </div>

        {/* 搜索区域 */}
        <div className="px-5 py-4 border-b border-[var(--line)] space-y-3">
          {/* 来源复选框 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest">
              {t("lib.rescrape.source")} //
            </span>
            {providers.map((p) => (
              <button
                key={p.id}
                onClick={() => toggleProvider(p.id)}
                className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 transition-all ${
                  selectedProviders.includes(p.id)
                    ? "neo-badge-accent"
                    : "border border-[var(--line)] text-[var(--muted)] hover:border-white hover:text-white"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* 搜索框 */}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder={t("lib.rescrape.search_placeholder")}
              className="tech-input flex-1"
            />
            <button
              onClick={handleSearch}
              disabled={searching || selectedProviders.length === 0}
              className="brutal-btn-accent flex items-center gap-1.5"
            >
              <span>&#x1F50D;</span>
              {searching ? t("lib.rescrape.searching") : t("lib.rescrape.search")}
            </button>
          </div>
        </div>

        {/* 结果区域 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* 错误提示 */}
          {error && (
            <div className="mx-5 mt-4 border-l-4 border-red-500 bg-red-500/10 px-4 py-3 text-[10px] text-red-400 font-bold uppercase tracking-widest">
              [ERR] {error}
            </div>
          )}

          {/* 更新中 */}
          {updating && (
            <div className="mx-5 mt-4 border-l-4 border-[var(--accent)] bg-[var(--accent)]/10 px-4 py-3 text-[10px] text-[var(--accent)] font-bold uppercase tracking-widest animate-pulse">
              {t("lib.rescrape.updating")}
            </div>
          )}

          {/* 无结果 */}
          {!searching && !updating && results.length === 0 && query.trim() && !error && (
            <div className="px-5 py-12 text-center">
              <p className="text-[10px] text-[var(--muted)] uppercase tracking-widest">
                {t("lib.rescrape.no_results")}
              </p>
            </div>
          )}

          {/* 结果列表 */}
          {results.length > 0 && (
            <div className="p-5 space-y-3">
              {results.map((result) => {
                const key = buildResultKey(result)
                const isLoading = detailLoading === key
                return (
                  <div
                    key={key}
                    onClick={() => !isLoading && !updating && handleSelect(result)}
                    className={`group flex gap-4 p-3 border border-[var(--line)] bg-[var(--surface-hover)] transition-all ${
                      isLoading || updating
                        ? "opacity-60 cursor-wait"
                        : "cursor-pointer hover:border-[var(--accent)]"
                    }`}
                  >
                    {/* 海报 */}
                    <div className="h-28 w-20 overflow-hidden bg-black border border-[var(--line)] relative shrink-0">
                      <ImgWithFallback
                        src={proxiedImageUrl(result.posterUrl) ?? ""}
                        alt={result.title}
                        className="h-full w-full object-cover opacity-80 mix-blend-luminosity transition-all group-hover:opacity-100 group-hover:mix-blend-normal"
                        fallback={
                          <div className="flex h-full w-full items-center justify-center bg-[#0a0a0a] relative overflow-hidden">
                            <div
                              className="absolute inset-0 opacity-[0.04]"
                              style={{
                                backgroundImage:
                                  "linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)",
                                backgroundSize: "12px 12px",
                              }}
                            />
                            <span className="text-xl font-display font-bold opacity-15 text-[var(--accent)]">
                              {result.title.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        }
                      />
                      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] pointer-events-none opacity-50" />
                    </div>

                    {/* 信息 */}
                    <div className="flex-1 flex flex-col justify-between overflow-hidden min-w-0">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-display text-sm text-white uppercase truncate flex-1">
                            {result.title}
                          </h3>
                          <span className="neo-badge-accent shrink-0">
                            {result.provider.toUpperCase()}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-[var(--accent)] uppercase font-bold tracking-widest">
                          {result.releaseDate || "——"}
                        </p>
                        {result.voteAverage != null && (
                          <p className="mt-1 flex items-center gap-1 text-[10px] text-yellow-500">
                            &#x2605; {result.voteAverage.toFixed(1)}
                          </p>
                        )}
                        <p className="mt-2 line-clamp-2 text-[10px] uppercase tracking-widest leading-relaxed text-[var(--muted)]">
                          {result.overview || "——"}
                        </p>
                      </div>
                    </div>

                    {/* 加载指示 */}
                    {isLoading && (
                      <div className="flex items-center justify-center w-10">
                        <span className="text-[var(--accent)] animate-spin text-sm">&#x21BB;</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
