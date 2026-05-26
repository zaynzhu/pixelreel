package com.pixelreel.service.search;

import com.pixelreel.dto.external.ExternalGameSearchResult;
import com.pixelreel.dto.external.ProviderSearchResult;

public interface GameSearchProvider {
  String id();

  ProviderSearchResult<ExternalGameSearchResult> search(String query, int page);
}

