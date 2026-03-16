package com.pixelreel.service;

import com.pixelreel.config.PsnProfilesProperties;
import com.pixelreel.dto.imports.ImportSummary;
import com.pixelreel.entity.Game;
import com.pixelreel.enums.RecordStatus;
import java.net.URI;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

@Service
@RequiredArgsConstructor
public class PsnProfilesImportService {
  private static final Pattern TROPHY_PROGRESS = Pattern.compile("(\\d+)\\s*/\\s*(\\d+)");

  private final GameService gameService;

  @Qualifier("psnProfilesRestClient")
  private final RestClient psnProfilesRestClient;

  private final PsnProfilesProperties psnProfilesProperties;

  public ImportSummary importOwnedGames(String psnId, RecordStatus status) {
    ImportSummary summary = new ImportSummary();
    summary.setErrors(new ArrayList<>());

    if (!psnProfilesProperties.enabled()) {
      summary.getErrors().add("PSNProfiles 未启用");
      return summary;
    }
    if (!StringUtils.hasText(psnId)) {
      summary.getErrors().add("缺少 PSN ID");
      return summary;
    }

    String profilePath = "/" + psnId.trim();
    String html = fetchProfileHtml(profilePath);
    if (!StringUtils.hasText(html)) {
      summary.getErrors().add("无法获取 PSNProfiles 页面内容");
      return summary;
    }

    Document document = Jsoup.parse(html, psnProfilesProperties.baseUrl());
    List<PsnProfileGame> games = parseGames(document);
    summary.setTotal(games.size());

    Map<String, Game> existing = existingByPsnId(games);
    List<Game> toSave = new ArrayList<>();
    RecordStatus effectiveStatus = status == null ? RecordStatus.UNSET : status;
    LocalDateTime now = LocalDateTime.now();

    for (PsnProfileGame game : games) {
      if (!StringUtils.hasText(game.psnId())) {
        summary.getErrors().add("缺少 PSN 游戏 ID，已跳过: " + safeLabel(game.title()));
        summary.setSkipped(summary.getSkipped() + 1);
        continue;
      }
      if (!StringUtils.hasText(game.title())) {
        summary.getErrors().add("缺少游戏名称，已跳过: " + game.psnId());
        summary.setSkipped(summary.getSkipped() + 1);
        continue;
      }
      if (existing.containsKey(game.psnId())) {
        summary.setSkipped(summary.getSkipped() + 1);
        continue;
      }
      try {
        Game entity = new Game();
        entity.setPsnId(game.psnId());
        entity.setTitle(game.title());
        entity.setPosterUrl(game.posterUrl());
        entity.setPlatform("PSN");
        entity.setAchievementTotal(game.achievementTotal());
        entity.setAchievementUnlocked(game.achievementUnlocked());
        entity.setImportedAt(now);
        entity.setStatus(effectiveStatus);
        entity.setRating(null);
        entity.setShortReview("");
        toSave.add(entity);
      } catch (RuntimeException ex) {
        summary.getErrors().add("导入失败: " + safeLabel(game.title()) + "，原因: " + ex.getMessage());
        summary.setSkipped(summary.getSkipped() + 1);
      }
    }

    if (!toSave.isEmpty()) {
      gameService.saveBatch(toSave);
      summary.setImported(toSave.size());
    }
    return summary;
  }

  private String fetchProfileHtml(String path) {
    try {
      return psnProfilesRestClient
          .get()
          .uri(path)
          .accept(MediaType.TEXT_HTML)
          .headers(headers -> {
            String ua = psnProfilesProperties.userAgent();
            if (!StringUtils.hasText(ua)) {
              ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
            }
            headers.set("User-Agent", ua);
            if (StringUtils.hasText(psnProfilesProperties.cookie())) {
              headers.set("Cookie", psnProfilesProperties.cookie());
            }
          })
          .retrieve()
          .body(String.class);
    } catch (RuntimeException ex) {
      return null;
    }
  }

  private List<PsnProfileGame> parseGames(Document document) {
    Elements links = document.select("a[href*=/trophies/]");
    Map<String, PsnProfileGame> results = new LinkedHashMap<>();
    for (Element link : links) {
      String href = link.attr("href");
      String psnGameId = extractGameId(href);
      if (!StringUtils.hasText(psnGameId) || results.containsKey(psnGameId)) {
        continue;
      }

      Element row = link.closest("tr");
      if (row == null) {
        row = link.closest("li");
      }
      if (row == null) {
        row = link.parent();
      }

      String title = extractTitle(link, row);
      String posterUrl = extractPosterUrl(row);
      TrophyProgress progress = extractTrophyProgress(row);

      results.put(psnGameId, new PsnProfileGame(psnGameId, title, posterUrl, progress.total(), progress.unlocked()));
    }
    return new ArrayList<>(results.values());
  }

