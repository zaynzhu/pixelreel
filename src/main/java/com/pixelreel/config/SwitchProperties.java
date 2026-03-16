package com.pixelreel.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "switch")
public record SwitchProperties(
    boolean enabled
) {}

