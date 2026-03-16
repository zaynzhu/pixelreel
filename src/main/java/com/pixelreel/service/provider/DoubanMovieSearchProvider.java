package com.pixelreel.service.provider;

import com.pixelreel.config.DoubanProperties;
import com.pixelreel.dto.douban.DoubanSearchResponse;
import com.pixelreel.dto.douban.DoubanSubject;
import com.pixelreel.dto.external.ExternalMovieSearchResult;
import com.pixelreel.dto.external.MovieRecordSuggestion;
import com.pixelreel.dto.external.ProviderSearchResult;
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
public class DoubanMovieSearchProvider implements MovieSearchProvider {
  private static final int DEFAULT_PAGE_SIZE = 20;

  private final MovieService movieService;

  @Qualifier("doubanRestClient")
  private final RestClient doubanRestClient;

  private final DoubanProperties doubanProperties;

  @Override
  public String id() {
    return "douban";
  }

  @Override
  public ProviderSearchResult<ExternalMovieSearchResult> search(String query, int page) {
    ProviderSearchResult<ExternalMovieSearchResult> result = new ProviderSearchResult<>();
    result.setProvider(id());

    if (!doubanProperties.enabled()) {
      result.setEnabled(false);
      result.setMessage("豆瓣未启用");
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
    int start = (normalizedPage - 1) * DEFAULT_PAGE_SIZE;

    DoubanSearchResponse response = doubanRestClient
        .get()
        .uri(uriBuilder -> uriBuilder
            .path("/movie/search")
            .queryParam("q", query)
            .queryParam("start", start)
            .queryParam("count", DEFAULT_PAGE_SIZE)
            .queryParamIfPresent("apikey", StringUtils.hasText(doubanProperties.apiKey())
                ? java.util.Optional.of(doubanProperties.apiKey())
                : java.util.Optional.empty())
            .build())
        .retrieve()
        .body(DoubanSearchResponse.class);

    List<DoubanSubject> subjects = response == null ? Collections.emptyList() : response.getSubjects();
    Map<String, Movie> existingByDoubanId = findExistingByDoubanId(subjects);

    List<ExternalMovieSearchResult> results = new ArrayList<>();
    for (DoubanSubject subject : subjects) {
      ExternalMovieSearchResult mapped = new ExternalMovieSearchResult();
      mapped.setProvider(id());
      mapped.setDoubanId(subject.getId());
      mapped.setTitle(StringUtils.hasText(subject.getTitle()) ? subject.getTitle() : subject.getOriginalTitle());
      mapped.setReleaseDate(subject.getYear());
      mapped.setOverview(subject.getSummary());
      mapped.setPosterUrl(subject.getImages() == null ? null : subject.getImages().getLarge());

      Movie existing = subject.getId() == null ? null : existingByDoubanId.get(subject.getId());
      mapped.setAlreadyAdded(existing != null);
      mapped.setExistingRecordId(existing == null ? null : existing.getId());
      mapped.setSuggestedRecord(buildSuggestion(mapped));
      results.add(mapped);
    }

    int total = response == null || response.getTotal() == null ? results.size() : response.getTotal();
    int totalPages = total == 0 ? 0 : (int) Math.ceil(total / (double) DEFAULT_PAGE_SIZE);

    result.setEnabled(true);
    result.setPage(normalizedPage);
    result.setTotalPages(totalPages);
    result.setTotalResults(total);
    result.setResults(results);
    return result;
  }

  private Map<String, Movie> findExistingByDoubanId(List<DoubanSubject> subjects) {
    List<String> ids = subjects.stream()
        .map(DoubanSubject::getId)
        .filter(StringUtils::hasText)
        .distinct()
        .toList();
    if (ids.isEmpty()) {
      return Collections.emptyMap();
    }
    return movieService.lambdaQuery()
        .in(Movie::getDoubanId, ids)
        .list()
        .stream()
        .collect(Collectors.toMap(Movie::getDoubanId, Function.identity(), (a, b) -> a));
  }

  private MovieRecordSuggestion buildSuggestion(ExternalMovieSearchResult mapped) {
    MovieRecordSuggestion suggestion = new MovieRecordSuggestion();
    suggestion.setDoubanId(mapped.getDoubanId());
    suggestion.setTitle(mapped.getTitle());
    suggestion.setPosterUrl(mapped.getPosterUrl());
    suggestion.setStatus(RecordStatus.WANT);
    suggestion.setRating(null);
    suggestion.setShortReview("");
    return suggestion;
  }
}

