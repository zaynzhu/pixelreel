package com.pixelreel.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "psnprofiles")
public record PsnProfilesProperties(
    boolean enabled,
    String baseUrl,
    String userAgent,
    String cookie
) {}
