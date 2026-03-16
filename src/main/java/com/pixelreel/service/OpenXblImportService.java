package com.pixelreel.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.pixelreel.config.OpenXblProperties;
import com.pixelreel.dto.imports.ImportSummary;
import com.pixelreel.entity.Game;
import com.pixelreel.enums.RecordStatus;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

@Service
@RequiredArgsConstructor
public class OpenXblImportService {
  private static final String HEADER_API_KEY = "X-Authorization";

  private final GameService gameService;

  @Qualifier("openxblRestClient")
  private final RestClient openxblRestClient;

  private final OpenXblProperties openxblProperties;

  public ImportSummary importOwnedGames(String gamertag, RecordStatus status) {
    ImportSummary summary = new ImportSummary();
    summary.setErrors(new ArrayList<>());

    if (!openxblProperties.enabled()) {
      summary.getErrors().add("OpenXBL 未启用");
      return summary;
    }
    if (!StringUtils.hasText(openxblProperties.apiKey())) {
      summary.getErrors().add("缺少 OpenXBL API Key");
      return summary;
    }
    if (!StringUtils.hasText(gamertag)) {
      summary.getErrors().add("缺少 Xbox Gamertag");
      return summary;
    }

    JsonNode searchResponse = safeGet("/search/{gamertag}", gamertag.trim());
    String xuid = extractFirstText(searchResponse, "xuid");
    if (!StringUtils.hasText(xuid)) {
      summary.getErrors().add("无法从 OpenXBL 搜索结果解析 XUID");
      return summary;
    }

    JsonNode titleHistory = safeGet("/player/titleHistory/{xuid}", xuid);
    if (titleHistory == null || titleHistory.isMissingNode()) {
      summary.getErrors().add("获取 Xbox 游戏列表失败");
      return summary;
    }

    List<OpenXblTitle> titles = parseTitles(titleHistory);
    Map<String, AchievementStats> achievementStats = Collections.emptyMap();
    JsonNode achievementsResponse = safeGet("/achievements/player/{xuid}", xuid);
    if (achievementsResponse == null || achievementsResponse.isMissingNode()) {
      summary.getErrors().add("获取成就统计失败，已跳过成就数据");
    } else {
      achievementStats = parseAchievements(achievementsResponse);
    }

    Map<String, Game> existing = existingByXboxId(titles);
    List<Game> toSave = new ArrayList<>();
    RecordStatus effectiveStatus = status == null ? RecordStatus.UNSET : status;
    LocalDateTime now = LocalDateTime.now();

    summary.setTotal(titles.size());
    for (OpenXblTitle title : titles) {
      if (!StringUtils.hasText(title.titleId())) {
        summary.getErrors().add("缺少 Xbox titleId，已跳过: " + safeLabel(title.name()));
        summary.setSkipped(summary.getSkipped() + 1);
        continue;
      }
      if (!StringUtils.hasText(title.name())) {
        summary.getErrors().add("缺少游戏名称，已跳过: " + title.titleId());
        summary.setSkipped(summary.getSkipped() + 1);
        continue;
      }
      if (existing.containsKey(title.titleId())) {
        summary.setSkipped(summary.getSkipped() + 1);
        continue;
      }
      try {
        Game entity = new Game();
        entity.setXboxId(title.titleId());
        entity.setTitle(title.name());
        entity.setPosterUrl(title.posterUrl());
        entity.setPlatform("XBOX");
        entity.setPlaytimeMinutes(title.playtimeMinutes());
        entity.setStatus(effectiveStatus);
        entity.setRating(null);
        entity.setShortReview("");
        entity.setImportedAt(now);

        AchievementStats stats = achievementStats.get(title.titleId());
        if (stats != null) {
          entity.setAchievementTotal(stats.total());
          entity.setAchievementUnlocked(stats.unlocked());
        }

        toSave.add(entity);
      } catch (RuntimeException ex) {
        summary.getErrors().add("导入失败: " + safeLabel(title.name()) + "，原因: " + ex.getMessage());
        summary.setSkipped(summary.getSkipped() + 1);
      }
    }

    if (!toSave.isEmpty()) {
      gameService.saveBatch(toSave);
      summary.setImported(toSave.size());
    }
    return summary;
  }

  private JsonNode safeGet(String path, Object... uriVariables) {
    try {
      return openxblRestClient
          .get()
          .uri(path, uriVariables)
          .header(HEADER_API_KEY, openxblProperties.apiKey())
          .retrieve()
          .body(JsonNode.class);
    } catch (RuntimeException ex) {
      return null;
    }
  }

