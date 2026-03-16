package com.pixelreel.dto.external;

import lombok.Data;

@Data
public class ExternalMovieSearchResult {
  private String provider;
  private Long tmdbId;
  private String imdbId;
  private String doubanId;
  private String traktId;
  private String title;
  private String posterUrl;
  private String releaseDate;
  private String overview;
  private boolean alreadyAdded;
  private Long existingRecordId;
  private MovieRecordSuggestion suggestedRecord;
}

