package com.pixelreel.service.provider;

import com.pixelreel.config.TraktProperties;
import com.pixelreel.dto.external.ExternalMovieSearchResult;
import com.pixelreel.dto.external.MovieRecordSuggestion;
import com.pixelreel.dto.external.ProviderSearchResult;
import com.pixelreel.dto.trakt.TraktSearchItem;
import com.pixelreel.entity.Movie;
import com.pixelreel.enums.RecordStatus;
import com.pixelreel.service.MovieService;
import com.pixelreel.service.search.MovieSearchProvider;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

@Service
@RequiredArgsConstructor
public class TraktMovieSearchProvider implements MovieSearchProvider {
  private static final int DEFAULT_PAGE_SIZE = 20;

  private final MovieService movieService;

  @Qualifier("traktRestClient")
  private final RestClient traktRestClient;

  private final TraktProperties traktProperties;

  @Override
  public String id() {
    return "trakt";
  }

  @Override
  public ProviderSearchResult<ExternalMovieSearchResult> search(String query, int page) {
    ProviderSearchResult<ExternalMovieSearchResult> result = new ProviderSearchResult<>();
    result.setProvider(id());

    if (!traktProperties.enabled()) {
      result.setEnabled(false);
      result.setMessage("Trakt 未启用");
      result.setPage(page);
      result.setTotalPages(0);
      result.setTotalResults(0);
      result.setResults(Collections.emptyList());
      return result;
    }

    if (!StringUtils.hasText(query)) {
      throw new IllegalArgumentException("query must not be blank");
    }

    List<TraktSearchItem> items = traktRestClient
        .get()
        .uri(uriBuilder -> uriBuilder
            .path("/search/movie")
            .queryParam("query", query)
            .queryParam("page", Math.max(page, 1))
            .queryParam("limit", DEFAULT_PAGE_SIZE)
            .build())
        .header("trakt-api-key", traktProperties.clientId())
        .header("trakt-api-version", String.valueOf(Optional.ofNullable(traktProperties.apiVersion()).orElse(2)))
        .retrieve()
        .body(new ParameterizedTypeReference<List<TraktSearchItem>>() {});

    List<TraktSearchItem> safeItems = items == null ? Collections.emptyList() : items;

    Map<String, Movie> byTraktId = findExistingByTraktId(safeItems);
    Map<Long, Movie> byTmdbId = findExistingByTmdbId(safeItems);
    Map<String, Movie> byImdbId = findExistingByImdbId(safeItems);

    List<ExternalMovieSearchResult> results = new ArrayList<>();
    for (TraktSearchItem item : safeItems) {
      if (item.getMovie() == null || item.getMovie().getIds() == null) {
        continue;
      }

      ExternalMovieSearchResult mapped = new ExternalMovieSearchResult();
      mapped.setProvider(id());
      mapped.setTitle(item.getMovie().getTitle());
      mapped.setReleaseDate(item.getMovie().getYear() == null ? null : String.valueOf(item.getMovie().getYear()));
      mapped.setTraktId(item.getMovie().getIds().getTrakt() == null ? null : String.valueOf(item.getMovie().getIds().getTrakt()));
      mapped.setImdbId(item.getMovie().getIds().getImdb());
      mapped.setTmdbId(item.getMovie().getIds().getTmdb());

      Movie existing = findExisting(mapped, byTraktId, byTmdbId, byImdbId);
      mapped.setAlreadyAdded(existing != null);
      mapped.setExistingRecordId(existing == null ? null : existing.getId());
      mapped.setSuggestedRecord(buildSuggestion(mapped));
      results.add(mapped);
    }

    result.setEnabled(true);
    result.setPage(Math.max(page, 1));
    result.setTotalPages(0);
    result.setTotalResults(results.size());
    result.setResults(results);
    return result;
  }

  private Movie findExisting(
      ExternalMovieSearchResult mapped,
      Map<String, Movie> byTraktId,
      Map<Long, Movie> byTmdbId,
      Map<String, Movie> byImdbId
  ) {
    if (StringUtils.hasText(mapped.getTraktId())) {
      Movie existing = byTraktId.get(mapped.getTraktId());
      if (existing != null) {
        return existing;
      }
    }
    if (mapped.getTmdbId() != null) {
      Movie existing = byTmdbId.get(mapped.getTmdbId());
      if (existing != null) {
        return existing;
      }
    }
    if (StringUtils.hasText(mapped.getImdbId())) {
      return byImdbId.get(mapped.getImdbId());
    }
    return null;
  }

  private Map<String, Movie> findExistingByTraktId(List<TraktSearchItem> items) {
    List<Long> ids = items.stream()
        .map(item -> item.getMovie() == null || item.getMovie().getIds() == null
            ? null
            : item.getMovie().getIds().getTrakt())
        .filter(value -> value != null)
        .distinct()
        .toList();
    if (ids.isEmpty()) {
      return Collections.emptyMap();
    }
    return movieService.lambdaQuery()
        .in(Movie::getTraktId, ids.stream().map(String::valueOf).toList())
        .list()
        .stream()
        .collect(Collectors.toMap(Movie::getTraktId, Function.identity(), (a, b) -> a));
  }

  private Map<Long, Movie> findExistingByTmdbId(List<TraktSearchItem> items) {
    List<Long> ids = items.stream()
        .map(item -> item.getMovie() == null || item.getMovie().getIds() == null
            ? null
            : item.getMovie().getIds().getTmdb())
        .filter(value -> value != null)
        .distinct()
        .toList();
    if (ids.isEmpty()) {
      return Collections.emptyMap();
    }
    return movieService.lambdaQuery()
        .in(Movie::getTmdbId, ids)
        .list()
        .stream()
        .collect(Collectors.toMap(Movie::getTmdbId, Function.identity(), (a, b) -> a));
  }

  private Map<String, Movie> findExistingByImdbId(List<TraktSearchItem> items) {
    List<String> ids = items.stream()
        .map(item -> item.getMovie() == null || item.getMovie().getIds() == null
            ? null
            : item.getMovie().getIds().getImdb())
        .filter(StringUtils::hasText)
        .distinct()
        .toList();
    if (ids.isEmpty()) {
      return Collections.emptyMap();
    }
    return movieService.lambdaQuery()
        .in(Movie::getImdbId, ids)
        .list()
        .stream()
        .collect(Collectors.toMap(Movie::getImdbId, Function.identity(), (a, b) -> a));
  }

  private MovieRecordSuggestion buildSuggestion(ExternalMovieSearchResult mapped) {
    MovieRecordSuggestion suggestion = new MovieRecordSuggestion();
    suggestion.setTmdbId(mapped.getTmdbId());
    suggestion.setImdbId(mapped.getImdbId());
    suggestion.setTraktId(mapped.getTraktId());
    suggestion.setTitle(mapped.getTitle());
    suggestion.setPosterUrl(mapped.getPosterUrl());
    suggestion.setStatus(RecordStatus.WANT);
    suggestion.setRating(null);
    suggestion.setShortReview("");
    return suggestion;
  }

  
}


