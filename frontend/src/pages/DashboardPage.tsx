import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useProfileStore } from "../stores/profileStore";
import { useI18nStore } from "../stores/i18nStore";
import { apiFetch } from "../api";

export default function DashboardPage() {
  const { summary, loading, error, fetchSummary } = useProfileStore();
  const { t } = useI18nStore();
  const [syncingTrakt, setSyncingTrakt] = useState<"movies" | "shows" | "posters" | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  const handleTraktSync = async (type: "movies" | "shows") => {
    setSyncingTrakt(type);
    setSyncMsg(null);
    try {
      const res = await apiFetch<any>(`/trakt/import/${type}`, { method: "POST" });
      setSyncMsg(t("dash.sync.success", res.skipped ?? 0));
      void fetchSummary();
    } catch (err: any) {
      setSyncMsg(t("dash.sync.failed") + ": " + err.message);
    } finally {
      setSyncingTrakt(null);
    }
  };

  const handleFillPosters = async () => {
    setSyncingTrakt("posters");
    setSyncMsg(null);
    try {
      const res = await apiFetch<any>(`/import/tmdb-covers/fill`, { method: "POST" });
      setSyncMsg(`[POSTERS] FILLED: ${res.imported ?? 0}, SKIPPED: ${res.skipped ?? 0}`);
      void fetchSummary();
    } catch (err: any) {
      setSyncMsg(t("dash.sync.failed") + ": " + err.message);
    } finally {
      setSyncingTrakt(null);
    }
  };

  const overview = summary?.overview;

  const QUICK_LINKS = [
    {
      title: t("dash.nodes.movie_title"),
      to: "/movies/search",
      description: t("dash.nodes.movie_desc"),
    },
    {
      title: t("dash.nodes.game_title"),
      to: "/games/search",
      description: t("dash.nodes.game_desc"),
    },
    {
      title: t("dash.nodes.tv_title"),
      to: "/tv-shows/search",
      description: t("dash.nodes.tv_desc"),
    },
    {
      title: t("dash.nodes.lib_title"),
      to: "/library",
      description: t("dash.nodes.lib_desc"),
    },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
      <section className="dash-card overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[var(--accent)]" />
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-kicker">{t("dash.telemetry")}</p>
            <h2 className="font-display mt-2 text-3xl text-white sm:text-4xl">
              {t("dash.overview")}
            </h2>
            <p className="mt-3 max-w-2xl text-xs leading-6 text-[var(--muted)]">
              {t("dash.overview_desc")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchSummary()}
            className="brutal-btn"
          >
            {loading ? t("dash.syncing") : t("dash.force_sync")}
          </button>
        </div>

        {error ? (
          <div className="mt-5 border-l-4 border-red-500 bg-red-500/10 px-4 py-3 text-xs text-red-400 font-bold uppercase">
            [ERR] {error}
          </div>
        ) : null}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label={t("dash.metrics.total")}
            value={overview?.totalRecords ?? 0}
            caption={t("dash.metrics.total_cap")}
          />
          <MetricCard
            label={t("dash.metrics.movies")}
            value={overview?.totalMovies ?? 0}
            caption={`${overview?.completedMovies ?? 0} ${t("dash.metrics.completed")}`}
          />
          <MetricCard
            label={t("dash.metrics.games")}
            value={overview?.totalGames ?? 0}
            caption={`${overview?.completedGames ?? 0} ${t("dash.metrics.completed")}`}
          />
          <MetricCard
            label={t("dash.metrics.tv")}
            value={overview?.totalTvShows ?? 0}
            caption={`${overview?.completedTvShows ?? 0} ${t("dash.metrics.completed")}`}
          />
          <MetricCard
            label={t("dash.metrics.imported")}
            value={overview?.importedGames ?? 0}
            caption={t("dash.metrics.imported_cap")}
            highlight
          />
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-4">
          <MetricStrip
            title={t("dash.avg.global")}
            value={summary?.ratings.overallAverage ?? null}
            note={t("dash.avg.global_note")}
          />
          <MetricStrip
            title={t("dash.avg.movie")}
            value={summary?.ratings.movieAverage ?? null}
            note={`${overview?.ratedRecords ?? 0} ${t("dash.avg.movie_note")}`}
          />
          <MetricStrip
            title={t("dash.avg.tv")}
            value={summary?.ratings.tvShowAverage ?? null}
            note={t("dash.avg.tv_note")}
          />
          <MetricStrip
            title={t("dash.avg.game")}
            value={summary?.ratings.gameAverage ?? null}
            note={`${overview?.reviewedRecords ?? 0} ${t("dash.avg.game_note")}`}
          />
        </div>
      </section>

      <section className="dash-card">
        <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-[var(--accent)]" />
        <p className="section-kicker">{t("dash.routes")}</p>
        <h2 className="font-display mt-2 text-2xl text-white">{t("dash.nodes")}</h2>
        <div className="mt-6 space-y-3">
          {QUICK_LINKS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="block border border-[var(--line)] bg-[var(--surface-hover)] px-5 py-4 transition-all hover:-translate-y-1 hover:border-[var(--accent)]"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-display text-lg text-white">{item.title}</h3>
                  <p className="mt-1 text-xs leading-6 text-[var(--muted)]">
                    {item.description}
                  </p>
                </div>
                <span className="neo-badge-accent">{t("dash.btn.exec")}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="dash-card">
        <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[var(--accent)]" />
        <p className="section-kicker">{t("dash.sync.trakt")}</p>
        <h2 className="font-display mt-2 text-2xl text-white">TRAKT_SYNC</h2>
        <div className="mt-6 space-y-3">
          {syncMsg && (
            <div className="border-l-4 border-yellow-500 bg-yellow-500/10 px-4 py-3 text-[10px] text-yellow-400 font-bold uppercase tracking-widest">
              [SYS] {syncMsg}
            </div>
          )}
          <button
            onClick={() => void handleTraktSync("movies")}
            disabled={syncingTrakt !== null}
            className="w-full flex items-center justify-between gap-4 border border-[var(--line)] bg-[var(--surface-hover)] px-5 py-4 transition-all hover:border-[var(--accent)] disabled:opacity-50"
          >
            <div>
              <h3 className="font-display text-lg text-white">{t("dash.sync.trakt_movies")}</h3>
            </div>
            <span className="neo-badge-accent">{syncingTrakt === "movies" ? t("dash.syncing") : t("dash.btn.exec")}</span>
          </button>
          <button
            onClick={() => void handleTraktSync("shows")}
            disabled={syncingTrakt !== null}
            className="w-full flex items-center justify-between gap-4 border border-[var(--line)] bg-[var(--surface-hover)] px-5 py-4 transition-all hover:border-[var(--accent)] disabled:opacity-50"
          >
            <div>
              <h3 className="font-display text-lg text-white">{t("dash.sync.trakt_shows")}</h3>
            </div>
            <span className="neo-badge-accent">{syncingTrakt === "shows" ? t("dash.syncing") : t("dash.btn.exec")}</span>
          </button>
          <button
            onClick={() => void handleFillPosters()}
            disabled={syncingTrakt !== null}
            className="w-full flex items-center justify-between gap-4 border border-[var(--line)] bg-[var(--surface-hover)] px-5 py-4 transition-all hover:border-[var(--accent)] disabled:opacity-50"
          >
            <div>
              <h3 className="font-display text-lg text-white">{t("dash.sync.fix_posters")}</h3>
            </div>
            <span className="neo-badge-accent">{syncingTrakt === "posters" ? t("dash.syncing") : t("dash.btn.exec")}</span>
          </button>
        </div>
      </section>

      <section className="dash-card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="section-kicker">{t("dash.status.data")}</p>
            <h2 className="font-display mt-2 text-xl text-white">{t("dash.status.movie")}</h2>
          </div>
          <span className="text-xs text-[var(--muted)]">V_01</span>
        </div>
        <div className="mt-6 space-y-4">
          {summary?.movieStatuses.map((item) => (
            <DistributionBar
              key={item.key}
              label={item.key}
              count={item.count}
              total={overview?.totalMovies ?? 0}
            />
          )) ?? <LoadingHint loading={loading} t={t} />}
        </div>
      </section>

      <section className="dash-card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="section-kicker">{t("dash.status.data")}</p>
            <h2 className="font-display mt-2 text-xl text-white">{t("dash.status.game")}</h2>
          </div>
          <span className="text-xs text-[var(--muted)]">V_02</span>
        </div>
        <div className="mt-6 space-y-4">
          {summary?.gameStatuses.map((item) => (
            <DistributionBar
              key={item.key}
              label={item.key}
              count={item.count}
              total={overview?.totalGames ?? 0}
            />
          )) ?? <LoadingHint loading={loading} t={t} />}
        </div>
      </section>

      <section className="dash-card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="section-kicker">{t("dash.status.data")}</p>
            <h2 className="font-display mt-2 text-xl text-white">{t("dash.status.tv")}</h2>
          </div>
          <span className="text-xs text-[var(--muted)]">V_03</span>
        </div>
        <div className="mt-6 space-y-4">
          {summary?.tvShowStatuses.map((item) => (
            <DistributionBar
              key={item.key}
              label={item.key}
              count={item.count}
              total={overview?.totalTvShows ?? 0}
            />
          )) ?? <LoadingHint loading={loading} t={t} />}
        </div>
      </section>

      <section className="dash-card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="section-kicker">{t("dash.origin")}</p>
            <h2 className="font-display mt-2 text-xl text-white">{t("dash.origin.movie")}</h2>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {summary?.movieSources.map((item) => (
            <SourceChip key={item.key} label={item.key} count={item.count} />
          )) ?? <LoadingHint loading={loading} t={t} />}
        </div>
      </section>

      <section className="dash-card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="section-kicker">{t("dash.platforms")}</p>
            <h2 className="font-display mt-2 text-xl text-white">{t("dash.platforms.game")}</h2>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {summary?.gamePlatforms.map((item) => (
            <SourceChip key={item.key} label={item.key} count={item.count} />
          )) ?? <LoadingHint loading={loading} t={t} />}
        </div>
      </section>

      <section className="dash-card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="section-kicker">{t("dash.origin")}</p>
            <h2 className="font-display mt-2 text-xl text-white">{t("dash.origin.tv")}</h2>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {summary?.tvShowSources.map((item) => (
            <SourceChip key={item.key} label={item.key} count={item.count} />
          )) ?? <LoadingHint loading={loading} t={t} />}
        </div>
      </section>

      <section className="dash-card lg:col-span-2 border-t-4 border-t-[var(--accent)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-kicker">{t("dash.log")}</p>
            <h2 className="font-display mt-2 text-2xl text-white">{t("dash.recent")}</h2>
          </div>
          <p className="text-xs text-[var(--muted)]">
            {t("dash.recent_desc")}
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summary?.recentItems.length ? (
            summary.recentItems.map((item) => (
              <article
                key={`${item.category}-${item.id}`}
                className="group relative overflow-hidden border border-[var(--line)] bg-[var(--surface-hover)] transition-all hover:border-white"
              >
                <div className="aspect-[4/5] bg-[#111] relative overflow-hidden">
                  {item.posterUrl ? (
                    <img
                      src={item.posterUrl}
                      alt={item.title}
                      className="h-full w-full object-cover opacity-80 mix-blend-luminosity transition-all group-hover:opacity-100 group-hover:mix-blend-normal"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center p-4 text-xs font-bold uppercase tracking-[0.24em] text-[var(--line)]">
                      {t("dash.no_signal")}
                    </div>
                  )}
                  {/* Scanline effect over images */}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] pointer-events-none opacity-50" />
                </div>
                <div className="p-4 border-t border-[var(--line)]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="neo-badge">
                      {categoryLabel(item.category, t)}
                    </span>
                    <span className="text-[10px] uppercase text-[var(--accent)]">
                      [{formatStatus(item.status, t)}]
                    </span>
                  </div>
                  <h3 className="font-display mt-3 text-lg text-white truncate" title={item.title}>{item.title}</h3>
                  <p className="mt-1 text-[10px] text-[var(--muted)] uppercase truncate">{item.subtitle}</p>
                  <div className="mt-4 flex items-center justify-between text-[10px] text-[var(--muted)] uppercase">
                    <span>{formatDate(item.createdAt)}</span>
                    <span className={item.rating ? "text-[var(--accent-deep)] font-bold" : ""}>
                      {item.rating == null ? t("dash.null") : `${item.rating}/10`}
                    </span>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <LoadingHint loading={loading} t={t} />
          )}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  caption,
  highlight = false,
}: {
  label: string;
  value: number;
  caption: string;
  highlight?: boolean;
}) {
  return (
    <div className={`border bg-[var(--surface-hover)] p-4 transition-all ${highlight ? "border-[var(--accent)]" : "border-[var(--line)]"}`}>
      <p className="text-[10px] font-bold text-[var(--muted)] uppercase">{label}</p>
      <p className={`font-display mt-2 text-3xl ${highlight ? "text-[var(--accent)]" : "text-white"}`}>{value}</p>
      <p className="mt-3 text-[10px] uppercase text-[var(--muted)] tracking-widest">{caption}</p>
    </div>
  );
}

function MetricStrip({
  title,
  value,
  note,
}: {
  title: string;
  value: number | null;
  note: string;
}) {
  return (
    <div className="border border-[var(--line)] bg-[var(--surface-hover)] p-4 relative overflow-hidden">
      <div className="absolute top-0 right-0 bottom-0 w-1 bg-[var(--accent-deep)] opacity-50" />
      <p className="text-[10px] font-bold text-[var(--muted)] uppercase">{title}</p>
      <div className="mt-2 flex items-end gap-2">
        <span className="font-display text-3xl text-white">
          {value == null ? "--" : value.toFixed(1)}
        </span>
        <span className="pb-1 text-[10px] text-[var(--accent)] font-bold">/ 10</span>
      </div>
      <p className="mt-2 text-[10px] uppercase tracking-widest text-[var(--muted)]">{note}</p>
    </div>
  );
}

function DistributionBar({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  const width = total === 0 ? 0 : Math.max((count / total) * 100, count > 0 ? 2 : 0);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
        <span className="text-white">{label}</span>
        <span className="text-[var(--accent)]">[{count}]</span>
      </div>
      <div className="h-1.5 w-full bg-[var(--line)]">
        <div
          className="h-full bg-[var(--accent)] transition-all duration-500"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function SourceChip({ label, count }: { label: string; count: number }) {
  return (
    <div className="border border-[var(--line)] bg-[var(--surface-hover)] px-4 py-3 flex items-center justify-between">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
        {label}
      </p>
      <p className="font-display text-xl text-white">{count}</p>
    </div>
  );
}

function LoadingHint({ loading, t }: { loading: boolean, t: any }) {
  return (
    <div className="border border-dashed border-[var(--line)] px-4 py-5 text-[10px] uppercase tracking-widest text-[var(--muted)] flex items-center justify-center">
      {loading ? t("dash.awaiting") : t("dash.no_data")}
    </div>
  );
}

function formatStatus(status: string, t: any) {
  switch (status) {
    case "WANT": return t("global.status.want");
    case "IN_PROGRESS": return t("global.status.active");
    case "DONE": return t("global.status.done");
    default: return t("global.status.unset");
  }
}

function categoryLabel(category: string, t: any) {
  switch (category) {
    case "movie": return t("global.cat.mov");
    case "game": return t("global.cat.gam");
    case "tv_show": return t("global.cat.tvs");
    default: return category.toUpperCase();
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "UNKNOWN";
  }
  return date.toISOString().split('T')[0]; // Format as YYYY-MM-DD
}