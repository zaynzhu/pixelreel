package com.pixelreel.dto.profile;

import java.time.LocalDateTime;
import java.util.List;

public record ProfileSummaryResponse(
    Overview overview,
    RatingSummary ratings,
    List<CountItem> movieStatuses,
    List<CountItem> gameStatuses,
    List<CountItem> movieSources,
    List<CountItem> gamePlatforms,
    List<RecentRecordItem> recentItems
) {
  public record Overview(
      int totalRecords,
      int totalMovies,
      int totalGames,
      int completedMovies,
      int completedGames,
      int ratedRecords,
      int reviewedRecords,
      int importedGames
  ) {}

  public record RatingSummary(
      Double overallAverage,
      Double movieAverage,
      Double gameAverage
  ) {}

  public record CountItem(
      String key,
      String label,
      int count
  ) {}

  public record RecentRecordItem(
      String category,
      Long id,
      String title,
      String subtitle,
      String posterUrl,
      String status,
      Integer rating,
      LocalDateTime createdAt
  ) {}
}
