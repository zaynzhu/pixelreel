package com.pixelreel.dto.steam;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import lombok.Data;

@Data
public class SteamAppListResponse {
  @JsonProperty("response")
  private SteamAppList response;

  @Data
  public static class SteamAppList {
    @JsonProperty("apps")
    private List<SteamApp> apps;

    @JsonProperty("have_more_results")
    private Boolean haveMoreResults;

    @JsonProperty("last_appid")
    private Long lastAppId;
  }

  @Data
  public static class SteamApp {
    @JsonProperty("appid")
    private Long appId;

    @JsonProperty("name")
    private String name;
  }
}

