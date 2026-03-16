package com.pixelreel.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "xbox")
public record XboxProperties(
    boolean enabled,
    String baseUrl
) {}

