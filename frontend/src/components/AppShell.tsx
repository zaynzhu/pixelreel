import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useI18nStore } from "../stores/i18nStore";
import { useTaskStore } from "../stores/taskStore";
import RightActionDrawer from "./RightActionDrawer";
import TaskPanel from "./TaskPanel";
import { ToastContainer, ConfirmDialog } from "./Toast";
import { startPolling, stopPolling } from "../stores/taskStore";

export default function AppShell() {
  const [taskPanelOpen, setTaskPanelOpen] = useState(false);
  const logout = useAuthStore((s) => s.logout);
  const authRequired = useAuthStore((s) => s.authRequired)
  const { lang, toggleLang, t } = useI18nStore();
  const runningTasks = useTaskStore((s) => s.tasks.filter((t) => t.status === 'running').length);
  const closeTaskPanel = useCallback(() => setTaskPanelOpen(false), []);

  useEffect(() => {
    startPolling()
    return stopPolling
  }, [])

  const NAV_ITEMS = [
    { to: "/", label: t("nav.overview") },
    { to: "/movies/search", label: t("nav.movies") },
    { to: "/games/search", label: t("nav.games") },
    { to: "/tv-shows/search", label: t("nav.tv") },
    { to: "/library", label: t("nav.library") },
    { to: "/timeline", label: t("timeline.title") },
    { to: "/activity", label: t("nav.activity") },
    { to: "/showcase", label: t("nav.showcase") },
    { to: "/radar", label: t("nav.radar") },
    { to: "/popular", label: t("nav.popular") },
    { to: "/analytics", label: t("nav.analytics") },
    { to: "/tools", label: t("nav.tools") },
    { to: "/settings", label: t("nav.settings") },
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
                  type="button"
                  onClick={() => setTaskPanelOpen(true)}
                  aria-haspopup="dialog"
                  aria-expanded={taskPanelOpen}
                  aria-controls="task-panel"
                  className="brutal-btn relative"
                >
                  TASKS
                  {runningTasks > 0 && (
                    <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent-deep)] text-[10px] font-bold text-white">
                      {runningTasks}
                    </span>
                  )}
                </button>
                {authRequired && (
                  <button
                    onClick={logout}
                    className="brutal-btn"
                  >
                    {t("nav.terminate")}
                  </button>
                )}
              </div>
              <nav className="command-nav" aria-label="Primary navigation">
                {NAV_ITEMS.map((item, index) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      `command-nav-item ${isActive ? "command-nav-item-active" : ""}`
                    }
                  >
                    <span className="command-nav-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="command-nav-label">{item.label}</span>
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>
        </header>

        <main className="pt-6">
          <Outlet />
        </main>

        <RightActionDrawer />
        <TaskPanel open={taskPanelOpen} onClose={closeTaskPanel} />
        <ToastContainer />
        <ConfirmDialog />
      </div>
    </div>
  );
}
