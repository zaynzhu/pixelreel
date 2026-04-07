package com.pixelreel.dto.library;

import com.pixelreel.enums.RecordStatus;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record LibraryRecordUpdateRequest(
    @NotNull RecordStatus status,
    @Min(0) @Max(10) Integer rating,
    @Size(max = 1000) String shortReview
) {
}
