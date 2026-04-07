package com.pixelreel.controller;

import com.pixelreel.dto.profile.ProfileSummaryResponse;
import com.pixelreel.service.ProfileSummaryService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/profile")
@RequiredArgsConstructor
public class ProfileController {
  private final ProfileSummaryService profileSummaryService;

  @GetMapping("/summary")
  public ProfileSummaryResponse getSummary() {
    return profileSummaryService.getSummary();
  }
}