  private List<OpenXblTitle> parseTitles(JsonNode root) {
    if (root == null || root.isMissingNode()) {
      return Collections.emptyList();
    }

    JsonNode array = firstArray(root, List.of("titles", "titleHistory", "data", "items"));
    if (array == null || !array.isArray()) {
      array = findFirstArrayWithField(root, "titleId");
    }
    if (array == null || !array.isArray()) {
      return Collections.emptyList();
    }

    List<OpenXblTitle> titles = new ArrayList<>();
    for (JsonNode item : array) {
      String titleId = firstText(item, List.of("titleId", "titleID", "id", "title_id"));
      String name = firstText(item, List.of("name", "title", "displayName", "game"));
      String posterUrl = firstText(item, List.of("displayImage", "displayImageUrl", "image", "imageUrl", "boxArt", "boxArtUrl"));
      Integer playtimeMinutes = parsePlaytimeMinutes(item);
      if (StringUtils.hasText(titleId) || StringUtils.hasText(name)) {
        titles.add(new OpenXblTitle(titleId, name, posterUrl, playtimeMinutes));
      }
    }
    return titles;
  }

  private Map<String, AchievementStats> parseAchievements(JsonNode root) {
    if (root == null || root.isMissingNode()) {
      return Collections.emptyMap();
    }
    JsonNode array = firstArray(root, List.of("titles", "data", "items"));
    if (array == null || !array.isArray()) {
      array = findFirstArrayWithField(root, "titleId");
    }
    if (array == null || !array.isArray()) {
      return Collections.emptyMap();
    }

    Map<String, AchievementStats> map = new HashMap<>();
    for (JsonNode item : array) {
      String titleId = firstText(item, List.of("titleId", "titleID", "id", "title_id"));
      if (!StringUtils.hasText(titleId)) {
        continue;
      }

      Integer total = null;
      Integer unlocked = null;

      JsonNode statsNode = firstObject(item, List.of("achievement", "achievements", "stats", "progress"));
      if (statsNode != null && statsNode.isObject()) {
        total = firstInt(statsNode, List.of("totalAchievements", "total", "achievementTotal"));
        unlocked = firstInt(statsNode, List.of("currentAchievements", "unlockedAchievements", "achievementUnlocked", "earned"));
      }

      JsonNode achievementsArray = item.path("achievements");
      if ((total == null || unlocked == null) && achievementsArray.isArray()) {
        total = total == null ? achievementsArray.size() : total;
        if (unlocked == null) {
          int unlockedCount = 0;
          for (JsonNode achievement : achievementsArray) {
            if (isAchievementUnlocked(achievement)) {
              unlockedCount++;
            }
          }
          unlocked = unlockedCount;
        }
      }

      if (total != null || unlocked != null) {
        map.put(titleId, new AchievementStats(total, unlocked));
      }
    }
    return map;
  }

  private boolean isAchievementUnlocked(JsonNode achievement) {
    if (achievement == null || achievement.isMissingNode()) {
      return false;
    }
    JsonNode progressState = achievement.path("progressState");
    if (progressState.isTextual()) {
      String normalized = progressState.asText("").trim().toLowerCase(Locale.ROOT);
      if (normalized.contains("achieved") || normalized.contains("unlocked") || normalized.contains("completed")) {
        return true;
      }
    }
    JsonNode unlocked = achievement.path("unlocked");
    if (unlocked.isBoolean()) {
      return unlocked.asBoolean();
    }
    JsonNode progress = achievement.path("progress");
    if (progress.isNumber()) {
      return progress.asInt() >= 100;
    }
    return false;
  }

  private Integer parsePlaytimeMinutes(JsonNode item) {
    Integer minutes = firstInt(item, List.of("playtimeMinutes", "minutesPlayed", "timePlayedMinutes", "minutes"));
    if (minutes != null) {
      return minutes;
    }
    Integer hours = firstInt(item, List.of("playtimeHours", "hoursPlayed", "timePlayedHours", "hours"));
    if (hours != null) {
      return hours * 60;
    }

    String timeText = firstText(item, List.of("timePlayed", "playtime"));
    if (!StringUtils.hasText(timeText)) {
      return null;
    }
    String normalized = timeText.trim().toLowerCase(Locale.ROOT);
    Double numeric = parseLeadingNumber(normalized);
    if (numeric == null) {
      return null;
    }
    if (normalized.contains("hour") || normalized.endsWith("h")) {
      return (int) Math.round(numeric * 60);
    }
    if (normalized.contains("min") || normalized.endsWith("m")) {
      return (int) Math.round(numeric);
    }
    return (int) Math.round(numeric);
  }

