package com.pixelreel.service.provider;

import com.pixelreel.config.SteamWebApiProperties;
import com.pixelreel.dto.external.ExternalGameSearchResult;
import com.pixelreel.dto.external.GameRecordSuggestion;
import com.pixelreel.dto.external.ProviderSearchResult;
import com.pixelreel.dto.steam.SteamAppListResponse;
import com.pixelreel.entity.Game;
import com.pixelreel.enums.RecordStatus;
import com.pixelreel.service.GameService;
import com.pixelreel.service.search.GameSearchProvider;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

@Service
@RequiredArgsConstructor
public class SteamGameSearchProvider implements GameSearchProvider {
  private final GameService gameService;

  @Qualifier("steamWebApiRestClient")
  private final RestClient steamWebApiRestClient;

  private final SteamWebApiProperties steamProperties;

  private final AtomicReference<List<SteamAppListResponse.SteamApp>> cachedApps = new AtomicReference<>();
  private volatile Instant lastRefresh = Instant.EPOCH;

  @Override
  public String id() {
    return "steam";
  }

  @Override
  public ProviderSearchResult<ExternalGameSearchResult> search(String query, int page) {
    ProviderSearchResult<ExternalGameSearchResult> result = new ProviderSearchResult<>();
    result.setProvider(id());

    if (!steamProperties.enabled()) {
      result.setEnabled(false);
      result.setMessage("Steam 未启用");
      result.setPage(page);
      result.setTotalPages(0);
      result.setTotalResults(0);
      result.setResults(Collections.emptyList());
      return result;
    }

    if (!StringUtils.hasText(steamProperties.apiKey())) {
      result.setEnabled(false);
      result.setMessage("缺少 Steam Web API Key");
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
    List<SteamAppListResponse.SteamApp> apps = loadAppList();
    List<SteamAppListResponse.SteamApp> filtered = filterApps(apps, query);

    int pageSize = steamProperties.searchPageSize() == null ? 20 : steamProperties.searchPageSize();
    int total = filtered.size();
    int totalPages = total == 0 ? 0 : (int) Math.ceil(total / (double) pageSize);

    int fromIndex = Math.min((normalizedPage - 1) * pageSize, filtered.size());
    int toIndex = Math.min(fromIndex + pageSize, filtered.size());
    List<SteamAppListResponse.SteamApp> pageItems = filtered.subList(fromIndex, toIndex);

    Map<Long, Game> existingBySteamId = findExistingBySteamId(pageItems);

    List<ExternalGameSearchResult> results = new ArrayList<>();
    for (SteamAppListResponse.SteamApp item : pageItems) {
      ExternalGameSearchResult mapped = new ExternalGameSearchResult();
      mapped.setProvider(id());
      mapped.setSteamAppId(item.getAppId());
      mapped.setTitle(item.getName());
      mapped.setPosterUrl(null);

      Game existing = item.getAppId() == null ? null : existingBySteamId.get(item.getAppId());
      mapped.setAlreadyAdded(existing != null);
      mapped.setExistingRecordId(existing == null ? null : existing.getId());
      mapped.setSuggestedRecord(buildSuggestion(mapped));
      results.add(mapped);
    }

    result.setEnabled(true);
    result.setPage(normalizedPage);
    result.setTotalPages(totalPages);
    result.setTotalResults(total);
    result.setResults(results);
    return result;
  }

  private List<SteamAppListResponse.SteamApp> loadAppList() {
    int refreshMinutes = steamProperties.appListRefreshMinutes() == null ? 1440 : steamProperties.appListRefreshMinutes();
    boolean stale = Instant.now().isAfter(lastRefresh.plus(Duration.ofMinutes(refreshMinutes)));
    List<SteamAppListResponse.SteamApp> cached = cachedApps.get();
    if (!stale && cached != null) {
      return cached;
    }

    SteamAppListResponse response = steamWebApiRestClient
        .get()
        .uri(uriBuilder -> uriBuilder
            .path("/IStoreService/GetAppList/v1/")
            .queryParamIfPresent("key", Optional.ofNullable(steamProperties.apiKey()))
            .build())
        .retrieve()
        .body(SteamAppListResponse.class);

    List<SteamAppListResponse.SteamApp> apps = response == null || response.getResponse() == null
        ? Collections.emptyList()
        : response.getResponse().getApps();

    cachedApps.set(apps == null ? Collections.emptyList() : apps);
    lastRefresh = Instant.now();
    return cachedApps.get();
  }

  private List<SteamAppListResponse.SteamApp> filterApps(List<SteamAppListResponse.SteamApp> apps, String query) {
    if (apps == null) {
      return Collections.emptyList();
    }
    String needle = query.trim().toLowerCase(Locale.ROOT);
    return apps.stream()
        .filter(app -> StringUtils.hasText(app.getName()))
        .filter(app -> app.getName().toLowerCase(Locale.ROOT).contains(needle))
        .sorted(Comparator.comparing(SteamAppListResponse.SteamApp::getName))
        .toList();
  }

  private Map<Long, Game> findExistingBySteamId(List<SteamAppListResponse.SteamApp> items) {
    List<Long> ids = items.stream()
        .map(SteamAppListResponse.SteamApp::getAppId)
        .filter(value -> value != null)
        .distinct()
        .toList();
    if (ids.isEmpty()) {
      return Collections.emptyMap();
    }
    return gameService.lambdaQuery()
        .in(Game::getSteamAppId, ids)
        .list()
        .stream()
        .collect(Collectors.toMap(Game::getSteamAppId, Function.identity(), (a, b) -> a));
  }

  private GameRecordSuggestion buildSuggestion(ExternalGameSearchResult mapped) {
    GameRecordSuggestion suggestion = new GameRecordSuggestion();
    suggestion.setSteamAppId(mapped.getSteamAppId());
    suggestion.setTitle(mapped.getTitle());
    suggestion.setPosterUrl(mapped.getPosterUrl());
    suggestion.setStatus(RecordStatus.WANT);
    suggestion.setRating(null);
    suggestion.setShortReview("");
    return suggestion;
  }
}


