package com.pixelreel.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "douban")
public record DoubanProperties(
    boolean enabled,
    String baseUrl,
    String apiKey
) {}

