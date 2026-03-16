# Xbox/PSN Player-Centric Import Design

## Goal
Add one-click import for Xbox and PlayStation based on player identities (Gamertag/PSN ID). Import saves basic game records and achievement/trophy counts (no per-achievement details). If a provider does not supply a cover image, fallback to RAWG by game name.

## Scope
- Xbox: OpenXBL search Gamertag -> XUID -> title history -> achievements summary.
- PSN: PSNProfiles HTML scraping using Jsoup from a profile page.
- Steam remains supported as-is but will populate new fields.
- No background jobs, no caching, no achievement detail tables.

## Data Model Changes
Extend the `game` table and `Game` entity:
- `platform` (nullable string: STEAM/XBOX/PSN)
- `playtime_minutes` (nullable int)
- `achievement_total` (nullable int)
- `achievement_unlocked` (nullable int)
- `imported_at` (nullable datetime)

## Import Flow
1. Controller endpoint accepts player identifier (Gamertag or PSN ID) and optional default status.
2. Service resolves and fetches provider data.
3. Each game is mapped to `Game` with:
   - `title`
   - `platform`
   - `poster_url`
   - `playtime_minutes` (when available)
   - `achievement_total` / `achievement_unlocked`
   - `status` (default to WANT if not provided)
   - `imported_at` (now)
4. Deduplicate by platform + external ID (`steam_app_id`, `xbox_id`, `psn_id`).
5. Save batch and return a summary (total/imported/skipped/errors).

## Error Handling
- Missing API keys or disabled provider returns a summary with errors and zero results.
- External errors (HTTP failures or parsing) recorded in summary errors.
- PSNProfiles parsing is best-effort and may fail if the HTML changes.

## Config
Add properties:
- `openxbl.enabled`, `openxbl.base-url`, `openxbl.api-key`
- `psnprofiles.enabled`, `psnprofiles.base-url`, `psnprofiles.user-agent`, optional selectors
- `rawg.enabled`, `rawg.base-url`, `rawg.api-key` for poster fallback

