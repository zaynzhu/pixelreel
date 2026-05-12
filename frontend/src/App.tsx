import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import GameSearch from "./components/GameSearch";
import MovieSearch from "./components/MovieSearch";
import TvShowSearch from "./components/TvShowSearch";
import AppShell from "./components/AppShell";
import DashboardPage from "./pages/DashboardPage";
import LibraryPage from "./pages/LibraryPage";
import LoginPage from "./pages/LoginPage";
import { useAuthStore } from "./stores/authStore";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
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
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}