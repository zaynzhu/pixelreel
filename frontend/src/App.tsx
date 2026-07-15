import { lazy, Suspense, useEffect } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import AppShell from "./components/AppShell"
import { useAuthStore } from "./stores/authStore"
import { useI18nStore } from "./stores/i18nStore"

const GameSearch = lazy(() => import("./components/GameSearch"))
const MovieSearch = lazy(() => import("./components/MovieSearch"))
const TvShowSearch = lazy(() => import("./components/TvShowSearch"))
const DashboardPage = lazy(() => import("./pages/DashboardPage"))
const LibraryPage = lazy(() => import("./pages/LibraryPage"))
const LibraryDetailPage = lazy(() => import("./pages/LibraryDetailPage"))
const TimelinePage = lazy(() => import("./pages/TimelinePage"))
const LoginPage = lazy(() => import("./pages/LoginPage"))
const SettingsPage = lazy(() => import("./pages/SettingsPage"))
const ActivityPage = lazy(() =>
  import("./pages/ActivityPage").then(({ ActivityPage }) => ({ default: ActivityPage }))
)
const ShowcasePage = lazy(() => import("./pages/ShowcasePage"))
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"))
const RadarPage = lazy(() => import("./pages/RadarPage"))
const PopularPage = lazy(() => import("./pages/PopularPage"))
const ToolsPage = lazy(() => import("./pages/ToolsPage"))
const DataHealthPage = lazy(() => import("./pages/DataHealthPage"))
const SyncPage = lazy(() => import("./pages/SyncPage"))
const ImportReviewPage = lazy(() => import("./pages/ImportReviewPage"))

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const initialized = useAuthStore((s) => s.initialized)
  const initializationError = useAuthStore((s) => s.initializationError)
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)
  if (!initialized || initializationError) {
    return <AuthInitializationState loading={!initialized} error={initializationError} />
  }
  if (!isLoggedIn) return <Navigate to="/login" replace />
  return <>{children}</>
}

function LoginRoute() {
  const initialized = useAuthStore((s) => s.initialized)
  const initializationError = useAuthStore((s) => s.initializationError)
  const authRequired = useAuthStore((s) => s.authRequired)
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)

  if (!initialized || initializationError) {
    return <AuthInitializationState loading={!initialized} error={initializationError} />
  }
  if (!authRequired || isLoggedIn) return <Navigate to="/" replace />
  return <LoginPage />
}

function AuthInitializationState({ loading, error }: { loading: boolean; error: string | null }) {
  const initialize = useAuthStore((s) => s.initialize)
  const { lang, toggleLang, t } = useI18nStore()

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: "var(--page-bg)" }}>
      <button type="button" onClick={toggleLang} className="brutal-btn absolute right-4 top-4">
        {lang === "en" ? "中文" : "EN"}
      </button>
      <div className="dash-card w-full max-w-lg" role={error ? "alert" : "status"}>
        <div className="absolute left-0 top-0 h-2 w-2 border-l-2 border-t-2 border-[var(--accent-deep)]" />
        <div className="absolute bottom-0 right-0 h-2 w-2 border-b-2 border-r-2 border-[var(--accent-deep)]" />
        <span className="section-kicker">{error ? t("auth.unavailable_kicker") : t("auth.loading_kicker")}</span>
        <h1 className="font-display mt-2 text-3xl text-white">
          {error ? t("auth.unavailable_title") : t("auth.loading_title")}
        </h1>
        <p className="mt-4 text-xs leading-6 text-[var(--muted)]">
          {error ? t("auth.unavailable_desc") : t("auth.loading_desc")}
        </p>
        {error && <p className="mt-4 border-l-2 border-red-500 pl-3 font-mono text-[10px] text-red-300">{error}</p>}
        {error && (
          <button type="button" onClick={() => void initialize()} disabled={loading} className="brutal-btn-accent mt-6 w-full">
            {loading ? t("auth.retrying") : t("auth.retry")}
          </button>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const initializeAuth = useAuthStore((s) => s.initialize)

  useEffect(() => {
    void initializeAuth()
  }, [initializeAuth])

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={<div className="p-6 text-xs text-[var(--muted)]">LOADING...</div>}>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="movies/search" element={<MovieSearch />} />
            <Route path="games/search" element={<GameSearch />} />
            <Route path="tv-shows/search" element={<TvShowSearch />} />
            <Route path="library" element={<LibraryPage />} />
            <Route path="library/:category/:id" element={<LibraryDetailPage />} />
            <Route path="timeline" element={<TimelinePage />} />
            <Route path="activity" element={<ActivityPage />} />
            <Route path="showcase" element={<ShowcasePage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="radar" element={<RadarPage />} />
            <Route path="popular" element={<PopularPage />} />
            <Route path="tools" element={<ToolsPage />} />
            <Route path="data-health" element={<DataHealthPage />} />
            <Route path="sync" element={<SyncPage />} />
            <Route path="sync/review" element={<ImportReviewPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
