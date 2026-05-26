package com.pixelreel.dto.library;

import java.time.LocalDateTime;

public record LibraryRecordResponse(
    Long id,
    String category,
    String title,
    String posterUrl,
    String sourceKey,
    String sourceLabel,
    String platformLabel,
    String status,
    Integer rating,
    String shortReview,
    Integer playtimeMinutes,
    Integer achievementTotal,
    Integer achievementUnlocked,
    LocalDateTime createdAt,
    LocalDateTime updatedAt,
    LocalDateTime importedAt
) {
}
