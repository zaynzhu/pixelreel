package com.pixelreel.controller;

import com.pixelreel.dto.external.ExternalGameSearchResult;
import com.pixelreel.dto.external.ExternalMovieSearchResult;
import com.pixelreel.dto.external.ExternalSearchResponse;
import com.pixelreel.service.ExternalSearchService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/search")
@RequiredArgsConstructor
public class ExternalSearchController {
  private final ExternalSearchService externalSearchService;

  @GetMapping("/movies")
  public ExternalSearchResponse<ExternalMovieSearchResult> searchMovies(
      @RequestParam String query,
      @RequestParam(defaultValue = "1") int page,
      @RequestParam(required = false) List<String> providers
  ) {
    return externalSearchService.searchMovies(query, page, providers);
  }

  @GetMapping("/games")
  public ExternalSearchResponse<ExternalGameSearchResult> searchGames(
      @RequestParam String query,
      @RequestParam(defaultValue = "1") int page,
      @RequestParam(required = false) List<String> providers
  ) {
    return externalSearchService.searchGames(query, page, providers);
  }
}

