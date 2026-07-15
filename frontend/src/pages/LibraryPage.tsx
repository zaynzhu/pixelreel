import { startTransition, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLibraryStore } from "../stores/libraryStore";
import { useI18nStore } from "../stores/i18nStore";
import { StarRating } from "../components/StarRating";
import { ImgWithFallback } from "../components/ImgWithFallback";
import { ArrowUpRight, ChevronDown, RotateCw } from "lucide-react";
import RescrapeModal from "../components/RescrapeModal";
import ActivityTimeline from "../components/ActivityTimeline";
import type {
  LibraryCategory,
  LibraryRecord,
  LibraryRecordUpdateInput,
  LibraryReviewFilter,
  LibrarySort,
  LibrarySourceFilter,
  RecordStatus,
} from "../types/library";

type CategoryFilter = "all" | LibraryCategory;
type SelectedRecordKey = `${LibraryCategory}:${number}`;

export default function LibraryPage() {
  const { records, loading, loadingMore, saving, error, fetchRecords, fetchMore, updateRecord, nextCursor, totals } = useLibraryStore();
  const { t } = useI18nStore();
  
  const STATUS_OPTIONS: Array<{ value: RecordStatus; label: string }> = [
    { value: "UNSET", label: t("global.status.unset") },
    { value: "WANT", label: t("global.status.want") },
    { value: "IN_PROGRESS", label: t("global.status.active") },
    { value: "DONE", label: t("global.status.done") },
    { value: "DROPPED", label: t("global.status.dropped") },
  ];

  const SORT_OPTIONS = [
    { value: "recent", label: t("global.sort.latest") },
    { value: "rating", label: t("global.sort.rating") },
  ] as const;

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [status, setStatus] = useState<"all" | RecordStatus>("all");
  const [source, setSource] = useState<LibrarySourceFilter>("all");
  const [reviewFilter, setReviewFilter] = useState<LibraryReviewFilter>("all");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sortBy, setSortBy] = useState<LibrarySort>("recent");
  const [selectedKey, setSelectedKey] = useState<SelectedRecordKey | null>(null);
  const [form, setForm] = useState<LibraryRecordUpdateInput>({
    status: "UNSET",
    rating: null,
    shortReview: "",
  });
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [rescrapeRecord, setRescrapeRecord] = useState<LibraryRecord | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setSource("all");
  }, [category]);

  useEffect(() => {
    void fetchRecords({
      category,
      status,
      query: debouncedQuery,
      source,
      review: reviewFilter,
      sort: sortBy,
    });
  }, [category, debouncedQuery, fetchRecords, reviewFilter, sortBy, source, status]);

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !nextCursor) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && nextCursor && !loadingMore) {
          void fetchMore();
        }
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [nextCursor, loadingMore, fetchMore]);

  const sourceOptions = buildSourceOptions(category, t);

  const filteredRecords = records;

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

  const overview = totals;

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
      setSaveMessage(t("lib.edit.success"));
      await fetchRecords();
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
      <section className="dash-card overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[var(--accent)]" />
        
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-kicker">{t("lib.kicker")}</p>
            <h2 className="font-display mt-2 text-3xl text-white sm:text-4xl">{t("lib.title")}</h2>
            <p className="mt-3 max-w-2xl text-xs leading-6 text-[var(--muted)] uppercase">
              {t("lib.desc")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchRecords()}
            className="brutal-btn"
          >
            {loading ? t("lib.fetching") : t("lib.query")}
          </button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <LibraryMetric label={t("lib.met.results")} value={overview.total} caption={t("lib.met.results_cap")} />
          <LibraryMetric label={t("lib.met.rated")} value={overview.rated} caption={t("lib.met.rated_cap")} />
          <LibraryMetric label={t("lib.met.reviewed")} value={overview.reviewed} caption={t("lib.met.reviewed_cap")} />
          <LibraryMetric label={t("lib.met.done")} value={overview.completed} caption={t("lib.met.done_cap")} />
        </div>

        <div className="library-filter-panel mt-8">
          <div className="absolute top-0 right-0 w-10 h-1 bg-[var(--accent)] opacity-70 shadow-[0_0_16px_rgba(212,255,0,0.45)]" />
          <div className="absolute bottom-0 left-0 h-px w-24 bg-gradient-to-r from-[var(--accent)]/45 to-transparent" />
          <div className="grid gap-4 lg:grid-cols-[1.3fr_repeat(4,minmax(0,1fr))]">
            <label className="block">
              <span className="library-control-label">
                {t("lib.search.param")}
              </span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("lib.search.placeholder")}
                className="tech-input cyber-field mt-2"
              />
            </label>

            <FilterSelect
              label={t("lib.search.cat")}
              value={category}
              onChange={setCategory}
              options={[
                { value: "all", label: t("lib.search.all") },
                { value: "movie", label: t("global.cat.mov") },
                { value: "game", label: t("global.cat.gam") },
                { value: "tv_show", label: t("global.cat.tvs") },
              ]}
            />

            <FilterSelect
              label={t("lib.search.status")}
              value={status}
              onChange={setStatus}
              options={[{ value: "all", label: t("lib.search.all") }, ...STATUS_OPTIONS]}
            />

            <FilterSelect
              label={t("lib.search.source")}
              value={source}
              onChange={setSource}
              options={[{ value: "all", label: t("lib.search.all") }, ...sourceOptions]}
            />

            <FilterSelect
              label={t("lib.search.log")}
              value={reviewFilter}
              onChange={setReviewFilter}
              options={[
                { value: "all", label: t("lib.search.all") },
                { value: "reviewed", label: t("lib.search.has_log") },
                { value: "unreviewed", label: t("lib.search.null_log") },
              ]}
            />
          </div>

          <div className="mt-6 flex flex-col gap-4 border-t border-[var(--line)] pt-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {[
                { value: "all", label: t("lib.search.all") },
                { value: "movie", label: t("global.cat.mov") },
                { value: "game", label: t("global.cat.gam") },
                { value: "tv_show", label: t("global.cat.tvs") },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setCategory(item.value as CategoryFilter)}
                  className={category === item.value ? "cyber-tab cyber-tab-active" : "cyber-tab"}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <FilterSelect
              label={t("lib.search.order")}
              value={sortBy}
              onChange={setSortBy}
              options={[...SORT_OPTIONS]}
              compact
            />
          </div>
        </div>

        {error ? (
          <div className="mt-5 border-l-4 border-red-500 bg-red-500/10 px-4 py-3 text-xs text-red-400 font-bold uppercase">
            [ERR] {error}
          </div>
        ) : null}

        <div className="mt-8 space-y-4">
          {filteredRecords.length ? (
            filteredRecords.map((record) => {
              const active = buildRecordKey(record) === buildRecordKey(selectedRecord);
              return (
                <div key={buildRecordKey(record)} className="group relative">
                  <button
                    type="button"
                    onClick={() => {
                      setSaveMessage(null);
                      startTransition(() => {
                        setSelectedKey(buildRecordKey(record));
                      });
                    }}
                    className={`relative grid w-full gap-4 border px-4 py-4 text-left transition-all sm:grid-cols-[80px_1fr] ${
                      active
                        ? "border-[var(--accent)] bg-[#1a1a1a]"
                        : "border-[var(--line)] bg-[var(--surface-hover)] hover:border-white"
                    }`}
                  >
                    {active && (
                      <div className="absolute top-0 bottom-0 left-0 w-1 bg-[var(--accent)]" />
                    )}
                    <div className="h-28 overflow-hidden bg-[#0a0a0a] border border-[var(--line)]">
                      {record.posterUrl ? (
                        <ImgWithFallback
                          src={record.posterUrl}
                          alt={record.title}
                          className={`h-full w-full object-cover transition-all duration-300 ${active ? 'opacity-100 mix-blend-normal' : 'opacity-60 mix-blend-luminosity group-hover:opacity-100 group-hover:mix-blend-normal'}`}
                          fallback={
                            <div className="flex h-full w-full items-center justify-center bg-[#0a0a0a] relative overflow-hidden">
                              <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)', backgroundSize: '12px 12px' }} />
                              <span className="text-xl font-display font-bold opacity-15 text-[var(--accent)]">{record.title.charAt(0).toUpperCase()}</span>
                            </div>
                          }
                        />
                      ) : (
                          <div className="flex h-full w-full items-center justify-center bg-[#0a0a0a] relative overflow-hidden">
                            <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)', backgroundSize: '12px 12px' }} />
                            <span className="text-xl font-display font-bold opacity-15 text-[var(--accent)]">{record.title.charAt(0).toUpperCase()}</span>
                          </div>
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="accent">{categoryLabel(record.category, t)}</Badge>
                        <Badge tone="muted">{record.sourceLabel}</Badge>
                        {record.platformLabel && record.category === "game" ? (
                          <Badge tone="muted">{record.platformLabel}</Badge>
                        ) : null}
                        {!(record.category === 'game' && record.status === 'WANT' && record.playtimeMinutes && record.playtimeMinutes > 0) && (
                          <span className="text-[10px] text-[var(--accent)] uppercase font-bold">[{formatStatus(record.status, t)}]</span>
                        )}
                      </div>
                      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="font-display text-xl text-white uppercase">{record.title}</h3>
                          <p className="mt-1 text-[10px] text-[var(--muted)] uppercase tracking-widest">
                            {buildRecordMeta(record, t)}
                          </p>
                        </div>
                        <div className="border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-right">
                          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                            {t("lib.list.metric")}
                          </p>
                          <p className="font-display mt-1 text-xl text-white">
                            {record.rating == null ? t("dash.null") : <StarRating value={record.rating} />}
                          </p>
                        </div>
                      </div>
                      <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-[var(--muted)] uppercase">
                        {record.shortReview?.trim() || t("lib.list.no_log")}
                      </p>
                    </div>
                  </button>
                  <Link
                    to={`/library/${record.category}/${record.id}`}
                    className="absolute top-2 right-12 z-10 border border-[var(--line)] bg-[var(--surface)] p-2 text-[var(--muted)] opacity-0 transition-opacity hover:border-[var(--accent)] hover:text-[var(--accent)] group-hover:opacity-100"
                    title={t("detail.open")}
                    aria-label={t("detail.open")}
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setRescrapeRecord(record)}
                    className="absolute top-2 right-2 p-2 bg-[var(--surface)] border border-[var(--line)] opacity-0 group-hover:opacity-100 transition-opacity hover:border-[var(--accent)] hover:text-[var(--accent)] z-10"
                    title={t("lib.rescrape.btn")}
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          ) : (
            <EmptyState loading={loading} t={t} />
          )}

          {/* 无限滚动哨兵 */}
          {nextCursor && (
            <div ref={sentinelRef} className="h-1" />
          )}
          {loadingMore && (
            <div className="text-center text-[10px] text-[var(--muted)] uppercase tracking-widest py-8">
              LOADING_MORE...
            </div>
          )}
        </div>
      </section>

      <aside className="dash-card xl:sticky xl:top-6 xl:self-start border-t-4 border-t-[var(--accent)]">
        <p className="section-kicker">{t("lib.edit.kicker")}</p>
        <h2 className="font-display mt-2 text-2xl text-white">{t("lib.edit.title")}</h2>
        
        {selectedRecord ? (
          <>
            <div className="mt-6 border border-[var(--line)] bg-[#0a0a0a] relative overflow-hidden group">
              <div className="aspect-[4/3] bg-black">
                {selectedRecord.posterUrl ? (
                  <ImgWithFallback
                    src={selectedRecord.posterUrl}
                    alt={selectedRecord.title}
                    className="h-full w-full object-cover opacity-80 mix-blend-luminosity transition-all group-hover:opacity-100 group-hover:mix-blend-normal"
                    fallback={
                      <div className="flex h-full w-full items-center justify-center bg-[#0a0a0a] relative overflow-hidden">
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)', backgroundSize: '12px 12px' }} />
                        <span className="text-3xl font-display font-bold opacity-15 text-[var(--accent)]">{selectedRecord.title.charAt(0).toUpperCase()}</span>
                      </div>
                    }
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[#0a0a0a] relative overflow-hidden">
                    <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)', backgroundSize: '12px 12px' }} />
                    <span className="text-3xl font-display font-bold opacity-15 text-[var(--accent)]">{selectedRecord.title.charAt(0).toUpperCase()}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] pointer-events-none opacity-50" />
              </div>
              <div className="p-4 border-t border-[var(--line)] bg-[var(--surface)]">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent">{categoryLabel(selectedRecord.category, t)}</Badge>
                  <Badge tone="muted">{selectedRecord.sourceLabel}</Badge>
                </div>
                <h3 className="font-display mt-3 text-xl text-white uppercase">{selectedRecord.title}</h3>
                <p className="mt-1 text-[10px] text-[var(--muted)] uppercase tracking-widest">
                  {buildRecordMeta(selectedRecord, t)}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-6">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--muted)] block mb-3">
                  {t("lib.edit.status_flag")}
                </label>
                <div className="flex flex-wrap gap-2">
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
                      className={form.status === item.value ? "brutal-btn-accent" : "brutal-btn"}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="rating-select"
                  className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--muted)] block mb-3"
                >
                  {t("lib.edit.eval_metric")}
                </label>
                <div className="flex gap-2">
                  <select
                    id="rating-select"
                    value={form.rating == null ? "" : form.rating}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        rating: event.target.value === "" ? null : Number(event.target.value),
                      }))
                    }
                    className="tech-input"
                  >
                    <option value="">{t("dash.null")}</option>
                    {Array.from({ length: 5 }, (_, index) => (
                      <option key={index + 1} value={index + 1}>
                        {"★".repeat(index + 1)}{"☆".repeat(5 - index - 1)}
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
                    className="brutal-btn"
                  >
                    {t("lib.edit.clr")}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="short-review"
                  className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--muted)] block mb-3"
                >
                  {t("lib.edit.sys_log")}
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
                  rows={6}
                  maxLength={1000}
                  placeholder={t("lib.edit.log_placeholder")}
                  className="tech-input"
                />
                <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--muted)] uppercase font-bold">
                  <span>{t("lib.edit.buffer")}</span>
                  <span className={form.shortReview?.length && form.shortReview.length > 900 ? "text-[var(--accent-deep)]" : ""}>{form.shortReview?.length ?? 0}/1000</span>
                </div>
              </div>
            </div>

            {saveMessage ? (
              <div className="mt-6 border-l-4 border-[var(--accent)] bg-[var(--accent)]/10 px-4 py-3 text-xs text-[var(--accent)] font-bold uppercase">
                [SYS] {saveMessage}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void saveRecord()}
              disabled={saving}
              className="mt-6 w-full brutal-btn-accent py-4"
            >
              {saving ? t("lib.edit.committing") : t("lib.edit.commit")}
            </button>

            {/* 变更历史 */}
            <div className="mt-6 border-t border-[var(--line)] pt-4">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="text-xs text-[var(--accent)] border border-[var(--accent)]/30 px-3 py-1.5 hover:bg-[var(--accent)]/10 transition-colors uppercase tracking-wider"
              >
                {showHistory ? '收起历史' : '变更历史'}
              </button>
              {showHistory && selectedRecord && (
                <div className="mt-3 border border-[var(--line)] max-h-[300px] overflow-y-auto">
                  <ActivityTimeline
                    entityType={selectedRecord.category === 'tv_show' ? 'TV_SHOW' : selectedRecord.category.toUpperCase()}
                    entityId={String(selectedRecord.id)}
                    compact
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="mt-6 border border-dashed border-[var(--line)] px-4 py-8 text-[10px] uppercase tracking-widest text-[var(--muted)] flex items-center justify-center text-center whitespace-pre-line leading-relaxed">
            {t("lib.edit.waiting")}
          </div>
        )}
      </aside>

      {/* 重新刮削弹窗 */}
      {rescrapeRecord && (
        <RescrapeModal
          record={rescrapeRecord}
          onClose={() => setRescrapeRecord(null)}
          onUpdated={() => {
            void fetchRecords()
            setRescrapeRecord(null)
          }}
        />
      )}
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
      <span className="library-control-label mb-2">
        {label}
      </span>
      <div className={`cyber-select-frame ${compact ? "min-w-[160px]" : ""}`}>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="cyber-select"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} className="bg-[var(--surface)]">
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--accent)]" />
      </div>
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
    <div className="border border-[var(--line)] bg-[var(--surface-hover)] p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">{label}</p>
      <p className="font-display mt-2 text-3xl text-white">{value}</p>
      <p className="mt-2 text-[10px] uppercase text-[var(--muted)] tracking-widest">{caption}</p>
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
      className={tone === "accent" ? "neo-badge-accent" : "neo-badge text-[var(--muted)]"}
    >
      {children}
    </span>
  );
}

