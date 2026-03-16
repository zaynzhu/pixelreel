package com.pixelreel.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "steam")
public record SteamProperties(
    boolean enabled,
    String baseUrl,
    String country,
    String language,
    Integer pageSize
) {}

