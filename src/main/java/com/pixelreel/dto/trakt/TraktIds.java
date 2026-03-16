package com.pixelreel.dto.trakt;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class TraktIds {
  private Long trakt;
  private String slug;
  private String imdb;
  private Long tmdb;

  @JsonProperty("tvdb")
  private Long tvdb;
}

