# Xbox/PSN Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement player-centric Xbox/PSN import with OpenXBL + PSNProfiles, extend game schema, and add RAWG poster fallback.

**Architecture:** Add new provider configs and RestClients, implement two import services that fetch player game lists and map to `Game`, and add a small RAWG lookup service for missing posters. Keep synchronous imports via `/api/import/*` endpoints and reuse existing `ImportSummary`.

**Tech Stack:** Spring Boot 3, MyBatis-Plus, MySQL, RestClient, Jsoup.

---

### Task 1: Remove Douban CSV import

**Files:**
- Delete: `E:\code\codex\pixelreel\src\main\java\com\pixelreel\service\DoubanCsvImportService.java`
- Modify: `E:\code\codex\pixelreel\src\main\java\com\pixelreel\controller\ImportController.java`
- Modify: `E:\code\codex\pixelreel\pom.xml`

**Step 1: Write the failing test**
Skip (no existing tests; do not add new tests for this removal).

**Step 2: Run test to verify it fails**
Run: `./mvnw test`
Expected: Builds with existing tests (if any).

**Step 3: Write minimal implementation**
- Remove the Douban import endpoint from `ImportController`.
- Remove the `DoubanCsvImportService` class.
- Remove `commons-csv` dependency from `pom.xml`.

**Step 4: Run test to verify it passes**
Run: `./mvnw test`
Expected: PASS.

**Step 5: Commit**
```bash
git add E:\code\codex\pixelreel\src\main\java\com\pixelreel\controller\ImportController.java \
        E:\code\codex\pixelreel\pom.xml
git rm E:\code\codex\pixelreel\src\main\java\com\pixelreel\service\DoubanCsvImportService.java
git commit -m "chore: remove douban csv import"
```

---

### Task 2: Extend Game schema and entity

**Files:**
- Modify: `E:\code\codex\pixelreel\src\main\java\com\pixelreel\entity\Game.java`
- Modify: `E:\code\codex\pixelreel\schema.sql`

**Step 1: Write the failing test**
Skip (schema change; no tests exist).

**Step 2: Run test to verify it fails**
Run: `./mvnw test`
Expected: PASS (no tests).

**Step 3: Write minimal implementation**
- Add columns to `schema.sql`:
  - `platform` VARCHAR(20) NULL
  - `playtime_minutes` INT NULL
  - `achievement_total` INT NULL
  - `achievement_unlocked` INT NULL
  - `imported_at` DATETIME NULL
- Update `Game` entity:
  ```java
  @TableField("platform")
  private String platform;

  @TableField("playtime_minutes")
  private Integer playtimeMinutes;

  @TableField("achievement_total")
  private Integer achievementTotal;

  @TableField("achievement_unlocked")
  private Integer achievementUnlocked;

  @TableField("imported_at")
  private LocalDateTime importedAt;
  ```

**Step 4: Run test to verify it passes**
Run: `./mvnw test`
Expected: PASS.

**Step 5: Commit**
```bash
git add E:\code\codex\pixelreel\src\main\java\com\pixelreel\entity\Game.java \
        E:\code\codex\pixelreel\schema.sql
git commit -m "feat: extend game with platform and import stats"
```

---

### Task 3: Add RAWG poster fallback client

**Files:**
- Create: `E:\code\codex\pixelreel\src\main\java\com\pixelreel\config\RawgProperties.java`
- Modify: `E:\code\codex\pixelreel\src\main\java\com\pixelreel\config\TmdbConfig.java`
- Modify: `E:\code\codex\pixelreel\src\main\resources\application.yml`
- Create: `E:\code\codex\pixelreel\src\main\java\com\pixelreel\dto\rawg\RawgSearchResponse.java`
- Create: `E:\code\codex\pixelreel\src\main\java\com\pixelreel\service\RawgPosterLookupService.java`

**Step 1: Write the failing test**
Skip (no test harness).

**Step 2: Run test to verify it fails**
Run: `./mvnw test`
Expected: PASS.

