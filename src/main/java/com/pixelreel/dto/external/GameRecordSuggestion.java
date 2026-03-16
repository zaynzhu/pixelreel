package com.pixelreel.dto.external;

import com.pixelreel.enums.RecordStatus;
import lombok.Data;

@Data
public class GameRecordSuggestion {
  private Long rawgId;
  private Long steamAppId;
  private String xboxId;
  private String psnId;
  private String title;
  private String posterUrl;
  private RecordStatus status;
  private Integer rating;
  private String shortReview;
}

