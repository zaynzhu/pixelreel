package com.pixelreel.dto.douban;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class DoubanSubject {
  private String id;
  private String title;

  @JsonProperty("original_title")
  private String originalTitle;

  private String year;
  private DoubanImages images;

  @JsonProperty("summary")
  private String summary;
}

