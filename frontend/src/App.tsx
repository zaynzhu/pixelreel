import { lazy, Suspense } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import AppShell from "./components/AppShell"
import { useAuthStore } from "./stores/authStore"

const GameSearch = lazy(() => import("./components/GameSearch"))
const MovieSearch = lazy(() => import("./components/MovieSearch"))
const TvShowSearch = lazy(() => import("./components/TvShowSearch"))
const DashboardPage = lazy(() => import("./pages/DashboardPage"))
const LibraryPage = lazy(() => import("./pages/LibraryPage"))
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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)
  if (!isLoggedIn) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="p-6 text-xs text-[var(--muted)]">LOADING...</div>}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
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
            <Route path="timeline" element={<TimelinePage />} />
            <Route path="activity" element={<ActivityPage />} />
            <Route path="showcase" element={<ShowcasePage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="radar" element={<RadarPage />} />
            <Route path="popular" element={<PopularPage />} />
            <Route path="tools" element={<ToolsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
