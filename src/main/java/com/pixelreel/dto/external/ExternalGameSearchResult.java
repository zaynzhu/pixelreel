package com.pixelreel.dto.external;

import lombok.Data;

@Data
public class ExternalGameSearchResult {
  private String provider;
  private Long rawgId;
  private Long steamAppId;
  private String xboxId;
  private String psnId;
  private String title;
  private String posterUrl;
  private String releaseDate;
  private String overview;
  private boolean alreadyAdded;
  private Long existingRecordId;
  private GameRecordSuggestion suggestedRecord;
}

