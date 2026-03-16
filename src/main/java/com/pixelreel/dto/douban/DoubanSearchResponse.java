package com.pixelreel.dto.douban;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import lombok.Data;

@Data
public class DoubanSearchResponse {
  @JsonProperty("count")
  private Integer count;

  @JsonProperty("start")
  private Integer start;

  @JsonProperty("total")
  private Integer total;

  @JsonProperty("subjects")
  private List<DoubanSubject> subjects;
}

