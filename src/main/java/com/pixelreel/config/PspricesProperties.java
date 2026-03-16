package com.pixelreel.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "psprices")
public record PspricesProperties(
    boolean enabled,
    String baseUrl,
    String apiKey,
    String region
) {}

