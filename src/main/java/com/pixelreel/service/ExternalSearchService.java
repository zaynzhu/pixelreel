package com.pixelreel.service;

import com.pixelreel.dto.external.ExternalGameSearchResult;
import com.pixelreel.dto.external.ExternalMovieSearchResult;
import com.pixelreel.dto.external.ExternalSearchResponse;
import com.pixelreel.dto.external.ProviderSearchResult;
import com.pixelreel.service.search.GameSearchProvider;
import com.pixelreel.service.search.MovieSearchProvider;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class ExternalSearchService {
  private final List<MovieSearchProvider> movieSearchProviders;
  private final List<GameSearchProvider> gameSearchProviders;

  public ExternalSearchResponse<ExternalMovieSearchResult> searchMovies(
      String query,
      int page,
      List<String> providers
  ) {
    ExternalSearchResponse<ExternalMovieSearchResult> response = new ExternalSearchResponse<>();
    response.setQuery(query);
    response.setPage(page);
    response.setProviders(runMovieProviders(query, page, providers));
    return response;
  }

  public ExternalSearchResponse<ExternalGameSearchResult> searchGames(
      String query,
      int page,
      List<String> providers
  ) {
    ExternalSearchResponse<ExternalGameSearchResult> response = new ExternalSearchResponse<>();
    response.setQuery(query);
    response.setPage(page);
    response.setProviders(runGameProviders(query, page, providers));
    return response;
  }

  private List<ProviderSearchResult<ExternalMovieSearchResult>> runMovieProviders(
      String query,
      int page,
      List<String> providers
  ) {
    List<MovieSearchProvider> selected = selectMovieProviders(providers);
    List<ProviderSearchResult<ExternalMovieSearchResult>> results = new ArrayList<>();
    for (MovieSearchProvider provider : selected) {
      results.add(safeMovieSearch(provider, query, page));
    }
    return results;
  }

  private List<ProviderSearchResult<ExternalGameSearchResult>> runGameProviders(
      String query,
      int page,
      List<String> providers
  ) {
    List<GameSearchProvider> selected = selectGameProviders(providers);
    List<ProviderSearchResult<ExternalGameSearchResult>> results = new ArrayList<>();
    for (GameSearchProvider provider : selected) {
      results.add(safeGameSearch(provider, query, page));
    }
    return results;
  }

  private List<MovieSearchProvider> selectMovieProviders(List<String> providers) {
    if (providers == null || providers.isEmpty()) {
      return movieSearchProviders;
    }
    Set<String> set = providers.stream()
        .filter(StringUtils::hasText)
        .flatMap(value -> Arrays.stream(value.split(",")))
        .map(value -> value.trim().toLowerCase(Locale.ROOT))
        .filter(StringUtils::hasText)
        .collect(Collectors.toSet());
    return movieSearchProviders.stream()
        .filter(provider -> set.contains(provider.id().toLowerCase(Locale.ROOT)))
        .toList();
  }

  private List<GameSearchProvider> selectGameProviders(List<String> providers) {
    if (providers == null || providers.isEmpty()) {
      return gameSearchProviders;
    }
    Set<String> set = providers.stream()
        .filter(StringUtils::hasText)
        .flatMap(value -> Arrays.stream(value.split(",")))
        .map(value -> value.trim().toLowerCase(Locale.ROOT))
        .filter(StringUtils::hasText)
        .collect(Collectors.toSet());
    return gameSearchProviders.stream()
        .filter(provider -> set.contains(provider.id().toLowerCase(Locale.ROOT)))
        .toList();
  }

  private ProviderSearchResult<ExternalMovieSearchResult> safeMovieSearch(
      MovieSearchProvider provider,
      String query,
      int page
  ) {
    try {
      return provider.search(query, page);
    } catch (Exception ex) {
      ProviderSearchResult<ExternalMovieSearchResult> result = new ProviderSearchResult<>();
      result.setProvider(provider.id());
      result.setEnabled(true);
      result.setMessage("搜索失败: " + ex.getMessage());
      result.setPage(page);
      result.setTotalPages(0);
      result.setTotalResults(0);
      result.setResults(Collections.emptyList());
      return result;
    }
  }

  private ProviderSearchResult<ExternalGameSearchResult> safeGameSearch(
      GameSearchProvider provider,
      String query,
      int page
  ) {
    try {
      return provider.search(query, page);
    } catch (Exception ex) {
      ProviderSearchResult<ExternalGameSearchResult> result = new ProviderSearchResult<>();
      result.setProvider(provider.id());
      result.setEnabled(true);
      result.setMessage("搜索失败: " + ex.getMessage());
      result.setPage(page);
      result.setTotalPages(0);
      result.setTotalResults(0);
      result.setResults(Collections.emptyList());
      return result;
    }
  }
}


