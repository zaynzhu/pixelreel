import { Link } from "react-router-dom"
import { useI18nStore } from "../stores/i18nStore"
import type { ActionQueueItem, ProfileSummary } from "../types/profile"
import { ImgWithFallback } from "./ImgWithFallback"

interface Props {
  queue?: ProfileSummary["nextUp"]
  loading: boolean
}

export function NextUpQueue({ queue, loading }: Props) {
  const { t } = useI18nStore()

  return (
    <section className="dash-card overflow-hidden lg:col-span-2">
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,var(--accent),transparent_45%,var(--accent-deep))]" />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="section-kicker">{t("dash.queue.kicker")}</p>
          <h2 className="font-display mt-2 text-2xl text-white">{t("dash.queue.title")}</h2>
        </div>
        <p className="max-w-xl text-xs leading-5 text-[var(--muted)]">{t("dash.queue.desc")}</p>
      </div>

      <div className="mt-6 grid divide-y divide-[var(--line)] border border-[var(--line)] lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        <QueueLane
          title={t("dash.queue.resume")}
          rule={t("dash.queue.resume_rule")}
          items={queue?.resume ?? []}
          loading={loading}
          empty={t("dash.queue.resume_empty")}
          tone="accent"
          detail="playtime"
        />
        <QueueLane
          title={t("dash.queue.backlog")}
          rule={t("dash.queue.backlog_rule")}
          items={queue?.backlog ?? []}
          loading={loading}
          empty={t("dash.queue.backlog_empty")}
          tone="deep"
          detail="added"
        />
        <QueueLane
          title={t("dash.queue.reflect")}
          rule={t("dash.queue.reflect_rule")}
          items={queue?.reflect ?? []}
          loading={loading}
          empty={t("dash.queue.reflect_empty")}
          tone="memory"
          detail="review"
        />
      </div>
    </section>
  )
}

function QueueLane({
  title,
  rule,
  items,
  loading,
  empty,
  tone,
  detail,
}: {
  title: string
  rule: string
  items: ActionQueueItem[]
  loading: boolean
  empty: string
  tone: "accent" | "deep" | "memory"
  detail: "playtime" | "added" | "review"
}) {
  const { t } = useI18nStore()
  const color = tone === "accent"
    ? "var(--accent)"
    : tone === "deep"
      ? "var(--accent-deep)"
      : "var(--signal-memory)"

  return (
    <div className="bg-black/10 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-3">
        <h3 className="font-display text-sm uppercase tracking-wider text-white">{title}</h3>
        <span className="text-[9px] uppercase tracking-[0.18em] text-[var(--muted)]">{rule}</span>
      </div>

      {items.length > 0 ? (
        <div className="relative mt-3 space-y-2 before:absolute before:bottom-5 before:left-[1.2rem] before:top-5 before:w-px before:bg-[var(--line)]">
          {items.map((item, index) => (
            <Link
              key={`${item.category}-${item.id}`}
              to={`/library/${item.category}/${item.id}`}
              className="group relative grid grid-cols-[2.5rem_2.5rem_minmax(0,1fr)_auto] items-center gap-3 border border-transparent px-1 py-2 transition-colors hover:border-[var(--line)] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            >
              <span
                className="relative z-10 flex h-6 w-6 items-center justify-center bg-[var(--page-bg)] font-mono text-[9px] font-bold"
                style={{ border: `1px solid ${color}`, color }}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="h-10 w-8 overflow-hidden border border-[var(--line)] bg-black">
                {item.posterUrl ? (
                  <ImgWithFallback
                    src={item.posterUrl}
                    alt={item.title}
                    className="h-full w-full object-cover grayscale transition-all group-hover:grayscale-0"
                    fallback={<QueuePlaceholder title={item.title} />}
                  />
                ) : (
                  <QueuePlaceholder title={item.title} />
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-bold text-white group-hover:text-[var(--accent)]">
                  {item.title}
                </div>
                <div className="mt-1 truncate text-[9px] uppercase tracking-wider text-[var(--muted)]">
                  {item.subtitle} // {queueItemDetail(item, t, detail)}
                </div>
              </div>
              <span className="text-xs text-[var(--muted)] transition-transform group-hover:translate-x-1 group-hover:text-white">→</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-3 border border-dashed border-[var(--line)] px-4 py-10 text-center text-[10px] uppercase tracking-widest text-[var(--muted)]">
          {loading ? t("dash.awaiting") : empty}
        </div>
      )}
    </div>
  )
}

function queueItemDetail(
  item: ActionQueueItem,
  t: ReturnType<typeof useI18nStore.getState>["t"],
  detail: "playtime" | "added" | "review",
) {
  if (detail === "review") {
    return t("dash.queue.rating_review", item.rating ?? 0)
  }
  const minutes = item.playtimeMinutes ?? 0
  if (detail === "playtime" && minutes > 0) {
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return hours > 0
      ? t("dash.queue.playtime_hours", hours, remainingMinutes)
      : t("dash.queue.playtime_minutes", remainingMinutes)
  }
  return t("dash.queue.added", new Date(item.createdAt).toISOString().slice(0, 10))
}

function QueuePlaceholder({ title }: { title: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center text-[9px] font-bold text-[var(--muted)]">
      {title.slice(0, 1).toUpperCase()}
    </div>
  )
}
