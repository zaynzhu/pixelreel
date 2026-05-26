package com.pixelreel.service.provider;

import com.pixelreel.config.OmdbProperties;
import com.pixelreel.dto.external.ExternalMovieSearchResult;
import com.pixelreel.dto.external.MovieRecordSuggestion;
import com.pixelreel.dto.external.ProviderSearchResult;
import com.pixelreel.dto.omdb.OmdbSearchItem;
import com.pixelreel.dto.omdb.OmdbSearchResponse;
import com.pixelreel.entity.Movie;
import com.pixelreel.enums.RecordStatus;
import com.pixelreel.service.MovieService;
import com.pixelreel.service.search.MovieSearchProvider;
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
public class OmdbMovieSearchProvider implements MovieSearchProvider {
  private final MovieService movieService;

  @Qualifier("omdbRestClient")
  private final RestClient omdbRestClient;

  private final OmdbProperties omdbProperties;

  @Override
  public String id() {
    return "omdb";
  }

  @Override
  public ProviderSearchResult<ExternalMovieSearchResult> search(String query, int page) {
    ProviderSearchResult<ExternalMovieSearchResult> result = new ProviderSearchResult<>();
    result.setProvider(id());

    if (!omdbProperties.enabled()) {
      result.setEnabled(false);
      result.setMessage("OMDb 未启用");
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

    OmdbSearchResponse response = omdbRestClient
        .get()
        .uri(uriBuilder -> uriBuilder
            .queryParam("apikey", omdbProperties.apiKey())
            .queryParam("s", query)
            .queryParam("page", normalizedPage)
            .queryParam("type", "movie")
            .build())
        .retrieve()
        .body(OmdbSearchResponse.class);

    if (response != null && "False".equalsIgnoreCase(response.getResponse())) {
      result.setEnabled(true);
      result.setMessage(response.getError());
      result.setPage(normalizedPage);
      result.setTotalPages(0);
      result.setTotalResults(0);
      result.setResults(Collections.emptyList());
      return result;
    }

    List<OmdbSearchItem> items = response == null ? Collections.emptyList() : response.getSearch();
    Map<String, Movie> existingByImdbId = findExistingByImdbId(items);

    List<ExternalMovieSearchResult> results = new ArrayList<>();
    for (OmdbSearchItem item : items) {
      ExternalMovieSearchResult mapped = new ExternalMovieSearchResult();
      mapped.setProvider(id());
      mapped.setImdbId(item.getImdbId());
      mapped.setTitle(item.getTitle());
      mapped.setReleaseDate(item.getYear());
      mapped.setPosterUrl(normalizePoster(item.getPoster()));

      Movie existing = item.getImdbId() == null ? null : existingByImdbId.get(item.getImdbId());
      mapped.setAlreadyAdded(existing != null);
      mapped.setExistingRecordId(existing == null ? null : existing.getId());
      mapped.setSuggestedRecord(buildSuggestion(mapped));
      results.add(mapped);
    }

    int total = parseTotal(response == null ? null : response.getTotalResults());
    int totalPages = total == 0 ? 0 : (int) Math.ceil(total / 10.0);

    result.setEnabled(true);
    result.setPage(normalizedPage);
    result.setTotalPages(totalPages);
    result.setTotalResults(total);
    result.setResults(results);
    return result;
  }

  private Map<String, Movie> findExistingByImdbId(List<OmdbSearchItem> items) {
    List<String> ids = items.stream()
        .map(OmdbSearchItem::getImdbId)
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
    suggestion.setImdbId(mapped.getImdbId());
    suggestion.setTitle(mapped.getTitle());
    suggestion.setPosterUrl(mapped.getPosterUrl());
    suggestion.setStatus(RecordStatus.WANT);
    suggestion.setRating(null);
    suggestion.setShortReview("");
    return suggestion;
  }

  private int parseTotal(String totalResults) {
    try {
      return totalResults == null ? 0 : Integer.parseInt(totalResults);
    } catch (NumberFormatException ex) {
      return 0;
    }
  }

  private String normalizePoster(String poster) {
    if (!StringUtils.hasText(poster) || "N/A".equalsIgnoreCase(poster)) {
      return null;
    }
    return poster;
  }
}

