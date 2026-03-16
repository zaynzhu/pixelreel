package com.pixelreel.dto;

import lombok.Data;

@Data
public class MovieSearchResult {
  private Long tmdbId;
  private String title;
  private String posterUrl;
  private String releaseDate;
  private String overview;
}

