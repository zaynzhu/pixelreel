export default function LibraryPage() {
  return (
    <section className="dash-card">
      <p className="section-kicker">Library</p>
      <h2 className="mt-3 text-3xl text-[var(--ink)]">记录库页面骨架</h2>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)]">
        这个路由先占位，下一步可以直接扩展成电影 / 游戏混合列表、筛选器、排序和分页。
        当前主页统计已经有总览数据，后续这里适合承接完整记录管理。
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <PlaceholderBlock title="筛选器" description="状态、平台、评分区间、是否带短评。" />
        <PlaceholderBlock title="列表视图" description="按最近新增、评分最高、完成时间排序。" />
        <PlaceholderBlock title="批量动作" description="批量改状态、补评分、补封面或删除。" />
      </div>
    </section>
  );
}

function PlaceholderBlock({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[24px] border border-[var(--line)] bg-white/75 p-5">
      <h3 className="text-xl text-[var(--ink)]">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{description}</p>
    </div>
  );
}
