package com.pixelreel.dto.trakt;

import lombok.Data;

@Data
public class TraktSearchItem {
  private String type;
  private Double score;
  private TraktMovie movie;
}

