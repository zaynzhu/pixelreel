package com.pixelreel.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties({
    TmdbProperties.class,
    OmdbProperties.class,
    TraktProperties.class,
    DoubanProperties.class,
    ImdbProperties.class,
    SteamProperties.class,
    SteamWebApiProperties.class,
    PspricesProperties.class,
    XboxProperties.class,
    OpenXblProperties.class,
    PsnProfilesProperties.class,
    RawgProperties.class,
    PsnProperties.class,
    SwitchProperties.class
})
public class TmdbConfig {
  @Bean
  public RestClient tmdbRestClient(RestClient.Builder builder, TmdbProperties properties) {
    return builder.baseUrl(properties.baseUrl()).build();
  }

  @Bean
  public RestClient omdbRestClient(RestClient.Builder builder, OmdbProperties properties) {
    return builder.baseUrl(properties.baseUrl()).build();
  }

  @Bean
  public RestClient traktRestClient(RestClient.Builder builder, TraktProperties properties) {
    return builder.baseUrl(properties.baseUrl()).build();
  }

  @Bean
  public RestClient doubanRestClient(RestClient.Builder builder, DoubanProperties properties) {
    return builder.baseUrl(properties.baseUrl()).build();
  }

  @Bean
  public RestClient steamRestClient(RestClient.Builder builder, SteamProperties properties) {
    return builder.baseUrl(properties.baseUrl()).build();
  }

  @Bean
  public RestClient steamWebApiRestClient(RestClient.Builder builder, SteamWebApiProperties properties) {
    return builder.baseUrl(properties.baseUrl()).build();
  }

  @Bean
  public RestClient pspricesRestClient(RestClient.Builder builder, PspricesProperties properties) {
    return builder.baseUrl(properties.baseUrl()).build();
  }

  @Bean
  public RestClient openxblRestClient(RestClient.Builder builder, OpenXblProperties properties) {
    return builder.baseUrl(properties.baseUrl()).build();
  }

  @Bean
  public RestClient psnProfilesRestClient(RestClient.Builder builder, PsnProfilesProperties properties) {
    return builder.baseUrl(properties.baseUrl()).build();
  }

  @Bean
  public RestClient rawgRestClient(RestClient.Builder builder, RawgProperties properties) {
    return builder.baseUrl(properties.baseUrl()).build();
  }
}


