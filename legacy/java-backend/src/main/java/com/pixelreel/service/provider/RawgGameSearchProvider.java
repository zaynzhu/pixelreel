package com.pixelreel.service.provider;

import com.pixelreel.config.RawgProperties;
import com.pixelreel.dto.external.ExternalGameSearchResult;
import com.pixelreel.dto.external.GameRecordSuggestion;
import com.pixelreel.dto.external.ProviderSearchResult;
import com.pixelreel.dto.rawg.RawgSearchResponse;
import com.pixelreel.entity.Game;
import com.pixelreel.enums.RecordStatus;
import com.pixelreel.service.GameService;
import com.pixelreel.service.search.GameSearchProvider;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
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
public class RawgGameSearchProvider implements GameSearchProvider {
  private static final int PAGE_SIZE = 20;

  private final GameService gameService;

  @Qualifier("rawgRestClient")
  private final RestClient rawgRestClient;

  private final RawgProperties rawgProperties;

  @Override
  public String id() {
    return "rawg";
  }

  @Override
  public ProviderSearchResult<ExternalGameSearchResult> search(String query, int page) {
    ProviderSearchResult<ExternalGameSearchResult> result = new ProviderSearchResult<>();
    result.setProvider(id());

    if (!rawgProperties.enabled()) {
      result.setEnabled(false);
      result.setMessage("RAWG 未启用");
      result.setPage(page);
      result.setTotalPages(0);
      result.setTotalResults(0);
      result.setResults(Collections.emptyList());
      return result;
    }

    if (!StringUtils.hasText(rawgProperties.apiKey())) {
      result.setEnabled(false);
      result.setMessage("缺少 RAWG API Key");
      result.setPage(page);
      result.setTotalPages(0);
      result.setTotalResults(0);
      result.setResults(Collections.emptyList());
      return result;
    }

    if (!StringUtils.hasText(query)) {
      throw new IllegalArgumentException("query must not be blank");
    }

    int normalizedPage = Math.max(page, 1);
    RawgSearchResponse response = rawgRestClient
        .get()
        .uri(uriBuilder -> uriBuilder
            .path("/games")
            .queryParam("search", query)
            .queryParam("page", normalizedPage)
            .queryParam("page_size", PAGE_SIZE)
            .queryParam("key", rawgProperties.apiKey())
            .build())
        .retrieve()
        .body(RawgSearchResponse.class);

    List<RawgSearchResponse.RawgGame> items = response == null || response.getResults() == null
        ? Collections.emptyList()
        : response.getResults();
    Map<Long, Game> existingByRawgId = findExistingByRawgId(items);

    List<ExternalGameSearchResult> results = new ArrayList<>();
    for (RawgSearchResponse.RawgGame item : items) {
      if (item == null || !StringUtils.hasText(item.getName())) {
        continue;
      }

      ExternalGameSearchResult mapped = new ExternalGameSearchResult();
      mapped.setProvider(id());
      mapped.setRawgId(item.getId());
      mapped.setTitle(item.getName());
      mapped.setPosterUrl(normalizeUrl(item.getBackgroundImage()));
      mapped.setReleaseDate(item.getReleased());

      Game existing = item.getId() == null ? null : existingByRawgId.get(item.getId());
      mapped.setAlreadyAdded(existing != null);
      mapped.setExistingRecordId(existing == null ? null : existing.getId());
      mapped.setSuggestedRecord(buildSuggestion(mapped));
      results.add(mapped);
    }

    int total = response == null || response.getCount() == null ? results.size() : response.getCount();
    int totalPages = total == 0 ? 0 : (int) Math.ceil(total / (double) PAGE_SIZE);

    result.setEnabled(true);
    result.setPage(normalizedPage);
    result.setTotalPages(totalPages);
    result.setTotalResults(total);
    result.setResults(results);
    return result;
  }

  private Map<Long, Game> findExistingByRawgId(List<RawgSearchResponse.RawgGame> items) {
    List<Long> ids = items.stream()
        .map(RawgSearchResponse.RawgGame::getId)
        .filter(value -> value != null)
        .distinct()
        .toList();
    if (ids.isEmpty()) {
      return Collections.emptyMap();
    }
    return gameService.lambdaQuery()
        .in(Game::getRawgId, ids)
        .list()
        .stream()
        .collect(Collectors.toMap(Game::getRawgId, Function.identity(), (a, b) -> a));
  }

  private GameRecordSuggestion buildSuggestion(ExternalGameSearchResult mapped) {
    GameRecordSuggestion suggestion = new GameRecordSuggestion();
    suggestion.setRawgId(mapped.getRawgId());
    suggestion.setTitle(mapped.getTitle());
    suggestion.setPosterUrl(mapped.getPosterUrl());
    suggestion.setStatus(RecordStatus.WANT);
    suggestion.setRating(null);
    suggestion.setShortReview("");
    return suggestion;
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
