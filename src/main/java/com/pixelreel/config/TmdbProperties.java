package com.pixelreel.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;
import jakarta.validation.constraints.NotBlank;

@Validated
@ConfigurationProperties(prefix = "tmdb")
public record TmdbProperties(
    boolean enabled,
    @NotBlank String apiKey,
    @NotBlank String baseUrl,
    @NotBlank String imageBaseUrl,
    String language
) {}