  private String extractGameId(String href) {
    if (!StringUtils.hasText(href)) {
      return null;
    }
    String normalized = href.trim();
    int idx = normalized.indexOf("/trophies/");
    if (idx < 0) {
      return null;
    }
    String tail = normalized.substring(idx + 10);
    if (tail.startsWith("/")) {
      tail = tail.substring(1);
    }
    int slash = tail.indexOf('/');
    String id = slash > 0 ? tail.substring(0, slash) : tail;
    return StringUtils.hasText(id) ? id : null;
  }

  private String extractTitle(Element link, Element row) {
    String title = textOrNull(link.text());
    if (!StringUtils.hasText(title)) {
      title = textOrNull(link.attr("title"));
    }
    if (!StringUtils.hasText(title) && row != null) {
      title = textOrNull(row.selectFirst(".title, .game-title, .title a, .title span"));
    }
    if (!StringUtils.hasText(title) && row != null) {
      Element img = row.selectFirst("img[alt]");
      if (img != null) {
        title = textOrNull(img.attr("alt"));
      }
    }
    return title;
  }

  private String extractPosterUrl(Element row) {
    if (row == null) {
      return null;
    }
    Element img = row.selectFirst("img");
    if (img == null) {
      return null;
    }
    String url = firstText(img, List.of("data-src", "data-lazy-src", "src"));
    if (!StringUtils.hasText(url)) {
      return null;
    }
    if (url.startsWith("//")) {
      return "https:" + url;
    }
    if (url.startsWith("http")) {
      return url;
    }
    return resolveUrl(psnProfilesProperties.baseUrl(), url);
  }

  private TrophyProgress extractTrophyProgress(Element row) {
    if (row == null) {
      return new TrophyProgress(null, null);
    }
    Elements dataNodes = row.select("[data-earned][data-total]");
    if (!dataNodes.isEmpty()) {
      Element node = dataNodes.first();
      Integer earned = parseInt(node.attr("data-earned"));
      Integer total = parseInt(node.attr("data-total"));
      if (earned != null || total != null) {
        return new TrophyProgress(total, earned);
      }
    }

    String text = row.text();
    if (StringUtils.hasText(text)) {
      Matcher matcher = TROPHY_PROGRESS.matcher(text);
      if (matcher.find()) {
        Integer earned = parseInt(matcher.group(1));
        Integer total = parseInt(matcher.group(2));
        if (earned != null || total != null) {
          return new TrophyProgress(total, earned);
        }
      }
    }
    return new TrophyProgress(null, null);
  }

  private Integer parseInt(String value) {
    if (!StringUtils.hasText(value)) {
      return null;
    }
    try {
      return Integer.parseInt(value.trim());
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private String resolveUrl(String baseUrl, String relative) {
    try {
      return URI.create(baseUrl).resolve(relative).toString();
    } catch (RuntimeException ex) {
      return relative;
    }
  }

  private String textOrNull(String value) {
    return StringUtils.hasText(value) ? value.trim() : null;
  }

  private String textOrNull(Element element) {
    if (element == null) {
      return null;
    }
    return textOrNull(element.text());
  }

  private String firstText(Element element, List<String> attrs) {
    if (element == null) {
      return null;
    }
    for (String attr : attrs) {
      String value = element.attr(attr);
      if (StringUtils.hasText(value)) {
        return value.trim();
      }
    }
    return null;
  }

  private Map<String, Game> existingByPsnId(List<PsnProfileGame> games) {
    List<String> ids = games.stream()
        .map(PsnProfileGame::psnId)
        .filter(StringUtils::hasText)
        .distinct()
        .toList();
    if (ids.isEmpty()) {
      return Collections.emptyMap();
    }
    return gameService.lambdaQuery()
        .in(Game::getPsnId, ids)
        .list()
        .stream()
        .collect(Collectors.toMap(Game::getPsnId, Function.identity(), (a, b) -> a));
  }

  private String safeLabel(String value) {
    return StringUtils.hasText(value) ? value : "未知游戏";
  }

  private record PsnProfileGame(String psnId, String title, String posterUrl, Integer achievementTotal, Integer achievementUnlocked) {}

  private record TrophyProgress(Integer total, Integer unlocked) {}
}