**Step 3: Write minimal implementation**
- `RawgProperties` with `enabled`, `baseUrl`, `apiKey`.
- Add `rawgRestClient` bean in `TmdbConfig`.
- DTO example:
  ```java
  public class RawgSearchResponse {
    private List<RawgGame> results;
    public static class RawgGame {
      private String name;
      private String backgroundImage;
    }
  }
  ```
- `RawgPosterLookupService`:
  - If disabled or missing key, return empty.
  - Call `/api/games` with `search`, `page_size=1`, `key`.
  - Return `background_image` if present.
- Add config to `application.yml` with placeholders.

**Step 4: Run test to verify it passes**
Run: `./mvnw test`
Expected: PASS.

**Step 5: Commit**
```bash
git add E:\code\codex\pixelreel\src\main\java\com\pixelreel\config\RawgProperties.java \
        E:\code\codex\pixelreel\src\main\java\com\pixelreel\config\TmdbConfig.java \
        E:\code\codex\pixelreel\src\main\resources\application.yml \
        E:\code\codex\pixelreel\src\main\java\com\pixelreel\dto\rawg\RawgSearchResponse.java \
        E:\code\codex\pixelreel\src\main\java\com\pixelreel\service\RawgPosterLookupService.java
git commit -m "feat: add RAWG poster lookup"
```

---

### Task 4: Add OpenXBL import service

**Files:**
- Create: `E:\code\codex\pixelreel\src\main\java\com\pixelreel\config\OpenXblProperties.java`
- Modify: `E:\code\codex\pixelreel\src\main\java\com\pixelreel\config\TmdbConfig.java`
- Modify: `E:\code\codex\pixelreel\src\main\resources\application.yml`
- Create: `E:\code\codex\pixelreel\src\main\java\com\pixelreel\service\OpenXblImportService.java`
- Modify: `E:\code\codex\pixelreel\src\main\java\com\pixelreel\controller\ImportController.java`
- Modify: `E:\code\codex\pixelreel\pom.xml`

**Step 1: Write the failing test**
Skip (no tests).

**Step 2: Run test to verify it fails**
Run: `./mvnw test`
Expected: PASS.

**Step 3: Write minimal implementation**
- Add `OpenXblProperties` with `enabled`, `baseUrl`, `apiKey`.
- Add `openxblRestClient` in `TmdbConfig`.
- Add `jsoup` dependency in `pom.xml` (needed for PSN in next task).
- Implement `OpenXblImportService`:
  - Validate config and `gamertag`.
  - `GET /api/v2/search/{gamertag}` to resolve `xuid`.
  - `GET /api/v2/player/titleHistory/{xuid}` to list titles.
  - `GET /api/v2/achievements/player/{xuid}` (or per-title endpoint) to compute totals.
  - Map to `Game` with platform `XBOX`, `xboxId` from title id, `importedAt=now`.
  - If poster missing, call `RawgPosterLookupService`.
- Add endpoint `/api/import/xbox/owned?gamertag=...&status=...`.

**Step 4: Run test to verify it passes**
Run: `./mvnw test`
Expected: PASS.

**Step 5: Commit**
```bash
git add E:\code\codex\pixelreel\src\main\java\com\pixelreel\config\OpenXblProperties.java \
        E:\code\codex\pixelreel\src\main\java\com\pixelreel\config\TmdbConfig.java \
        E:\code\codex\pixelreel\src\main\resources\application.yml \
        E:\code\codex\pixelreel\src\main\java\com\pixelreel\service\OpenXblImportService.java \
        E:\code\codex\pixelreel\src\main\java\com\pixelreel\controller\ImportController.java \
        E:\code\codex\pixelreel\pom.xml
git commit -m "feat: import xbox owned games via openxbl"
```

---

### Task 5: Add PSNProfiles import service

