package com.pixelreel.dto.steam;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import lombok.Data;

@Data
public class SteamSearchResponse {
  @JsonProperty("total")
  private Integer total;

  @JsonProperty("items")
  private List<SteamSearchItem> items;
}

