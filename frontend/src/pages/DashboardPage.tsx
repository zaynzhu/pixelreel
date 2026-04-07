import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useProfileStore } from "../stores/profileStore";

const QUICK_LINKS = [
  {
    title: "找电影条目",
    to: "/movies/search",
    description: "继续用多 Provider 搜索电影，再直接加入记录。",
  },
  {
    title: "找游戏条目",
    to: "/games/search",
    description: "RAWG 作为主入口，Steam 作为补充精搜。",
  },
  {
    title: "进入记录库",
    to: "/library",
    description: "筛选电影和游戏记录，并在同一页补评分与短评。",
  },
];

export default function DashboardPage() {
  const { summary, loading, error, fetchSummary } = useProfileStore();

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  const overview = summary?.overview;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
      <section className="dash-card overflow-hidden">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-kicker">Profile Summary</p>
            <h2 className="mt-3 text-3xl text-[var(--ink)] sm:text-4xl">
              个人主页统计
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              这一版先把主页做成总览仪表盘：汇总影游记录、评分、平台来源和最近新增，
              让后面做个人资料、年度回顾或多用户主页时有稳定接口可以复用。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchSummary()}
            className="rounded-full border border-[var(--line)] bg-white/80 px-4 py-2 text-sm font-medium text-[var(--ink)] transition hover:bg-white"
          >
            {loading ? "刷新中..." : "刷新统计"}
          </button>
        </div>

        {error ? (
          <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="总记录"
            value={overview?.totalRecords ?? 0}
            caption="影游条目总和"
          />
          <MetricCard
            label="电影"
            value={overview?.totalMovies ?? 0}
            caption={`${overview?.completedMovies ?? 0} 部已完成`}
          />
          <MetricCard
            label="游戏"
            value={overview?.totalGames ?? 0}
            caption={`${overview?.completedGames ?? 0} 个已完成`}
          />
          <MetricCard
            label="已导入"
            value={overview?.importedGames ?? 0}
            caption="来自平台导入的游戏"
          />
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <MetricStrip
            title="整体均分"
            value={summary?.ratings.overallAverage ?? null}
            note="电影 + 游戏"
          />
          <MetricStrip
            title="电影均分"
            value={summary?.ratings.movieAverage ?? null}
            note={`${overview?.ratedRecords ?? 0} 条评分中`}
          />
          <MetricStrip
            title="游戏均分"
            value={summary?.ratings.gameAverage ?? null}
            note={`${overview?.reviewedRecords ?? 0} 条带短评`}
          />
        </div>
      </section>

      <section className="dash-card">
        <p className="section-kicker">Quick Routes</p>
        <h2 className="mt-3 text-3xl text-[var(--ink)]">页面入口骨架</h2>
        <div className="mt-6 space-y-3">
          {QUICK_LINKS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="block rounded-[24px] border border-[var(--line)] bg-white/75 px-5 py-4 transition hover:-translate-y-0.5 hover:bg-white"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg text-[var(--ink)]">{item.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                    {item.description}
                  </p>
                </div>
                <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white">
                  Open
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="dash-card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="section-kicker">Status</p>
            <h2 className="mt-3 text-2xl text-[var(--ink)]">电影状态分布</h2>
          </div>
          <span className="text-sm text-[var(--muted)]">Movies</span>
        </div>
        <div className="mt-6 space-y-4">
          {summary?.movieStatuses.map((item) => (
            <DistributionBar
              key={item.key}
              label={item.label}
              count={item.count}
              total={overview?.totalMovies ?? 0}
            />
          )) ?? <LoadingHint loading={loading} />}
        </div>
      </section>

      <section className="dash-card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="section-kicker">Status</p>
            <h2 className="mt-3 text-2xl text-[var(--ink)]">游戏状态分布</h2>
          </div>
          <span className="text-sm text-[var(--muted)]">Games</span>
        </div>
        <div className="mt-6 space-y-4">
          {summary?.gameStatuses.map((item) => (
            <DistributionBar
              key={item.key}
              label={item.label}
              count={item.count}
              total={overview?.totalGames ?? 0}
            />
          )) ?? <LoadingHint loading={loading} />}
        </div>
      </section>

      <section className="dash-card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="section-kicker">Sources</p>
            <h2 className="mt-3 text-2xl text-[var(--ink)]">电影来源</h2>
          </div>
          <span className="text-sm text-[var(--muted)]">Providers</span>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {summary?.movieSources.map((item) => (
            <SourceChip key={item.key} label={item.label} count={item.count} />
          )) ?? <LoadingHint loading={loading} />}
        </div>
      </section>

      <section className="dash-card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="section-kicker">Platforms</p>
            <h2 className="mt-3 text-2xl text-[var(--ink)]">游戏平台分布</h2>
          </div>
          <span className="text-sm text-[var(--muted)]">Import + Manual</span>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {summary?.gamePlatforms.map((item) => (
            <SourceChip key={item.key} label={item.label} count={item.count} />
          )) ?? <LoadingHint loading={loading} />}
        </div>
      </section>

      <section className="dash-card lg:col-span-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-kicker">Recent</p>
            <h2 className="mt-3 text-2xl text-[var(--ink)]">最近新增记录</h2>
          </div>
          <p className="text-sm text-[var(--muted)]">
            新加的电影和游戏会一起混排，方便首页快速回顾。
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summary?.recentItems.length ? (
            summary.recentItems.map((item) => (
              <article
                key={`${item.category}-${item.id}`}
                className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-white/80"
              >
                <div className="aspect-[4/5] bg-[linear-gradient(135deg,#f1e1c5_0%,#f7f1e7_100%)]">
                  {item.posterUrl ? (
                    <img
                      src={item.posterUrl}
                      alt={item.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-end p-4 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--accent-deep)]">
                      {item.category}
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-[var(--ink)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white">
                      {item.category}
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      {formatStatus(item.status)}
                    </span>
                  </div>
                  <h3 className="mt-3 text-xl text-[var(--ink)]">{item.title}</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">{item.subtitle}</p>
                  <div className="mt-4 flex items-center justify-between text-sm text-[var(--muted)]">
                    <span>{formatDate(item.createdAt)}</span>
                    <span>{item.rating == null ? "未评分" : `${item.rating}/10`}</span>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <LoadingHint loading={loading} />
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
}: {
  label: string;
  value: number;
  caption: string;
}) {
  return (
    <div className="rounded-[24px] border border-[var(--line)] bg-white/70 p-5">
      <p className="text-sm font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-4xl font-semibold text-[var(--ink)]">{value}</p>
      <p className="mt-3 text-sm text-[var(--muted)]">{caption}</p>
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
    <div className="rounded-[24px] border border-[var(--line)] bg-[rgba(217,72,47,0.08)] p-5">
      <p className="text-sm font-medium text-[var(--muted)]">{title}</p>
      <div className="mt-3 flex items-end gap-3">
        <span className="text-3xl font-semibold text-[var(--ink)]">
          {value == null ? "--" : value.toFixed(1)}
        </span>
        <span className="pb-1 text-sm text-[var(--muted)]">/ 10</span>
      </div>
      <p className="mt-3 text-sm text-[var(--muted)]">{note}</p>
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
  const width = total === 0 ? 0 : Math.max((count / total) * 100, count > 0 ? 8 : 0);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-[var(--ink)]">{label}</span>
        <span className="text-[var(--muted)]">{count}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-[rgba(31,24,14,0.08)]">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent)_0%,#f29648_100%)]"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function SourceChip({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded-[22px] border border-[var(--line)] bg-white/80 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold text-[var(--ink)]">{count}</p>
    </div>
  );
}

function LoadingHint({ loading }: { loading: boolean }) {
  return (
    <p className="rounded-[24px] border border-dashed border-[var(--line)] px-4 py-5 text-sm text-[var(--muted)]">
      {loading ? "统计加载中..." : "暂时还没有数据。"}
    </p>
  );
}

function formatStatus(status: string) {
  switch (status) {
    case "WANT":
      return "想记录";
    case "IN_PROGRESS":
      return "进行中";
    case "DONE":
      return "已完成";
    default:
      return "未分类";
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未知时间";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
  }).format(date);
}
