import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { useLibraryStore } from "../stores/libraryStore";
import type {
  LibraryCategory,
  LibraryRecord,
  LibraryRecordUpdateInput,
  RecordStatus,
} from "../types/library";

const STATUS_OPTIONS: Array<{ value: RecordStatus; label: string }> = [
  { value: "UNSET", label: "未分类" },
  { value: "WANT", label: "想记录" },
  { value: "IN_PROGRESS", label: "进行中" },
  { value: "DONE", label: "已完成" },
];

const SORT_OPTIONS = [
  { value: "recent", label: "最近更新" },
  { value: "rating", label: "评分优先" },
  { value: "title", label: "标题 A-Z" },
] as const;

type CategoryFilter = "all" | LibraryCategory;
type SortValue = (typeof SORT_OPTIONS)[number]["value"];
type SelectedRecordKey = `${LibraryCategory}:${number}`;

export default function LibraryPage() {
  const { records, loading, saving, error, fetchRecords, updateRecord } = useLibraryStore();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [status, setStatus] = useState<"all" | RecordStatus>("all");
  const [source, setSource] = useState("all");
  const [reviewFilter, setReviewFilter] = useState<"all" | "reviewed" | "unreviewed">("all");
  const [sortBy, setSortBy] = useState<SortValue>("recent");
  const [selectedKey, setSelectedKey] = useState<SelectedRecordKey | null>(null);
  const [form, setForm] = useState<LibraryRecordUpdateInput>({
    status: "UNSET",
    rating: null,
    shortReview: "",
  });
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  const sourceOptions = Array.from(
    new Map(records.map((record) => [record.sourceKey, record.sourceLabel])).entries()
  ).map(([value, label]) => ({ value, label }));

  const filteredRecords = records
    .filter((record) => (category === "all" ? true : record.category === category))
    .filter((record) => (status === "all" ? true : record.status === status))
    .filter((record) => (source === "all" ? true : record.sourceKey === source))
    .filter((record) => {
      if (reviewFilter === "reviewed") {
        return Boolean(record.shortReview?.trim());
      }
      if (reviewFilter === "unreviewed") {
        return !record.shortReview?.trim();
      }
      return true;
    })
    .filter((record) => {
      if (!deferredQuery) {
        return true;
      }
      return [record.title, record.sourceLabel, record.platformLabel ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(deferredQuery);
    })
    .sort((left, right) => compareRecords(left, right, sortBy));

  const selectedRecord =
    filteredRecords.find((record) => buildRecordKey(record) === selectedKey) ?? filteredRecords[0] ?? null;

  useEffect(() => {
    if (!filteredRecords.length) {
      if (selectedKey !== null) {
        setSelectedKey(null);
      }
      return;
    }

    const recordStillVisible = filteredRecords.some((record) => buildRecordKey(record) === selectedKey);
    if (!recordStillVisible) {
      startTransition(() => {
        setSelectedKey(buildRecordKey(filteredRecords[0]));
      });
    }
  }, [filteredRecords, selectedKey]);

  useEffect(() => {
    if (!selectedRecord) {
      return;
    }
    setForm({
      status: selectedRecord.status,
      rating: selectedRecord.rating ?? null,
      shortReview: selectedRecord.shortReview ?? "",
    });
    setSaveMessage(null);
  }, [selectedRecord]);

  const overview = buildOverview(filteredRecords);

  const saveRecord = async () => {
    if (!selectedRecord) {
      return;
    }

    setSaveMessage(null);
    const updated = await updateRecord(selectedRecord.category, selectedRecord.id, {
      status: form.status,
      rating: form.rating == null ? null : Number(form.rating),
      shortReview: form.shortReview?.trim() ? form.shortReview.trim() : null,
    });

    if (updated) {
      setSaveMessage("已保存评分与短评");
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
      <section className="dash-card overflow-hidden">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-kicker">Library Desk</p>
            <h2 className="mt-3 text-3xl text-[var(--ink)] sm:text-4xl">记录库</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              这一页把电影和游戏合并成同一张桌面。左边负责找记录，右边负责补状态、
              评分和短评，让搜索、导入和首页统计之间真正形成闭环。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchRecords()}
            className="rounded-full border border-[var(--line)] bg-white/80 px-4 py-2 text-sm font-medium text-[var(--ink)] transition hover:bg-white"
          >
            {loading ? "刷新中..." : "刷新记录"}
          </button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <LibraryMetric label="当前结果" value={overview.total} caption="按当前筛选显示" />
          <LibraryMetric label="已评分" value={overview.rated} caption="带数值评分的条目" />
          <LibraryMetric label="有短评" value={overview.reviewed} caption="写过短评的条目" />
          <LibraryMetric label="已完成" value={overview.completed} caption="DONE 状态数量" />
        </div>

        <div className="mt-8 rounded-[28px] border border-[var(--line)] bg-white/70 p-5">
          <div className="grid gap-4 lg:grid-cols-[1.3fr_repeat(4,minmax(0,1fr))]">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]">
                Search
              </span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="按标题、来源、平台过滤"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              />
            </label>

            <FilterSelect
              label="类别"
              value={category}
              onChange={setCategory}
              options={[
                { value: "all", label: "全部" },
                { value: "movie", label: "电影" },
                { value: "game", label: "游戏" },
              ]}
            />

            <FilterSelect
              label="状态"
              value={status}
              onChange={setStatus}
              options={[{ value: "all", label: "全部" }, ...STATUS_OPTIONS.map((item) => ({ value: item.value, label: item.label }))]}
            />

            <FilterSelect
              label="来源"
              value={source}
              onChange={setSource}
              options={[{ value: "all", label: "全部来源" }, ...sourceOptions]}
            />

            <FilterSelect
              label="短评"
              value={reviewFilter}
              onChange={setReviewFilter}
              options={[
                { value: "all", label: "全部" },
                { value: "reviewed", label: "只看有短评" },
                { value: "unreviewed", label: "只看未写短评" },
              ]}
            />
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {[
                { value: "all", label: "全部" },
                { value: "movie", label: "电影" },
                { value: "game", label: "游戏" },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setCategory(item.value as CategoryFilter)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                    category === item.value
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[rgba(31,24,14,0.08)] text-[var(--ink)] hover:bg-white"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <FilterSelect
              label="排序"
              value={sortBy}
              onChange={setSortBy}
              options={SORT_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
              compact
            />
          </div>
        </div>

        {error ? (
          <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-8 space-y-4">
          {filteredRecords.length ? (
            filteredRecords.map((record) => {
              const active = buildRecordKey(record) === buildRecordKey(selectedRecord);
              return (
                <button
                  key={buildRecordKey(record)}
                  type="button"
                  onClick={() => {
                    setSaveMessage(null);
                    startTransition(() => {
                      setSelectedKey(buildRecordKey(record));
                    });
                  }}
                  className={`grid w-full gap-4 rounded-[28px] border px-4 py-4 text-left transition sm:grid-cols-[96px_1fr] ${
                    active
                      ? "border-[var(--accent)] bg-white shadow-[0_18px_48px_rgba(159,40,21,0.12)]"
                      : "border-[var(--line)] bg-white/75 hover:bg-white"
                  }`}
                >
                  <div className="h-28 overflow-hidden rounded-[22px] bg-[linear-gradient(135deg,#f1e1c5_0%,#f7f1e7_100%)]">
                    {record.posterUrl ? (
                      <img
                        src={record.posterUrl}
                        alt={record.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-end p-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]">
                        {record.category}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{record.category === "movie" ? "Movie" : "Game"}</Badge>
                      <Badge tone="muted">{record.sourceLabel}</Badge>
                      {record.platformLabel && record.category === "game" ? (
                        <Badge tone="muted">{record.platformLabel}</Badge>
                      ) : null}
                      <span className="text-xs text-[var(--muted)]">{formatStatus(record.status)}</span>
                    </div>
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-2xl text-[var(--ink)]">{record.title}</h3>
                        <p className="mt-2 text-sm text-[var(--muted)]">
                          {buildRecordMeta(record)}
                        </p>
                      </div>
                      <div className="rounded-[22px] bg-[rgba(217,72,47,0.08)] px-4 py-3 text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-deep)]">
                          Rating
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">
                          {record.rating == null ? "--" : `${record.rating}/10`}
                        </p>
                      </div>
                    </div>
                    <p className="mt-4 line-clamp-3 text-sm leading-6 text-[var(--muted)]">
                      {record.shortReview?.trim() || "还没有短评，点开右侧可以直接补内容。"}
                    </p>
                  </div>
                </button>
              );
            })
          ) : (
            <EmptyState loading={loading} />
          )}
        </div>
      </section>

      <aside className="dash-card xl:sticky xl:top-6 xl:self-start">
        <p className="section-kicker">Review Panel</p>
        <h2 className="mt-3 text-3xl text-[var(--ink)]">评分与短评</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          选中左侧任意记录后，可以直接改状态、打分和补一句短评。保存后主页统计会自动吃到这些数据。
        </p>

        {selectedRecord ? (
          <>
            <div className="mt-6 overflow-hidden rounded-[28px] border border-[var(--line)] bg-white/80">
              <div className="aspect-[4/3] bg-[linear-gradient(135deg,#f1e1c5_0%,#f7f1e7_100%)]">
                {selectedRecord.posterUrl ? (
                  <img
                    src={selectedRecord.posterUrl}
                    alt={selectedRecord.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-end p-5 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--accent-deep)]">
                    {selectedRecord.category}
                  </div>
                )}
              </div>
              <div className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{selectedRecord.category === "movie" ? "Movie" : "Game"}</Badge>
                  <Badge tone="muted">{selectedRecord.sourceLabel}</Badge>
                </div>
                <h3 className="mt-4 text-2xl text-[var(--ink)]">{selectedRecord.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  {buildRecordMeta(selectedRecord)}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]">
                  状态
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          status: item.value,
                        }))
                      }
                      className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                        form.status === item.value
                          ? "bg-[var(--accent)] text-white"
                          : "bg-[rgba(31,24,14,0.08)] text-[var(--ink)] hover:bg-white"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="rating-select"
                  className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]"
                >
                  评分
                </label>
                <div className="mt-3 flex gap-3">
                  <select
                    id="rating-select"
                    value={form.rating == null ? "" : form.rating}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        rating: event.target.value === "" ? null : Number(event.target.value),
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                  >
                    <option value="">暂不评分</option>
                    {Array.from({ length: 11 }, (_, index) => (
                      <option key={index} value={index}>
                        {index} / 10
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        rating: null,
                      }))
                    }
                    className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--ink)] transition hover:bg-[rgba(31,24,14,0.06)]"
                  >
                    清空
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="short-review"
                  className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]"
                >
                  短评
                </label>
                <textarea
                  id="short-review"
                  value={form.shortReview ?? ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      shortReview: event.target.value,
                    }))
                  }
                  rows={7}
                  maxLength={1000}
                  placeholder="写一句你为什么喜欢、失望，或者这条记录现在对你意味着什么。"
                  className="mt-3 w-full rounded-[24px] border border-slate-200 bg-white px-4 py-4 text-sm leading-6 text-slate-900 outline-none transition focus:border-slate-400"
                />
                <div className="mt-2 flex items-center justify-between text-xs text-[var(--muted)]">
                  <span>建议 1 到 3 句话，后续也方便扩展成长评。</span>
                  <span>{form.shortReview?.length ?? 0} / 1000</span>
                </div>
              </div>
            </div>

            {saveMessage ? (
              <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {saveMessage}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => void saveRecord()}
              disabled={saving}
              className="mt-6 w-full rounded-[24px] bg-[var(--accent)] px-5 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white shadow-[0_14px_32px_rgba(159,40,21,0.22)] transition hover:brightness-105 disabled:opacity-60"
            >
              {saving ? "保存中..." : "保存记录"}
            </button>
          </>
        ) : (
          <p className="mt-6 rounded-[24px] border border-dashed border-[var(--line)] px-4 py-5 text-sm leading-6 text-[var(--muted)]">
            当前筛选条件下还没有记录。你可以先去搜索页添加条目，或者放宽筛选条件。
          </p>
        )}
      </aside>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: any) => void;
  options: Array<{ value: string; label: string }>;
  compact?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 ${
          compact ? "mt-0 min-w-[140px]" : "mt-2 w-full"
        }`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function LibraryMetric({
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

function Badge({
  children,
  tone = "accent",
}: {
  children: string;
  tone?: "accent" | "muted";
}) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${
        tone === "accent"
          ? "bg-[var(--ink)] text-white"
          : "bg-[rgba(31,24,14,0.08)] text-[var(--ink)]"
      }`}
    >
      {children}
    </span>
  );
}

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <div className="rounded-[28px] border border-dashed border-[var(--line)] px-5 py-6 text-sm leading-6 text-[var(--muted)]">
      {loading
        ? "记录库加载中..."
        : "当前没有匹配的记录。你可以调整筛选条件，或先从搜索页加入内容。"}
    </div>
  );
}

