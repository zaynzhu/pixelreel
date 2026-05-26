package com.pixelreel.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "steam-webapi")
public record SteamWebApiProperties(
    boolean enabled,
    String baseUrl,
    String apiKey,
    Integer appListRefreshMinutes,
    Integer searchPageSize,
    String defaultSteamId
) {}