**Files:**
- Create: `E:\code\codex\pixelreel\src\main\java\com\pixelreel\config\PsnProfilesProperties.java`
- Modify: `E:\code\codex\pixelreel\src\main\java\com\pixelreel\config\TmdbConfig.java`
- Modify: `E:\code\codex\pixelreel\src\main\resources\application.yml`
- Create: `E:\code\codex\pixelreel\src\main\java\com\pixelreel\service\PsnProfilesImportService.java`
- Modify: `E:\code\codex\pixelreel\src\main\java\com\pixelreel\controller\ImportController.java`

**Step 1: Write the failing test**
Skip (no tests).

**Step 2: Run test to verify it fails**
Run: `./mvnw test`
Expected: PASS.

**Step 3: Write minimal implementation**
- `PsnProfilesProperties` with `enabled`, `baseUrl`, `userAgent`, optional `profilePathTemplate`.
- Add `psnProfilesRestClient` in `TmdbConfig`.
- Implement `PsnProfilesImportService` using Jsoup:
  - Build profile URL from base + `/{psnId}`.
  - Parse game rows, extract title, trophy totals/unlocked, cover image.
  - Map to `Game` with platform `PSN`, `psnId` from trophy link, `importedAt=now`.
  - Fallback poster via RAWG when missing.
- Add endpoint `/api/import/psn/owned?psnId=...&status=...`.

**Step 4: Run test to verify it passes**
Run: `./mvnw test`
Expected: PASS.

**Step 5: Commit**
```bash
git add E:\code\codex\pixelreel\src\main\java\com\pixelreel\config\PsnProfilesProperties.java \
        E:\code\codex\pixelreel\src\main\java\com\pixelreel\config\TmdbConfig.java \
        E:\code\codex\pixelreel\src\main\resources\application.yml \
        E:\code\codex\pixelreel\src\main\java\com\pixelreel\service\PsnProfilesImportService.java \
        E:\code\codex\pixelreel\src\main\java\com\pixelreel\controller\ImportController.java
git commit -m "feat: import psn owned games via psnprofiles"
```

---

### Task 6: Update Steam import to populate new fields

**Files:**
- Modify: `E:\code\codex\pixelreel\src\main\java\com\pixelreel\service\SteamOwnedGamesImportService.java`

**Step 1: Write the failing test**
Skip (no tests).

**Step 2: Run test to verify it fails**
Run: `./mvnw test`
Expected: PASS.

**Step 3: Write minimal implementation**
- Set `platform = "STEAM"`.
- Set `playtimeMinutes` from `playtime_forever`.
- Set `importedAt = now`.
- Use RAWG poster fallback if Steam image is missing.

**Step 4: Run test to verify it passes**
Run: `./mvnw test`
Expected: PASS.

**Step 5: Commit**
```bash
git add E:\code\codex\pixelreel\src\main\java\com\pixelreel\service\SteamOwnedGamesImportService.java
git commit -m "feat: enrich steam import fields"
```

---

### Task 7: Adjust Xbox/PSN search provider messaging (optional)

**Files:**
- Modify: `E:\code\codex\pixelreel\src\main\java\com\pixelreel\service\provider\XboxGameSearchProvider.java`
- Modify: `E:\code\codex\pixelreel\src\main\java\com\pixelreel\service\provider\PsnGameSearchProvider.java`

**Step 1: Write the failing test**
Skip.

**Step 2: Run test to verify it fails**
Run: `./mvnw test`
Expected: PASS.

**Step 3: Write minimal implementation**
- Update messages to direct users to `/api/import/xbox/owned` and `/api/import/psn/owned`.

**Step 4: Run test to verify it passes**
Run: `./mvnw test`
Expected: PASS.

**Step 5: Commit**
```bash
git add E:\code\codex\pixelreel\src\main\java\com\pixelreel\service\provider\XboxGameSearchProvider.java \
        E:\code\codex\pixelreel\src\main\java\com\pixelreel\service\provider\PsnGameSearchProvider.java
git commit -m "chore: clarify xbox/psn search messaging"
```



