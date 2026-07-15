import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { apiFetch } from "../api"
import ActivityTimeline from "../components/ActivityTimeline"
import { ImgWithFallback } from "../components/ImgWithFallback"
import RescrapeModal from "../components/RescrapeModal"
import { StarRating } from "../components/StarRating"
import { proxiedImageUrl } from "../imageProxy"
import { useI18nStore } from "../stores/i18nStore"
import { toast } from "../stores/toastStore"
import type { LibraryCategory, LibraryRecord, LibraryRecordUpdateInput, RecordStatus } from "../types/library"

const CATEGORIES: LibraryCategory[] = ["movie", "tv_show", "game"]
type Translate = ReturnType<typeof useI18nStore.getState>["t"]

export default function LibraryDetailPage() {
  const { category, id } = useParams()
  const { t } = useI18nStore()
  const [record, setRecord] = useState<LibraryRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [rescraping, setRescraping] = useState(false)
  const [form, setForm] = useState<LibraryRecordUpdateInput>({
    status: "UNSET",
    rating: null,
    shortReview: "",
  })

  const validCategory = CATEGORIES.includes(category as LibraryCategory)
    ? category as LibraryCategory
    : null
  const validId = id && /^\d+$/.test(id) && Number(id) > 0 ? id : null

  const loadRecord = useCallback(async () => {
    if (!validCategory || !validId) {
      setError(t("detail.invalid"))
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<LibraryRecord>(`/library/${validCategory}/${validId}`)
      setRecord(data)
      setForm({
        status: data.status,
        rating: data.rating ?? null,
        shortReview: data.shortReview ?? "",
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("detail.error"))
    } finally {
      setLoading(false)
    }
  }, [t, validCategory, validId])

  useEffect(() => {
    void loadRecord()
  }, [loadRecord])

  const saveRecord = async () => {
    if (!record || saving) return
    setSaving(true)
    try {
      const updated = await apiFetch<LibraryRecord>(`/library/${record.category}/${record.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: form.status,
          rating: form.rating,
          shortReview: form.shortReview?.trim() || null,
        }),
      })
      setRecord(updated)
      setForm({
        status: updated.status,
        rating: updated.rating ?? null,
        shortReview: updated.shortReview ?? "",
      })
      toast(t("detail.saved"))
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : t("detail.save_error"), "error")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <DetailState label={t("detail.loading")} />
  }

  if (!record || error) {
    return (
      <DetailState label={error || t("detail.error")}>
        <Link to="/library" className="brutal-btn">{t("detail.back")}</Link>
      </DetailState>
    )
  }

  const displayDate = record.releaseDate || record.firstAirDate || record.tmdbReleaseDate
  const overview = record.overview || record.tmdbOverview || record.doubanIntro
  const poster = proxiedImageUrl(record.posterUrl || record.tmdbPosterUrl)
  const entityType = record.category === "tv_show" ? "TV_SHOW" : record.category.toUpperCase()
  const sources = buildSourceEntries(record, t)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/library" className="brutal-btn">← {t("detail.back")}</Link>
        <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-[var(--muted)]">
          {record.category} // {record.id}
        </span>
      </div>

      <section className="relative overflow-hidden border border-[var(--line)] bg-[var(--surface)]">
        <div className="absolute inset-y-0 right-0 w-2/3 bg-[radial-gradient(circle_at_top_right,rgba(212,255,0,0.09),transparent_55%)]" />
        <div className="relative grid lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="min-h-72 border-b border-[var(--line)] bg-black lg:border-r lg:border-b-0">
            {poster ? (
              <ImgWithFallback
                src={poster}
                alt={record.title}
                className="h-full max-h-[420px] w-full object-cover lg:max-h-none"
                fallback={<PosterFallback title={record.title} />}
              />
            ) : (
              <PosterFallback title={record.title} />
            )}
          </div>

          <div className="flex min-w-0 flex-col p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{t(`health.category.${record.category}`)}</Badge>
              <Badge muted>{record.sourceLabel}</Badge>
              {record.platformLabel && <Badge muted>{record.platformLabel}</Badge>}
              <Badge muted>{statusLabel(record.status, t)}</Badge>
              {record.importReviewState !== "ACCEPTED" && (
                <Badge>{t(record.importReviewState === "PENDING" ? "review.state.pending" : "review.state.ignored")}</Badge>
              )}
            </div>
            <h1 className="mt-5 max-w-4xl font-display text-3xl leading-tight text-white sm:text-5xl">
              {record.title}
            </h1>
            {record.doubanAltTitle && record.doubanAltTitle !== record.title && (
              <p className="mt-3 text-sm text-[var(--muted)]">{record.doubanAltTitle}</p>
            )}

            <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-y border-[var(--line)] py-4 font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]">
              <span>{t("detail.date")} <strong className="text-white">{displayDate || "—"}</strong></span>
              <span>{t("detail.added")} <strong className="text-white">{formatDate(record.createdAt)}</strong></span>
              <span>{t("detail.updated")} <strong className="text-white">{formatDate(record.updatedAt)}</strong></span>
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div>
                <div className="section-kicker">{t("detail.synopsis")}</div>
                <p className="mt-2 max-w-3xl whitespace-pre-line text-sm leading-7 text-[var(--muted)]">
                  {overview || t("detail.no_synopsis")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {record.importReviewState !== "ACCEPTED" && (
                  <Link to="/sync/review" className="brutal-btn">{t("review.back_to_queue")}</Link>
                )}
                <Link to="/data-health" className="brutal-btn">{t("detail.check_health")}</Link>
                <button type="button" onClick={() => setRescraping(true)} className="brutal-btn-accent">
                  ↻ {t("lib.rescrape.btn")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {record.category === "game" && (
        <section className="grid gap-px border border-[var(--line)] bg-[var(--line)] sm:grid-cols-3">
          <Metric label={t("detail.playtime")} value={formatPlaytime(record.playtimeMinutes, t)} />
          <Metric label={t("detail.achievements")} value={`${record.achievementUnlocked ?? 0} / ${record.achievementTotal ?? 0}`} />
          <Metric label={t("detail.platform")} value={record.platformLabel || record.platform || "—"} />
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
          <div className="section-kicker">{t("detail.personal_kicker")}</div>
          <h2 className="mt-2 text-2xl text-white">{t("detail.personal_title")}</h2>

          <div className="mt-6 space-y-6">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">{t("detail.status")}</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["UNSET", "WANT", "IN_PROGRESS", "DONE", "DROPPED"] as RecordStatus[]).map(status => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setForm(current => ({ ...current, status }))}
                    className={form.status === status ? "brutal-btn-accent" : "brutal-btn"}
                  >
                    {statusLabel(status, t)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">{t("detail.rating")}</label>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {[1, 2, 3, 4, 5].map(rating => (
                  <button
                    key={rating}
                    type="button"
                    onClick={() => setForm(current => ({ ...current, rating }))}
                    className={`border px-3 py-2 transition-colors ${
                      form.rating === rating
                        ? "border-[var(--accent)] bg-[rgba(212,255,0,0.08)] text-[var(--accent)]"
                        : "border-[var(--line)] text-[var(--muted)] hover:text-white"
                    }`}
                    aria-label={t("detail.rating_value", String(rating))}
                  >
                    <StarRating value={rating} />
                  </button>
                ))}
                <button type="button" onClick={() => setForm(current => ({ ...current, rating: null }))} className="brutal-btn">
                  {t("detail.clear")}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="detail-review" className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">{t("detail.review")}</label>
              <textarea
                id="detail-review"
                value={form.shortReview ?? ""}
                onChange={event => setForm(current => ({ ...current, shortReview: event.target.value }))}
                maxLength={1000}
                rows={6}
                className="tech-input mt-2"
                placeholder={t("detail.review_placeholder")}
              />
              <div className="mt-1 text-right font-mono text-[9px] text-[var(--muted)]">
                {form.shortReview?.length ?? 0}/1000
              </div>
            </div>
          </div>

          <button type="button" onClick={() => void saveRecord()} disabled={saving} className="mt-6 w-full brutal-btn-accent py-4">
            {saving ? t("detail.saving") : t("detail.save")}
          </button>
        </section>

        <section className="border border-[var(--line)] bg-[var(--surface)]">
          <header className="border-b border-[var(--line)] p-5 sm:p-6">
            <div className="section-kicker">{t("detail.sources_kicker")}</div>
            <h2 className="mt-2 text-2xl text-white">{t("detail.sources_title")}</h2>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{t("detail.sources_desc")}</p>
          </header>
          {sources.length ? (
            <div className="divide-y divide-[var(--line)]">
              {sources.map(source => (
                <SourceLedger key={source.label} {...source} />
              ))}
            </div>
          ) : (
            <p className="p-6 text-xs text-[var(--muted)]">{t("detail.no_sources")}</p>
          )}
        </section>
      </div>

      <section className="border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
        <div className="section-kicker">{t("detail.history_kicker")}</div>
        <h2 className="mt-2 mb-5 text-2xl text-white">{t("detail.history_title")}</h2>
        <ActivityTimeline entityType={entityType} entityId={String(record.id)} />
      </section>

      {rescraping && (
        <RescrapeModal
          record={record}
          onClose={() => setRescraping(false)}
          onUpdated={() => {
            setRescraping(false)
            toast(t("lib.rescrape.success"))
            void loadRecord()
          }}
        />
      )}
    </div>
  )
}

function buildSourceEntries(record: LibraryRecord, t: Translate) {
  const entries: Array<{ label: string; id: string; href?: string; fields: Array<[string, string]> }> = []
  if (record.doubanId) {
    entries.push({
      label: "DOUBAN",
      id: record.doubanId,
      href: record.doubanLink || undefined,
      fields: compactFields([
        [t("detail.source.title"), record.doubanTitle],
        [t("detail.source.date"), record.doubanDate],
        [t("detail.source.score"), formatNumber(record.doubanAvgRating)],
      ]),
    })
  }
  if (record.tmdbId) {
    entries.push({
      label: "TMDB",
      id: record.tmdbId,
      href: `https://www.themoviedb.org/${record.category === "tv_show" ? "tv" : "movie"}/${record.tmdbId}`,
      fields: compactFields([
        [t("detail.source.title"), record.tmdbTitle],
        [t("detail.source.date"), record.tmdbReleaseDate],
        [t("detail.source.score"), formatNumber(record.tmdbVoteAverage)],
        [t("detail.source.popularity"), formatNumber(record.tmdbPopularity)],
        [t("detail.source.genres"), record.tmdbGenreIds],
      ]),
    })
  }
  if (record.imdbId) {
    entries.push({
      label: "IMDB",
      id: record.imdbId,
      href: `https://www.imdb.com/title/${record.imdbId}/`,
      fields: compactFields([[t("detail.source.score"), formatNumber(record.imdbRating)]]),
    })
  }
  if (record.traktId) entries.push({ label: "TRAKT", id: record.traktId, fields: [] })
  if (record.rawgId) {
    entries.push({ label: "RAWG", id: record.rawgId, href: `https://rawg.io/games/${record.rawgId}`, fields: [] })
  }
  if (record.steamAppId) {
    entries.push({
      label: "STEAM",
      id: record.steamAppId,
      href: `https://store.steampowered.com/app/${record.steamAppId}`,
      fields: [],
    })
  }
  if (record.xboxId) entries.push({ label: "XBOX", id: record.xboxId, fields: [] })
  if (record.psnId) entries.push({ label: "PSN", id: record.psnId, fields: [] })
  return entries
}

function SourceLedger({ label, id, href, fields }: { label: string; id: string; href?: string; fields: Array<[string, string]> }) {
  const { t } = useI18nStore()
  return (
    <article className="grid gap-4 p-5 sm:grid-cols-[120px_minmax(0,1fr)] sm:p-6">
      <div>
        <div className="font-display text-lg text-[var(--accent)]">{label}</div>
        <div className="mt-1 break-all font-mono text-[9px] text-[var(--muted)]">ID {id}</div>
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-[9px] uppercase tracking-widest text-white hover:text-[var(--accent)]">
            {t("detail.open_source")} ↗
          </a>
        )}
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        {fields.length ? fields.map(([name, value]) => (
          <div key={name} className="border-l border-[var(--line)] pl-3">
            <dt className="font-mono text-[8px] uppercase tracking-widest text-[var(--muted)]">{name}</dt>
            <dd className="mt-1 text-xs leading-5 text-white">{value}</dd>
          </div>
        )) : (
          <div className="text-xs text-[var(--muted)]">{t("detail.identity_only")}</div>
        )}
      </dl>
    </article>
  )
}

