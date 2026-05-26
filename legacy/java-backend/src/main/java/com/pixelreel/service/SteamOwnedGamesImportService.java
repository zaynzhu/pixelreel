package com.pixelreel.service;

import com.pixelreel.config.SteamWebApiProperties;
import com.pixelreel.dto.imports.ImportSummary;
import com.pixelreel.dto.steam.SteamOwnedGamesResponse;
import com.pixelreel.entity.Game;
import com.pixelreel.enums.RecordStatus;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

@Service
@RequiredArgsConstructor
public class SteamOwnedGamesImportService {
  private final GameService gameService;

  @Qualifier("steamWebApiRestClient")
  private final RestClient steamWebApiRestClient;

  private final SteamWebApiProperties steamProperties;

  public ImportSummary importOwnedGames(String steamId, RecordStatus status) {
    ImportSummary summary = new ImportSummary();
    summary.setErrors(new ArrayList<>());

    if (!steamProperties.enabled()) {
      summary.getErrors().add("Steam 未启用");
      return summary;
    }

    if (!StringUtils.hasText(steamProperties.apiKey())) {
      summary.getErrors().add("缺少 Steam Web API Key");
      return summary;
    }

    String effectiveSteamId = StringUtils.hasText(steamId) ? steamId : steamProperties.defaultSteamId();
    if (!StringUtils.hasText(effectiveSteamId)) {
      summary.getErrors().add("缺少 Steam ID");
      return summary;
    }

    SteamOwnedGamesResponse response = steamWebApiRestClient
        .get()
        .uri(uriBuilder -> uriBuilder
            .path("/IPlayerService/GetOwnedGames/v0001/")
            .queryParam("key", steamProperties.apiKey())
            .queryParam("steamid", effectiveSteamId)
            .queryParam("include_appinfo", 1)
            .build())
        .retrieve()
        .body(SteamOwnedGamesResponse.class);

    List<SteamOwnedGamesResponse.SteamOwnedGame> games = response == null || response.getPayload() == null
        ? Collections.emptyList()
        : Optional.ofNullable(response.getPayload().getGames()).orElse(Collections.emptyList());

    summary.setTotal(games.size());

    Map<Long, Game> existing = existingBySteamId(games);

    List<Game> toSave = new ArrayList<>();
    for (SteamOwnedGamesResponse.SteamOwnedGame owned : games) {
      if (owned.getAppId() == null || existing.containsKey(owned.getAppId())) {
        summary.setSkipped(summary.getSkipped() + 1);
        continue;
      }

      Game entity = new Game();
      entity.setSteamAppId(owned.getAppId());
      entity.setTitle(owned.getName());
      entity.setPosterUrl(buildSteamImageUrl(owned.getAppId(), owned.getImgLogoUrl()));
      entity.setStatus(status == null ? RecordStatus.WANT : status);
      entity.setRating(null);
      entity.setShortReview("");
      toSave.add(entity);
    }

    if (!toSave.isEmpty()) {
      gameService.saveBatch(toSave);
      summary.setImported(toSave.size());
    }

    return summary;
  }

  private Map<Long, Game> existingBySteamId(List<SteamOwnedGamesResponse.SteamOwnedGame> items) {
    List<Long> ids = items.stream()
        .map(SteamOwnedGamesResponse.SteamOwnedGame::getAppId)
        .filter(value -> value != null)
        .distinct()
        .toList();
    if (ids.isEmpty()) {
      return Collections.emptyMap();
    }
    return gameService.lambdaQuery()
        .in(Game::getSteamAppId, ids)
        .list()
        .stream()
        .collect(Collectors.toMap(Game::getSteamAppId, Function.identity(), (a, b) -> a));
  }

  private String buildSteamImageUrl(Long appId, String imgLogoUrl) {
    if (appId == null || !StringUtils.hasText(imgLogoUrl)) {
      return null;
    }
    return "https://media.steampowered.com/steamcommunity/public/images/apps/" + appId + "/" + imgLogoUrl + ".jpg";
  }
}


