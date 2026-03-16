package com.pixelreel.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "omdb")
public record OmdbProperties(
    boolean enabled,
    String baseUrl,
    String apiKey
) {}

