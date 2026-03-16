package com.pixelreel.service.search;

import com.pixelreel.dto.external.ExternalMovieSearchResult;
import com.pixelreel.dto.external.ProviderSearchResult;

public interface MovieSearchProvider {
  String id();

  ProviderSearchResult<ExternalMovieSearchResult> search(String query, int page);
}

