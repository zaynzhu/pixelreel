package com.pixelreel.service;

import com.pixelreel.config.TmdbProperties;
import com.pixelreel.dto.external.ExternalMovieSearchResult;
import com.pixelreel.dto.external.MovieRecordSuggestion;
import com.pixelreel.dto.external.ProviderSearchResult;
import com.pixelreel.dto.tmdb.TmdbMovieItem;
import com.pixelreel.dto.tmdb.TmdbSearchResponse;
import com.pixelreel.entity.Movie;
import com.pixelreel.enums.RecordStatus;
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
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

@Service
@RequiredArgsConstructor
public class TmdbMovieSearchService implements MovieSearchProvider {
  private final MovieService movieService;

  @Qualifier("tmdbRestClient")
  private final RestClient tmdbRestClient;

  private final TmdbProperties tmdbProperties;

  @Override
  public String id() {
    return "tmdb";
  }

  @Override
  public ProviderSearchResult<ExternalMovieSearchResult> search(String query, int page) {
    ProviderSearchResult<ExternalMovieSearchResult> result = new ProviderSearchResult<>();
    result.setProvider(id());

    if (!tmdbProperties.enabled()) {
      result.setEnabled(false);
      result.setMessage("TMDB 未启用");
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

    TmdbSearchResponse response = tmdbRestClient
        .get()
        .uri(uriBuilder -> uriBuilder
            .path("/search/movie")
            .queryParam("api_key", tmdbProperties.apiKey())
            .queryParam("query", query)
            .queryParam("page", normalizedPage)
            .queryParamIfPresent("language", Optional.ofNullable(tmdbProperties.language()))
            .build())
        .retrieve()
        .body(TmdbSearchResponse.class);

    List<TmdbMovieItem> items = response == null ? Collections.emptyList() : response.getResults();
    Map<Long, Movie> existingByTmdbId = findExistingByTmdbId(items);

    List<ExternalMovieSearchResult> results = new ArrayList<>();
    for (TmdbMovieItem item : items) {
      ExternalMovieSearchResult mapped = new ExternalMovieSearchResult();
      mapped.setProvider(id());
      mapped.setTmdbId(item.getId());
      mapped.setTitle(item.getTitle());
      mapped.setOverview(item.getOverview());
      mapped.setReleaseDate(item.getReleaseDate());
      mapped.setPosterUrl(buildPosterUrl(item.getPosterPath()));

      Movie existing = item.getId() == null ? null : existingByTmdbId.get(item.getId());
      mapped.setAlreadyAdded(existing != null);
      mapped.setExistingRecordId(existing == null ? null : existing.getId());
      mapped.setSuggestedRecord(buildSuggestion(mapped));
      results.add(mapped);
    }

    result.setEnabled(true);
    result.setPage(response == null || response.getPage() == null ? normalizedPage : response.getPage());
    result.setTotalPages(response == null || response.getTotalPages() == null ? 0 : response.getTotalPages());
    result.setTotalResults(response == null || response.getTotalResults() == null ? 0 : response.getTotalResults());
    result.setResults(results);
    return result;
  }

  private Map<Long, Movie> findExistingByTmdbId(List<TmdbMovieItem> items) {
    List<Long> ids = items.stream()
        .map(TmdbMovieItem::getId)
        .filter(id -> id != null)
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

  private MovieRecordSuggestion buildSuggestion(ExternalMovieSearchResult mapped) {
    MovieRecordSuggestion suggestion = new MovieRecordSuggestion();
    suggestion.setTmdbId(mapped.getTmdbId());
    suggestion.setTitle(mapped.getTitle());
    suggestion.setPosterUrl(mapped.getPosterUrl());
    suggestion.setStatus(RecordStatus.WANT);
    suggestion.setRating(null);
    suggestion.setShortReview("");
    return suggestion;
  }

  private String buildPosterUrl(String posterPath) {
    if (!StringUtils.hasText(posterPath)) {
      return null;
    }
    return tmdbProperties.imageBaseUrl() + posterPath;
  }
}