function EmptyState({ loading, t }: { loading: boolean, t: any }) {
  return (
    <div className="border border-dashed border-[var(--line)] px-5 py-8 text-[10px] uppercase tracking-widest leading-relaxed text-[var(--muted)] text-center">
      {loading
        ? t("lib.list.executing")
        : t("lib.list.zero")}
    </div>
  );
}

function buildSourceOptions(category: CategoryFilter, t: any) {
  const mediaOptions = [
    { value: "douban", label: t("global.source.douban") },
    { value: "tmdb", label: "TMDB" },
    { value: "imdb", label: "IMDb" },
    { value: "trakt", label: "Trakt" },
  ];
  const gameOptions = [
    { value: "steam", label: "Steam" },
    { value: "rawg", label: "RAWG" },
    { value: "xbox", label: "Xbox" },
    { value: "psn", label: "PSN" },
  ];
  const options = category === "game"
    ? gameOptions
    : category === "movie" || category === "tv_show"
      ? mediaOptions
      : [...mediaOptions, ...gameOptions];
  return [...options, { value: "manual", label: t("global.source.manual") }];
}

function buildRecordKey(record: LibraryRecord | null): SelectedRecordKey {
  return `${record?.category ?? "movie"}:${record?.id ?? 0}`;
}

function buildRecordMeta(record: LibraryRecord, t: any) {
  const showStatus = !(record.category === 'game' && record.status === 'WANT' && record.playtimeMinutes && record.playtimeMinutes > 0);
  const parts = [record.sourceLabel, showStatus ? formatStatus(record.status, t) : null, formatDate(record.updatedAt ?? record.createdAt)].filter(Boolean);

  if (record.category === "game" && record.platformLabel) {
    parts.unshift(record.platformLabel);
  }
  if (record.playtimeMinutes && record.playtimeMinutes > 0) {
    parts.push(`${Math.round(record.playtimeMinutes / 60)}${t("lib.list.hr")}`);
  }
  if (
    record.category === "game" &&
    record.achievementTotal != null &&
    record.achievementUnlocked != null &&
    record.achievementTotal > 0
  ) {
    parts.push(`${record.achievementUnlocked}/${record.achievementTotal} ${t("lib.list.ach")}`);
  }

  return parts.join(" // ");
}

function formatStatus(status: RecordStatus, t: any) {
  switch (status) {
    case "WANT": return t("global.status.want");
    case "IN_PROGRESS": return t("global.status.active");
    case "DONE": return t("global.status.done");
    case "DROPPED": return t("global.status.dropped");
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

function formatDate(value?: string | null) {
  if (!value) {
    return "NULL_DATE";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "NULL_DATE";
  }
  return date.toISOString().split('T')[0];
}
