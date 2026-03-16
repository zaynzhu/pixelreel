package com.pixelreel.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "psn")
public record PsnProperties(
    boolean enabled,
    String baseUrl
) {}

