package com.pixelreel.dto.external;

import com.pixelreel.enums.RecordStatus;
import lombok.Data;

@Data
public class MovieRecordSuggestion {
  private Long tmdbId;
  private String imdbId;
  private String doubanId;
  private String traktId;
  private String title;
  private String posterUrl;
  private RecordStatus status;
  private Integer rating;
  private String shortReview;
}

