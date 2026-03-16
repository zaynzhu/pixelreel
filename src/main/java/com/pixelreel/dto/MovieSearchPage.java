package com.pixelreel.dto;

import java.util.List;
import lombok.Data;

@Data
public class MovieSearchPage {
  private int page;
  private int totalPages;
  private int totalResults;
  private List<MovieSearchResult> results;
}

