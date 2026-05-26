package com.pixelreel.service;

import com.pixelreel.config.RawgProperties;
import com.pixelreel.dto.imports.ImportSummary;
import com.pixelreel.dto.rawg.RawgSearchResponse;
import com.pixelreel.entity.Game;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

@Service
@RequiredArgsConstructor
public class RawgCoverFillService {
  private final GameService gameService;

  @Qualifier("rawgRestClient")
  private final RestClient rawgRestClient;

  private final RawgProperties rawgProperties;

  public ImportSummary fillMissingCovers(Integer limit) {
    ImportSummary summary = new ImportSummary();
    summary.setErrors(new ArrayList<>());

    if (!rawgProperties.enabled()) {
      summary.getErrors().add("RAWG 未启用");
      return summary;
    }
    if (!StringUtils.hasText(rawgProperties.apiKey())) {
      summary.getErrors().add("缺少 RAWG API Key");
      return summary;
    }

    List<Game> targets = fetchTargets(limit);
    summary.setTotal(targets.size());

    for (Game game : targets) {
      if (game == null || !StringUtils.hasText(game.getTitle())) {
        summary.setSkipped(summary.getSkipped() + 1);
        continue;
      }
      try {
        String posterUrl = fetchPosterUrl(game.getTitle());
        if (!StringUtils.hasText(posterUrl)) {
          summary.setSkipped(summary.getSkipped() + 1);
          continue;
        }
        Game update = new Game();
        update.setId(game.getId());
        update.setPosterUrl(posterUrl);
        gameService.updateById(update);
        summary.setImported(summary.getImported() + 1);
      } catch (RuntimeException ex) {
        summary.getErrors().add("补全失败: " + game.getTitle() + "，原因: " + ex.getMessage());
        summary.setSkipped(summary.getSkipped() + 1);
      }
    }

    return summary;
  }

  private List<Game> fetchTargets(Integer limit) {
    int effectiveLimit = limit == null ? 50 : limit;
    if (effectiveLimit <= 0) {
      return gameService.lambdaQuery()
          .isNull(Game::getPosterUrl)
          .orderByAsc(Game::getId)
          .list();
    }
    return gameService.lambdaQuery()
        .isNull(Game::getPosterUrl)
        .orderByAsc(Game::getId)
        .last("limit " + effectiveLimit)
        .list();
  }

  private String fetchPosterUrl(String title) {
    RawgSearchResponse response = rawgRestClient
        .get()
        .uri(uriBuilder -> uriBuilder
            .path("/games")
            .queryParam("search", title)
            .queryParam("key", rawgProperties.apiKey())
            .queryParam("page_size", 1)
            .build())
        .retrieve()
        .body(RawgSearchResponse.class);

    if (response == null || response.getResults() == null || response.getResults().isEmpty()) {
      return null;
    }
    RawgSearchResponse.RawgGame game = response.getResults().get(0);
    if (game == null) {
      return null;
    }
    return normalizeUrl(game.getBackgroundImage());
  }

  private String normalizeUrl(String url) {
    if (!StringUtils.hasText(url)) {
      return null;
    }
    String trimmed = url.trim();
    if (trimmed.startsWith("//")) {
      return "https:" + trimmed;
    }
    return trimmed;
  }
}
