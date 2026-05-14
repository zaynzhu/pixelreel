import { NavLink, Outlet } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useI18nStore } from "../stores/i18nStore";

export default function AppShell() {
  const logout = useAuthStore((s) => s.logout);
  const { lang, toggleLang, t } = useI18nStore();

  const NAV_ITEMS = [
    { to: "/", label: t("nav.overview") },
    { to: "/movies/search", label: t("nav.movies") },
    { to: "/games/search", label: t("nav.games") },
    { to: "/tv-shows/search", label: t("nav.tv") },
    { to: "/library", label: t("nav.library") },
    { to: "/timeline", label: t("timeline.title") },
  ];

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="relative overflow-hidden border border-[var(--line)] bg-[var(--surface)] px-6 py-8 sm:px-8">
          <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_center,_rgba(212,255,0,0.05),_transparent_70%)] lg:block" />
          
          <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[var(--accent)]" />
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-[var(--accent)]" />

          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <span className="section-kicker">{t("nav.system")}</span>
              <h1 className="mt-2 max-w-2xl text-4xl text-white sm:text-5xl hover-glitch whitespace-pre-wrap">
                {t("nav.title")}
              </h1>
              <p className="mt-4 max-w-2xl text-xs leading-6 text-[var(--muted)] sm:text-sm whitespace-pre-wrap">
                {t("nav.desc")}
              </p>
            </div>
            
            <div className="flex flex-col items-end gap-4">
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-[var(--accent)] uppercase tracking-widest animate-pulse">
                  ● {t("nav.live")}
                </span>
                <button
                  onClick={toggleLang}
                  className="brutal-btn"
                >
                  {lang === "en" ? "中文" : "EN"}
                </button>
                <button
                  onClick={logout}
                  className="brutal-btn"
                >
                  {t("nav.terminate")}
                </button>
              </div>
              <nav className="flex flex-wrap items-center gap-2">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      `px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${
                        isActive
                          ? "bg-[var(--accent)] text-black shadow-[0_0_15px_rgba(212,255,0,0.3)]"
                          : "border border-[var(--line)] bg-[var(--surface-hover)] text-[var(--muted)] hover:text-white hover:border-white"
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>
        </header>

        <main className="pt-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}