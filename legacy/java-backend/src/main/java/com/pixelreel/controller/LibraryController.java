package com.pixelreel.controller;

import com.pixelreel.dto.library.LibraryRecordResponse;
import com.pixelreel.dto.library.LibraryRecordUpdateRequest;
import com.pixelreel.service.LibraryService;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/library")
@RequiredArgsConstructor
public class LibraryController {
  private final LibraryService libraryService;

  @GetMapping
  public List<LibraryRecordResponse> list() {
    return libraryService.listRecords();
  }

  @PatchMapping("/{category}/{id}")
  public LibraryRecordResponse update(
      @PathVariable String category,
      @PathVariable Long id,
      @Valid @RequestBody LibraryRecordUpdateRequest request
  ) {
    return libraryService.updateRecord(category, id, request);
  }
}
