package com.pixelreel.dto.trakt;

import lombok.Data;

@Data
public class TraktMovie {
  private String title;
  private Integer year;
  private TraktIds ids;
}

