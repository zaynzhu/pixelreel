import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import GameSearch from "./components/GameSearch";
import MovieSearch from "./components/MovieSearch";
import AppShell from "./components/AppShell";
import DashboardPage from "./pages/DashboardPage";
import LibraryPage from "./pages/LibraryPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="movies/search" element={<MovieSearch />} />
          <Route path="games/search" element={<GameSearch />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
