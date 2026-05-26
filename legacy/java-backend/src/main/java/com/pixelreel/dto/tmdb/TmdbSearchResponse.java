package com.pixelreel.dto.tmdb;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import lombok.Data;

@Data
public class TmdbSearchResponse {
  @JsonProperty("page")
  private Integer page;

  @JsonProperty("total_pages")
  private Integer totalPages;

  @JsonProperty("total_results")
  private Integer totalResults;

  @JsonProperty("results")
  private List<TmdbMovieItem> results;
}

