package com.pixelreel.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "imdb")
public record ImdbProperties(
    boolean enabled,
    String endpoint,
    String apiKey,
    String awsRegion,
    String awsAccessKeyId,
    String awsSecretAccessKey
) {}

