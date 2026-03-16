package com.pixelreel.dto.external;

import java.util.List;
import lombok.Data;

@Data
public class ExternalSearchResponse<T> {
  private String query;
  private int page;
  private List<ProviderSearchResult<T>> providers;
}

