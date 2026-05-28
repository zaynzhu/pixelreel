<div align="center">

# 🎬 PixelReel

**Personal Media Tracking Platform — Movies, TV Shows & Games Unified**

[中文](README.md) | [English](README_EN.md)

</div>

<div align="center">

![License](https://img.shields.io/github/license/zaynzhu/pixelreel?style=for-the-badge)
![Stars](https://img.shields.io/github/stars/zaynzhu/pixelreel?style=for-the-badge)
![Forks](https://img.shields.io/github/forks/zaynzhu/pixelreel?style=for-the-badge)
![Issues](https://img.shields.io/github/issues/zaynzhu/pixelreel?style=for-the-badge)
![Last Commit](https://img.shields.io/github/last-commit/zaynzhu/pixelreel?style=for-the-badge)

</div>

---

> [!TIP]
> PixelReel is a self-hosted personal media tracking platform that unifies movies, TV shows, and games in one place.
> Import data from Douban, Trakt, Steam, Xbox, and PSN. Aggregate metadata from TMDB, OMDb, RAWG, and more.
> Enjoy rich visualizations including timelines, analytics dashboards, and showcase displays.

## ✨ Features

- **Multi-Source Search** -- Search TMDB, OMDb, Douban, IMDb, Trakt, RAWG, and Steam from a single interface
- **One-Click Import** -- Bulk import from Douban, Trakt, Steam, Xbox, and PSN with auto poster and detail fetching
- **Unified Library** -- Movies, TV shows, and games in one list with category/year/status filters and ratings
- **Timeline Poster Wall** -- Monthly grouped poster gallery with year switching and detail popups
- **Radar Discovery** -- Browse TMDB now-playing/trending + Youku/Tencent listings, add to wishlist instantly
- **Analytics** -- Annual reports, monthly trends, rating distribution, source breakdown, cross-platform comparison
- **Showcase Display** -- Grid and fullscreen carousel modes, perfect for casting your collection on a big screen
- **Activity Log** -- Automatic CRUD tracking with undo support and advanced filtering

## 🚀 Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/zaynzhu/pixelreel.git
cd pixelreel

# 2. Initialize the database
mysql -u root -p < db/init.sql

# 3. Start the backend
cd express-backend
npm install
cp .env.example .env   # Edit .env with your database URL and API keys
npx prisma generate
npx prisma db push
npm run dev             # http://localhost:18889

# 4. Start the frontend (new terminal)
cd frontend
npm install
npm run dev             # http://localhost:18888
```

> [!NOTE]
> See [db/setup.md](db/setup.md) for complete setup instructions. TMDB API requires `HTTPS_PROXY` in regions where it's blocked.

## 📦 Installation

### Prerequisites

- Node.js >= 18
- MySQL 8.4+
- npm or pnpm

### Environment Variables

Edit `express-backend/.env` with the following key settings:

```bash
DATABASE_URL="mysql://user:password@host:3306/pixelreel"
TMDB_API_KEY="your_tmdb_bearer_token"    # TMDB API v4 Bearer Token
OMDB_API_KEY="your_omdb_key"             # OMDb API Key
TRAKT_CLIENT_ID="your_trakt_client_id"   # Trakt API
RAWG_API_KEY="your_rawg_key"             # RAWG API
STEAM_API_KEY="your_steam_key"           # Steam API
HTTPS_PROXY="http://127.0.0.1:7897"      # Required for TMDB in China
```

See the [Configuration](#configuration) section below for the full list.

## 💡 Usage

### Search and Add Records

Enter keywords on the search page — supports mixed Chinese/English queries. Click a result to expand details (rating, director, cast, genre), then add it to your library with one click.

### Import from Existing Platforms

```bash
# Full Douban import (requires Playwright)
curl -X POST http://localhost:18889/api/import/douban-harvest?mode=full

# Trakt movie import
curl -X POST http://localhost:18889/api/trakt/import/movies

# Steam owned games import
curl -X POST http://localhost:18889/api/import/steam/owned
```

### Discover with Radar

Visit the `/radar` page to browse TMDB now-playing, upcoming, and trending titles, plus Youku and Tencent listings. Streaming platforms (Netflix/Disney+/Apple TV+/Max) can be filtered independently. Add interesting titles to your wishlist instantly.

---

## 🔄 Comparison

| Feature | PixelReel | Letterboxd | Trakt | Douban |
|---------|:---------:|:----------:|:-----:|:------:|
| Movie tracking | ✅ | ✅ | ✅ | ✅ |
| TV show tracking | ✅ | ❌ | ✅ | ✅ |
| Game tracking | ✅ | ❌ | ❌ | ❌ |
| Self-hosted | ✅ | ❌ | ❌ | ❌ |
| Multi-source aggregation | ✅ | ❌ | ⚠️ | ❌ |
| Douban data import | ✅ | ❌ | ❌ | -- |
| Steam/Xbox/PSN import | ✅ | ❌ | ❌ | ❌ |
| Analytics reports | ✅ | ⚠️ | ✅ | ❌ |
| Radar discovery | ✅ | ❌ | ✅ | ✅ |
| Operation undo | ✅ | ❌ | ❌ | ❌ |

## 📚 Documentation

| Topic | Description |
|-------|-------------|
| [Data Model](#data-model) | Movie / TvShow / Game / RadarItem table structure |
| [Frontend Routes](#frontend-routes) | All page routes at a glance |
| [API Endpoints](#api-endpoints) | Search, library, import, radar, and more |
| [Configuration](#configuration) | Complete .env variable reference |
| [db/setup.md](db/setup.md) | Step-by-step development environment setup |

### Frontend Routes

| Route | Page |
|-------|------|
| `/` | Dashboard with personal statistics |
| `/movies/search` | Movie search |
| `/tv-shows/search` | TV show search |
| `/games/search` | Game search |
| `/library` | Library list + rating/review workspace |
| `/timeline` | Timeline (monthly poster wall) |
| `/activity` | Activity log (filter, infinite scroll, undo) |
| `/showcase` | Showcase display (grid + fullscreen carousel) |
| `/analytics` | Analytics (annual report + insights) |
| `/settings` | System settings (env config) |
| `/radar` | Radar discovery (TMDB + Youku + Tencent) |
| `/login` | Login page |

### API Endpoints

#### Search

```text
GET /api/search/movies?query=&providers=omdb,tmdb,douban,imdb,trakt
GET /api/search/tv-shows?query=&providers=tmdb,douban
GET /api/search/games?query=&providers=rawg,steam
```

#### Detail Endpoints

```text
GET /api/search/imdb/:imdbId        IMDb/OMDb movie details
GET /api/search/tmdb/:tmdbId        TMDB details + credits
GET /api/search/douban/:doubanId    Douban movie details
GET /api/search/rawg/:rawgId        RAWG game details
GET /api/search/steam/:steamAppId   Steam game details
GET /api/search/proxy/image?url=    Image proxy (anti-hotlink)
```

#### Library & Timeline

```text
GET   /api/library?cursor=&limit=50&category=&year=&status=
GET   /api/library/:category/:id
PATCH /api/library/:category/:id
GET   /api/library/random?limit=N

GET   /api/timeline?cursor=&limit=96&category=&year=
GET   /api/timeline/years?category=
```

#### Import

```text
POST   /api/import/douban-harvest?mode=json|full|incremental
GET    /api/import/douban-harvest/status?taskId=xxx
POST   /api/trakt/import/movies
POST   /api/trakt/import/shows
POST   /api/import/steam/owned
POST   /api/import/xbox/owned
POST   /api/import/psn/owned
POST   /api/import/tmdb-enrich/backfill?limit=50
POST   /api/import/tmdb-detail/backfill?limit=50
POST   /api/import/steam/backfill
```

#### Radar

```text
GET    /api/radar?category=&type=&platform=&source=&page=&limit=
GET    /api/radar/status
POST   /api/radar/sync
POST   /api/radar/sync/:source
POST   /api/radar/add-to-library
```

#### Other

```text
GET    /api/profile/summary
GET    /api/analytics?year=
GET    /api/activity
POST   /api/activity/:id/undo
POST   /api/auth/login
GET    /api/settings
PUT    /api/settings
```

### Data Model

Three core tables with fields grouped by source (Douban primary, TMDB secondary):

| Model | External IDs | Display Fields |
|-------|-------------|----------------|
| Movie | doubanId, tmdbId, imdbId, traktId | title, posterUrl, releaseDate, overview, rating(1-5), shortReview |
| TvShow | doubanId, tmdbId, imdbId, traktId | title, posterUrl, firstAirDate, overview, rating(1-5), shortReview |
| Game | rawgId, steamAppId, xboxId, psnId | title, posterUrl, rating(1-5), shortReview, platform, playtimeMinutes |
| ActivityLog | -- | action, entityType, entityId, entityTitle, oldValues, newValues |
| RadarItem | sourceKey(unique), source, sourceId, tmdbId | title, titleZh, overview, posterPath, type, category, platform |

### Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | MySQL connection string | -- |
| `PORT` | Backend port | `18889` |
| `JWT_SECRET` | JWT signing secret | -- |
| `AUTH_ENABLED` | Enable login auth | `false` |
| `TMDB_API_KEY` | TMDB API v4 Bearer Token | -- |
| `OMDB_API_KEY` | OMDb API Key | -- |
| `TRAKT_CLIENT_ID` | Trakt Client ID | -- |
| `RAWG_API_KEY` | RAWG API Key | -- |
| `STEAM_API_KEY` | Steam API Key | -- |
| `HTTPS_PROXY` | HTTPS proxy (required for TMDB in China) | -- |
| `DOUBAN_USER_ID` | Douban user ID | -- |
| `DOUBAN_HARVEST_ENABLED` | Enable browser harvesting | `true` |
| `RADAR_ENABLED` | Radar module master switch | `true` |
| `RADAR_SYNC_CORE_CRON` | Core source sync cron | `0 * * * *` |
| `RADAR_SYNC_SCRAPER_CRON` | Scraper source sync cron | `0 */6 * * *` |
| `RADAR_WATCH_REGION` | TMDB streaming platform region | `TW` |

## ❓ FAQ

<details>
<summary>TMDB API requests timeout?</summary>

TMDB API requires a proxy in some regions. Set `HTTPS_PROXY=http://127.0.0.1:7897` in your `.env` (replace with your proxy address).

</details>

<details>
<summary>What's the difference between full and incremental Douban import?</summary>

- `mode=full`: Scrapes everything from scratch using Playwright browser automation
- `mode=incremental`: Only fetches new data since the last sync (requires a prior full sync)
- `mode=json`: Reads from a local `collect.json` file, no browser needed

</details>

<details>
<summary>How to backfill TMDB posters and details for existing records?</summary>

Run the backfill endpoints:
- `POST /api/import/tmdb-enrich/backfill?limit=50` — Search TMDB by title to add tmdbId and poster
- `POST /api/import/tmdb-detail/backfill?limit=50` — Fetch full details by tmdbId

Both are async tasks. Check progress on the `/activity` page.

</details>

<details>
<summary>What are the radar data sources?</summary>

- **Core (TMDB)**: Now playing, upcoming, trending, on the air — synced hourly
- **Scrapers**: Youku and Tencent listings — synced every 6 hours (failure-tolerant)
- **Streaming platforms**: Netflix, Disney+, Apple TV+, Max via TMDB Discover API

All sources can be toggled via `RADAR_ENABLED` and `RADAR_SCRAPERS_ENABLED`.

</details>

<details>
<summary>How to disable login authentication?</summary>

By default `AUTH_ENABLED=false` — no login required. Set to `true` to require JWT tokens from `POST /api/auth/login`.

</details>

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup

```bash
git clone https://github.com/zaynzhu/pixelreel.git
cd pixelreel

# Backend
cd express-backend && npm install && npm run dev

# Frontend (new terminal)
cd frontend && npm install && npm run dev
```

---

## ⭐ Star History

<a href="https://star-history.com/#zaynzhu/pixelreel&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=zaynzhu/pixelreel&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=zaynzhu/pixelreel&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=zaynzhu/pixelreel&type=Date" />
 </picture>
</a>

---

## 🙏 Contributors

<a href="https://github.com/zaynzhu/pixelreel/graphs/contributors">
 <img src="https://contrib.rocks/image?repo=zaynzhu/pixelreel" />
</a>

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) -- see the [LICENSE](LICENSE) file for details.
