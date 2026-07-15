import { lazy, Suspense, useEffect } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import AppShell from "./components/AppShell"
import { useAuthStore } from "./stores/authStore"

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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const initialized = useAuthStore((s) => s.initialized)
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)
  if (!initialized) return <div className="p-6 text-xs text-[var(--muted)]">LOADING...</div>
  if (!isLoggedIn) return <Navigate to="/login" replace />
  return <>{children}</>
}

function LoginRoute() {
  const initialized = useAuthStore((s) => s.initialized)
  const authRequired = useAuthStore((s) => s.authRequired)
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)

  if (!initialized) return <div className="p-6 text-xs text-[var(--muted)]">LOADING...</div>
  if (!authRequired || isLoggedIn) return <Navigate to="/" replace />
  return <LoginPage />
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
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