function DetailState({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center gap-5 border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
      <div className="text-2xl text-[var(--accent)]">◇</div>
      <p className="text-xs uppercase tracking-widest text-[var(--muted)]">{label}</p>
      {children}
    </div>
  )
}

function PosterFallback({ title }: { title: string }) {
  return (
    <div className="flex h-full min-h-72 items-center justify-center bg-[#080808]">
      <span className="font-display text-6xl text-[var(--accent)] opacity-20">{title.charAt(0).toUpperCase()}</span>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--surface)] p-5">
      <div className="font-mono text-[9px] uppercase tracking-widest text-[var(--muted)]">{label}</div>
      <div className="mt-2 font-display text-2xl text-white">{value}</div>
    </div>
  )
}

function Badge({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span className={`border px-2 py-1 text-[9px] uppercase tracking-widest ${
      muted ? "border-[var(--line)] text-[var(--muted)]" : "border-[var(--accent)] text-[var(--accent)]"
    }`}>
      {children}
    </span>
  )
}

function compactFields(values: Array<[string, string | null | undefined]>): Array<[string, string]> {
  return values.filter((value): value is [string, string] => Boolean(value[1]))
}

function statusLabel(status: RecordStatus, t: Translate) {
  const keys = {
    UNSET: "global.status.unset",
    WANT: "global.status.want",
    IN_PROGRESS: "global.status.active",
    DONE: "global.status.done",
    DROPPED: "global.status.dropped",
  } as const
  return t(keys[status])
}

function formatDate(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

function formatNumber(value?: number | null) {
  return value == null ? null : String(value)
}

function formatPlaytime(minutes: number | null | undefined, t: Translate) {
  if (!minutes) return t("detail.none")
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return t("detail.playtime_value", String(hours), String(rest))
}
