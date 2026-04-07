import { NavLink, Outlet } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Home" },
  { to: "/movies/search", label: "Movie Search" },
  { to: "/games/search", label: "Game Search" },
  { to: "/library", label: "Library" },
];

export default function AppShell() {
  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="paper-panel relative overflow-hidden rounded-[36px] px-6 py-6 sm:px-8">
          <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_center,_rgba(217,72,47,0.18),_transparent_62%)] lg:block" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="section-kicker">PixelReel Command Deck</p>
              <h1 className="mt-3 max-w-2xl text-4xl text-[var(--ink)] sm:text-5xl">
                把电影和游戏记录，收成一张属于自己的总览首页。
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">
                首页现在作为个人主页入口，负责展示总量、状态分布、平台来源和最近新增。
                下面的路由把搜索、记录和后续扩展区分开，后面接多用户时不用重拆结构。
              </p>
            </div>
            <nav className="flex flex-wrap gap-2">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    `rounded-full px-4 py-2 text-sm font-medium transition ${
                      isActive
                        ? "bg-[var(--accent)] text-white shadow-[0_10px_24px_rgba(159,40,21,0.24)]"
                        : "bg-white/70 text-[var(--ink)] hover:bg-white"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>

        <main className="pt-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