function buildOverview(records: LibraryRecord[]) {
  return {
    total: records.length,
    rated: records.filter((record) => record.rating != null).length,
    reviewed: records.filter((record) => Boolean(record.shortReview?.trim())).length,
    completed: records.filter((record) => record.status === "DONE").length,
  };
}

function compareRecords(left: LibraryRecord, right: LibraryRecord, sortBy: SortValue) {
  if (sortBy === "rating") {
    return (right.rating ?? -1) - (left.rating ?? -1) || compareByRecent(left, right);
  }
  if (sortBy === "title") {
    return left.title.localeCompare(right.title, "zh-CN") || compareByRecent(left, right);
  }
  return compareByRecent(left, right);
}

function compareByRecent(left: LibraryRecord, right: LibraryRecord) {
  return toTimestamp(right.updatedAt ?? right.createdAt) - toTimestamp(left.updatedAt ?? left.createdAt);
}

function buildRecordKey(record: LibraryRecord | null): SelectedRecordKey {
  return `${record?.category ?? "movie"}:${record?.id ?? 0}`;
}

function buildRecordMeta(record: LibraryRecord) {
  const parts = [record.sourceLabel, formatStatus(record.status), formatDate(record.updatedAt ?? record.createdAt)];

  if (record.category === "game" && record.platformLabel) {
    parts.unshift(record.platformLabel);
  }
  if (record.playtimeMinutes && record.playtimeMinutes > 0) {
    parts.push(`${Math.round(record.playtimeMinutes / 60)} 小时游玩`);
  }
  if (
    record.category === "game" &&
    record.achievementTotal != null &&
    record.achievementUnlocked != null &&
    record.achievementTotal > 0
  ) {
    parts.push(`${record.achievementUnlocked}/${record.achievementTotal} 成就`);
  }

  return parts.join(" · ");
}

function formatStatus(status: RecordStatus) {
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

function formatDate(value?: string | null) {
  if (!value) {
    return "未知时间";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未知时间";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function toTimestamp(value?: string | null) {
  if (!value) {
    return 0;
  }
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}
