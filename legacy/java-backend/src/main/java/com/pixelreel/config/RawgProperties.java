package com.pixelreel.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "rawg")
public record RawgProperties(
    boolean enabled,
    String baseUrl,
    String apiKey
) {}
