package com.pixelreel.dto.steam;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import lombok.Data;

@Data
public class SteamOwnedGamesResponse {
  @JsonProperty("response")
  private SteamOwnedGames payload;

  @Data
  public static class SteamOwnedGames {
    @JsonProperty("game_count")
    private Integer gameCount;

    @JsonProperty("games")
    private List<SteamOwnedGame> games;
  }

  @Data
  public static class SteamOwnedGame {
    @JsonProperty("appid")
    private Long appId;

    @JsonProperty("name")
    private String name;

    @JsonProperty("img_logo_url")
    private String imgLogoUrl;
  }
}

