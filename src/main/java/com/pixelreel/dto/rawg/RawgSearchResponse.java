package com.pixelreel.dto.rawg;

import java.util.List;
import lombok.Data;

@Data
public class RawgSearchResponse {
  private List<RawgGame> results;

  @Data
  public static class RawgGame {
    private String name;
    @com.fasterxml.jackson.annotation.JsonProperty("background_image")
    private String backgroundImage;
  }
}
