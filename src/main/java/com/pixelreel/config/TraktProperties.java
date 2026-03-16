package com.pixelreel.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "trakt")
public record TraktProperties(
    boolean enabled,
    String baseUrl,
    String clientId,
    Integer apiVersion
) {}

