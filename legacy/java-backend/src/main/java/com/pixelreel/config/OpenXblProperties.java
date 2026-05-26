package com.pixelreel.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "openxbl")
public record OpenXblProperties(
    boolean enabled,
    String baseUrl,
    String apiKey
) {}
