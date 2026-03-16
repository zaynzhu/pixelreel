package com.pixelreel.dto.external;

import java.util.List;
import lombok.Data;

@Data
public class ProviderSearchResult<T> {
  private String provider;
  private boolean enabled;
  private String message;
  private int page;
  private int totalPages;
  private int totalResults;
  private List<T> results;
}

