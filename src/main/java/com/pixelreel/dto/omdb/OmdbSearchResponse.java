package com.pixelreel.dto.omdb;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import lombok.Data;

@Data
public class OmdbSearchResponse {
  @JsonProperty("Search")
  private List<OmdbSearchItem> search;

  @JsonProperty("totalResults")
  private String totalResults;

  @JsonProperty("Response")
  private String response;

  @JsonProperty("Error")
  private String error;
}

