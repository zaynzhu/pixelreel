import { Link } from "react-router-dom"
import { proxiedImageUrl } from "../imageProxy"
import { useI18nStore } from "../stores/i18nStore"
import type { MonthlyMemoryItem } from "../types/profile"
import { ImgWithFallback } from "./ImgWithFallback"

interface Props {
  items?: MonthlyMemoryItem[]
  loading: boolean
}

export function MonthlyMemories({ items = [], loading }: Props) {
  const { lang, t } = useI18nStore()
  const month = new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2020, new Date().getUTCMonth(), 1)))

  return (
    <section className="dash-card overflow-hidden lg:col-span-2">
      <div className="absolute inset-x-0 top-0 h-px bg-[var(--signal-memory)]" />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="section-kicker !text-[var(--signal-memory)]">{t("dash.memory.kicker")}</p>
          <h2 className="font-display mt-2 text-2xl text-white">{t("dash.memory.title", month)}</h2>
        </div>
        <div className="max-w-xl text-right">
          <p className="text-xs leading-5 text-[var(--muted)]">{t("dash.memory.desc")}</p>
          <p className="mt-1 text-[9px] uppercase tracking-[0.18em] text-[var(--signal-memory)]">
            {t("dash.memory.rule")}
          </p>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="relative mt-6 grid gap-px overflow-hidden border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-5">
          {items.map(item => (
            <MemoryFrame key={`${item.category}-${item.id}`} item={item} />
          ))}
        </div>
      ) : (
        <div className="mt-6 border border-dashed border-[var(--line)] px-4 py-10 text-center text-[10px] uppercase tracking-widest text-[var(--muted)]">
          {loading ? t("dash.awaiting") : t("dash.memory.empty")}
        </div>
      )}
    </section>
  )
}

function MemoryFrame({ item }: { item: MonthlyMemoryItem }) {
  const { t } = useI18nStore()
  const poster = proxiedImageUrl(item.posterUrl)
  const year = item.completedAt.slice(0, 4)
  const monthDay = item.completedAt.slice(5, 10)

  return (
    <Link
      to={`/library/${item.category}/${item.id}`}
      className="group relative min-h-44 overflow-hidden bg-[var(--surface)] p-4 transition-colors hover:bg-[var(--surface-hover)] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--signal-memory)]"
    >
      <span className="font-display pointer-events-none absolute -right-1 -top-3 text-6xl font-extrabold text-white/[0.04] transition-colors group-hover:text-[var(--signal-memory)]/[0.08]">
        {year}
      </span>
      <div className="relative flex gap-4">
        <div className="h-28 w-20 shrink-0 overflow-hidden border border-[var(--line)] bg-black">
          {poster ? (
            <ImgWithFallback
              src={poster}
              alt={item.title}
              className="h-full w-full object-cover grayscale transition-all duration-300 group-hover:grayscale-0"
              fallback={<MemoryPlaceholder title={item.title} />}
            />
          ) : (
            <MemoryPlaceholder title={item.title} />
          )}
        </div>
        <div className="min-w-0 pt-1">
          <div className="font-display text-2xl text-[var(--signal-memory)]">{year}</div>
          <div className="mt-1 text-[9px] uppercase tracking-wider text-[var(--muted)]">
            {t("dash.memory.years_ago", item.yearsAgo)}
          </div>
          <h3 className="mt-4 line-clamp-2 text-xs font-bold leading-5 text-white group-hover:text-[var(--signal-memory)]">
            {item.title}
          </h3>
        </div>
      </div>
      <div className="relative mt-4 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3 text-[9px] uppercase tracking-wider text-[var(--muted)]">
        <span className="truncate">{memoryCategoryLabel(item.category, t)} // {monthDay}</span>
        <span className="shrink-0 text-white">{item.rating ?? t("dash.null")} / 5</span>
      </div>
    </Link>
  )
}

function memoryCategoryLabel(
  category: MonthlyMemoryItem["category"],
  t: ReturnType<typeof useI18nStore.getState>["t"],
) {
  if (category === "movie") return t("dash.memory.category.movie")
  if (category === "tv_show") return t("dash.memory.category.tv")
  return t("dash.memory.category.game")
}

function MemoryPlaceholder({ title }: { title: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(145deg,#071014,#101010)] font-display text-2xl text-[var(--signal-memory)]/40">
      {title.slice(0, 1).toUpperCase()}
    </div>
  )
}
