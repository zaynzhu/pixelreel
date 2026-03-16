package com.pixelreel.controller;

import com.pixelreel.dto.imports.ImportSummary;
import com.pixelreel.enums.RecordStatus;
import com.pixelreel.service.DoubanCsvImportService;
import com.pixelreel.service.OpenXblImportService;
import com.pixelreel.service.PsnProfilesImportService;
import com.pixelreel.service.RawgCoverFillService;
import com.pixelreel.service.SteamOwnedGamesImportService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/import")
@RequiredArgsConstructor
public class ImportController {
  private final DoubanCsvImportService doubanCsvImportService;
  private final SteamOwnedGamesImportService steamOwnedGamesImportService;
  private final OpenXblImportService openXblImportService;
  private final PsnProfilesImportService psnProfilesImportService;
  private final RawgCoverFillService rawgCoverFillService;

  @PostMapping("/douban")
  public ImportSummary importDouban(
      @RequestPart("file") MultipartFile file,
      @RequestParam(required = false) RecordStatus defaultStatus
  ) {
    return doubanCsvImportService.importCsv(file, defaultStatus);
  }

  @PostMapping("/steam/owned")
  public ImportSummary importSteamOwned(
      @RequestParam(required = false) String steamId,
      @RequestParam(required = false) RecordStatus status
  ) {
    return steamOwnedGamesImportService.importOwnedGames(steamId, status);
  }

  @PostMapping("/xbox/owned")
  public ImportSummary importXboxOwned(
      @RequestParam String gamertag,
      @RequestParam(required = false) RecordStatus status
  ) {
    return openXblImportService.importOwnedGames(gamertag, status);
  }

  @PostMapping("/psn/owned")
  public ImportSummary importPsnOwned(
      @RequestParam String psnId,
      @RequestParam(required = false) RecordStatus status
  ) {
    return psnProfilesImportService.importOwnedGames(psnId, status);
  }

  @PostMapping("/covers/fill")
  public ImportSummary fillMissingCovers(
      @RequestParam(required = false) Integer limit
  ) {
    return rawgCoverFillService.fillMissingCovers(limit);
  }
}

