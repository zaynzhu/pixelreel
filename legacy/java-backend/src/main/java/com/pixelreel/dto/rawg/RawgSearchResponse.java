package com.pixelreel.dto.rawg;

import java.util.List;
import lombok.Data;

@Data
public class RawgSearchResponse {
  private Integer count;
  private List<RawgGame> results;

  @Data
  public static class RawgGame {
    private Long id;
    private String name;
    private String released;
    @com.fasterxml.jackson.annotation.JsonProperty("background_image")
    private String backgroundImage;
  }
}