  private Double parseLeadingNumber(String value) {
    StringBuilder builder = new StringBuilder();
    for (int i = 0; i < value.length(); i++) {
      char ch = value.charAt(i);
      if (Character.isDigit(ch) || ch == '.') {
        builder.append(ch);
      } else if (builder.length() > 0) {
        break;
      }
    }
    if (builder.length() == 0) {
      return null;
    }
    try {
      return Double.parseDouble(builder.toString());
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private Map<String, Game> existingByXboxId(List<OpenXblTitle> titles) {
    List<String> ids = titles.stream()
        .map(OpenXblTitle::titleId)
        .filter(StringUtils::hasText)
        .distinct()
        .toList();
    if (ids.isEmpty()) {
      return Collections.emptyMap();
    }
    return gameService.lambdaQuery()
        .in(Game::getXboxId, ids)
        .list()
        .stream()
        .collect(Collectors.toMap(Game::getXboxId, Function.identity(), (a, b) -> a));
  }

  private String extractFirstText(JsonNode root, String fieldName) {
    if (root == null || root.isMissingNode()) {
      return null;
    }
    if (root.has(fieldName)) {
      JsonNode value = root.get(fieldName);
      if (value.isTextual() || value.isNumber()) {
        return value.asText();
      }
    }
    if (root.isArray()) {
      for (JsonNode child : root) {
        String found = extractFirstText(child, fieldName);
        if (StringUtils.hasText(found)) {
          return found;
        }
      }
      return null;
    }
    if (root.isObject()) {
      for (JsonNode child : root) {
        String found = extractFirstText(child, fieldName);
        if (StringUtils.hasText(found)) {
          return found;
        }
      }
    }
    return null;
  }

  private JsonNode firstArray(JsonNode root, List<String> candidates) {
    for (String candidate : candidates) {
      JsonNode node = root.path(candidate);
      if (node.isArray()) {
        return node;
      }
    }
    return null;
  }

  private JsonNode findFirstArrayWithField(JsonNode root, String fieldName) {
    if (root == null || root.isMissingNode()) {
      return null;
    }
    if (root.isArray()) {
      for (JsonNode child : root) {
        if (child.isObject() && child.has(fieldName)) {
          return root;
        }
      }
      for (JsonNode child : root) {
        JsonNode found = findFirstArrayWithField(child, fieldName);
        if (found != null) {
          return found;
        }
      }
      return null;
    }
    if (root.isObject()) {
      for (JsonNode child : root) {
        JsonNode found = findFirstArrayWithField(child, fieldName);
        if (found != null) {
          return found;
        }
      }
    }
    return null;
  }

  private JsonNode firstObject(JsonNode root, List<String> candidates) {
    for (String candidate : candidates) {
      JsonNode node = root.path(candidate);
      if (node.isObject()) {
        return node;
      }
    }
    return null;
  }

  private String firstText(JsonNode root, List<String> candidates) {
    for (String candidate : candidates) {
      JsonNode node = root.path(candidate);
      if (node.isTextual()) {
        String value = node.asText();
        if (StringUtils.hasText(value)) {
          return value.trim();
        }
      }
      if (node.isNumber()) {
        return node.asText();
      }
    }
    return null;
  }

  private Integer firstInt(JsonNode root, List<String> candidates) {
    for (String candidate : candidates) {
      JsonNode node = root.path(candidate);
      if (node.isNumber()) {
        return node.intValue();
      }
      if (node.isTextual()) {
        String text = node.asText();
        if (StringUtils.hasText(text)) {
          try {
            return (int) Math.round(Double.parseDouble(text.trim()));
          } catch (NumberFormatException ignored) {
            // ignore
          }
        }
      }
    }
    return null;
  }

  private String safeLabel(String value) {
    return StringUtils.hasText(value) ? value : "未知游戏";
  }

  private record OpenXblTitle(String titleId, String name, String posterUrl, Integer playtimeMinutes) {}

  private record AchievementStats(Integer total, Integer unlocked) {}
}
